# Show Verse Text in List — Design Spec

**Date:** 2026-05-09
**Status:** Draft → User review
**Scope:** `GroupList.svelte`, `library/[packageId]/+page.svelte`, new `db/viewOptions.ts`. Adds an inline toggle on the package detail list that shows or hides the full Bible verse body under each row's cite. Default ON.

## Goal

Today the verse list in `/library/[packageId]` shows only the verse number, title, and cite (e.g., "요한복음 3:16") — but not the actual scripture body. Users currently must tap into each verse to see what it says, which makes browsing and recognition awkward.

This change displays the full body text (`v.w`) under the cite line by default, and gives users a single-tap inline toggle to hide it when they want a denser scan view. The preference persists across sessions and across packages.

## User Experience

### Layout

```
┌─ Verse list row (showVerseTextInList = true, default) ────────────┐
│  ⚪ 1   중심되신 그리스도                                  ›       │
│        고후 5:17                                                  │
│        그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라     │
│        이전 것은 지나갔으니 보라 새 것이 되었도다                 │
│        [tag] [tag]                                                │
└───────────────────────────────────────────────────────────────────┘

┌─ Same row (showVerseTextInList = false) ──────────────────────────┐
│  ⚪ 1   중심되신 그리스도                                  ›       │
│        고후 5:17                                                  │
│        [tag] [tag]                                                │
└───────────────────────────────────────────────────────────────────┘
```

### Toggle

- Lives in the existing meta row that shows "{filteredVerses.length} / {verses.length}개", on the right edge of that row
- Icon button: lucide `Eye` (when shown) / `EyeOff` (when hidden), 18px
- `aria-pressed` reflects state; `aria-label` is "구절 본문 표시 끄기" / "구절 본문 표시 켜기"
- Tap toggles the state immediately — no confirmation, no animation needed beyond the icon swap
- Hover/focus styling reuses existing `var(--color-text-secondary) → var(--color-text)` pattern

### Verse body styling

- Sits between the cite line and the tag chips (under `cite`, above `tags`)
- 13px / `var(--color-text-secondary)` / `line-height: 1.55`
- No truncation, no `line-clamp` — full text wraps naturally
- Margin: `mt-1` from cite, `mt-2` to tags when both present
- Renders only when `showVerseTextInList === true` AND `v.w` is non-empty

## Architecture

### New module: `src/lib/db/viewOptions.ts`

Mirrors the shape and conventions of `src/lib/db/recent.ts`:

```ts
const KEY = 'view_options';

interface ViewOptions {
  showVerseTextInList: boolean;
}

const DEFAULTS: ViewOptions = {
  showVerseTextInList: true
};

async function readOptions(): Promise<ViewOptions> { /* merge stored over DEFAULTS, validate types */ }

export async function getShowVerseTextInList(): Promise<boolean>
export async function setShowVerseTextInList(v: boolean): Promise<void>
```

**Why an object value, not a flat key per option:** future view options (font size, tag visibility, default series, …) can extend `ViewOptions` without polluting the `settings` keyspace. `readOptions` always merges over `DEFAULTS` so adding a field doesn't require a migration — old records just lack that field and pick up the new default.

**Validation:** `readOptions` checks each field's type before returning. Anything unexpected falls back to `DEFAULTS[key]`. This avoids crashes if the user (or a future bug) writes a malformed value.

### `GroupList.svelte`

Adds one prop:

```ts
interface Props {
  // ...existing props
  showVerseText: boolean;
}
```

Render the body conditionally between the cite `<p>` and the tags block:

```svelte
{#if showVerseText && v.w}
  <p class="mt-1 text-[13px] leading-[1.55] text-[var(--color-text-secondary)]">
    {v.w}
  </p>
{/if}
```

Component remains presentation-only — it does not read or write the setting itself. The parent owns state.

### `library/[packageId]/+page.svelte`

- Add `let showVerseText = $state(true)` — initial value is the default, so first paint is correct even before Dexie resolves
- Inside the existing mount `$effect`, call `getShowVerseTextInList()` and assign the result
- Add `function toggleVerseText() { showVerseText = !showVerseText; setShowVerseTextInList(showVerseText).catch(() => {}); }` — fire-and-forget save, optimistic UI
- Render the toggle button inside the existing meta row, right-aligned (use `ml-auto` on the button so the existing left-aligned content stays put)
- Pass `showVerseText` down to `<GroupList>`

## Data Flow

```
Mount /library/[packageId]
  └─ $effect runs
       ├─ loadPackageData()  ──▶  verses, groups, tags
       └─ getShowVerseTextInList() ──▶ showVerseText

User taps Eye/EyeOff
  └─ toggleVerseText()
       ├─ showVerseText = !showVerseText      (UI updates immediately)
       └─ setShowVerseTextInList(next)         (fire-and-forget Dexie write)

Navigate to another package (same component instance reused)
  └─ $effect runs again
       └─ getShowVerseTextInList() returns persisted value
```

## Error Handling

- `getShowVerseTextInList()` returning a rejected promise → caller swallows and falls back to default `true`. The toggle still works in-memory; only persistence is degraded.
- `setShowVerseTextInList(...)` rejecting → swallow silently. The user's tap already updated the UI; the next session reverts, which is acceptable for a view preference.
- A malformed stored value → `readOptions` validates types and substitutes the default. No user-visible error.

## Testing

**Unit (`src/lib/db/viewOptions.test.ts`, Vitest + fake-indexeddb):**
- `getShowVerseTextInList()` returns `true` when no record exists
- Round trip: `setShowVerseTextInList(false)` → `getShowVerseTextInList()` returns `false`
- Round trip back: `setShowVerseTextInList(true)` → returns `true`
- Stored value of wrong type (e.g., `"yes"`) → `getShowVerseTextInList()` returns the default `true`
- Future-proof: writing one field doesn't drop other fields in the stored object (write `setShowVerseTextInList(false)` after seeding `view_options` with extra keys, confirm extras still present)

**Component (`src/lib/components/GroupList.test.ts`, @testing-library/svelte):**
- `showVerseText={true}` renders `v.w` text
- `showVerseText={false}` does not render `v.w`
- `showVerseText={true}` but `v.w === ''` does not render an empty paragraph

**E2E:** skipped — existing `tests/memorize.spec.ts` covers the deeper flow; this is shallow UI behavior already covered by the component tests above.

## Out of Scope (YAGNI)

- Same toggle in `/settings` — Settings is still a stub. Add when Settings gets its real treatment.
- Per-package override — one global preference is enough.
- Animated show/hide transition — instant toggle is fine and matches the rest of the app.
- Font size / line-height controls — not requested.
- Hiding the cite line, the tags, or the verse number — not requested.
