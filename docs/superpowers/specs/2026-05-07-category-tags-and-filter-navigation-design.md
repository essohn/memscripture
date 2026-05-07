# Category Tags & Filter Navigation — Design Spec

**Date:** 2026-05-07
**Status:** Draft → User review
**Scope:** `/library/[packageId]` — package detail page navigation, filtering, and `VerseCard` tag display.

## Goal

Make package categories discoverable and navigable through tag-based UI. Users should be able to:

1. Switch between packages quickly without going back to Library
2. See which categories each verse belongs to at a glance
3. Filter the verse list by series (level-1) and sub-categories (level-2)
4. Tap a tag on a verse and see all verses in the same category
5. Tap tags from `VerseCard` (verse detail) and jump to filtered package view

## Background — Data Model

Categories live in `static/data/packages_index.json` as flat `IndexGroup[]`:

```ts
interface IndexGroup {
  package_id: string;
  group_name: string;   // e.g., "A. 새로운 삶", "중심되신 그리스도"
  level: 1 | 2;
  index: number[];      // verse numbers (1-indexed within the package)
}
```

Per-package counts (verified):

| Package    | Level-1 | Level-2 | Notes                              |
| ---------- | ------- | ------- | ---------------------------------- |
| `5_krv`    | 1       | 0       | Single group — flat               |
| `8_krv`    | 1       | 0       | Single group — flat               |
| `60_krv`   | 5       | 30      | Full hierarchy                     |
| `100_krv`  | 9       | 0       | Series only, no sub-categories     |
| `180_krv`  | 5       | 15      | Full hierarchy                     |
| `242_krv`  | 8       | 44      | Full hierarchy                     |
| `900_krv`  | 8       | 119     | Full hierarchy, large level-2 fan-out |

A single verse can belong to multiple groups across both levels. Level-2 groups are conceptually nested under level-1 series via overlapping `index` ranges (level-1 indexes are a superset of the level-2 indexes inside them).

## User Experience

### Package detail page anatomy

```
┌─────────────────────────────────────────┐
│ Header (sticky)                         │
│   ← 그리스도와의 새출발 5구절    ⚙️    │
├─────────────────────────────────────────┤
│ Package tab strip (level-0 nav)         │
│   5구절 · 8구절 · [60구절] · 100구절 …  │
├─────────────────────────────────────────┤
│ Meta line (translation · count)         │
├─────────────────────────────────────────┤
│ Series sub-tab strip (level-1 filter)   │
│   [전체] · A. 새로운 삶 · B. 그리스도 … │
├─────────────────────────────────────────┤
│ Group sub-strip (level-2 multi-toggle)  │
│   SUB · [중심되신 그리스도] · 말 씀 …   │
├─────────────────────────────────────────┤
│ Verse list (filtered)                   │
│   ⓘ 1  중심되신 그리스도               │
│        [A. 새로운 삶][중심되신 …]      │
│        고후 5:17                       │
│   ⓘ 2  중심되신 그리스도  …            │
└─────────────────────────────────────────┘
```

### Three navigation strips

The page has three independent horizontal scroll strips. Each renders only when its data justifies it:

**Package tab strip** — always visible. Slim tab pattern (border-bottom-on-active), one tab per package using the abbreviation (`5구절`, `60구절`, `900구절`, …). Tapping navigates to `/library/<packageId>` and resets all filters.

**Series sub-tab strip** — visible when the current package has more than one level-1 group. Pill-style chips. First pill is `전체`. Single-selection. Tapping a series chip activates the level-1 filter; the level-2 strip below updates to show level-2 groups belonging to that series. `전체` (or no selection) hides the level-2 strip and shows all verses.

**Group sub-strip** — visible only when (a) a level-1 series is selected AND (b) the package has level-2 groups within that series. Pill-style chips with a small `SUB` label prefix. Multi-selection (toggle). Tapping a chip adds/removes that level-2 group from the active filter set.

### Filtering semantics

Active filter state has three components:

1. `seriesId` — selected level-1 group id (or null = "전체")
2. `groupIds` — set of selected level-2 group ids (within the selected series)
3. Verse list = all verses matching: package AND (no series filter OR series.index includes verse) AND (no group filter OR any selected group.index includes verse)

When `seriesId` changes:

- `groupIds` is cleared (level-2 selections are scoped to a series)
- The level-2 strip rebuilds with that series's level-2 groups

### Inline tags on verse rows

Each `verse-row` shows up to two tags below the title (level-1 first, then level-2). Tags use `font-size: 9.5px; padding: 2px 7px` so the row doesn't grow visually heavy. Wrap to a second line on narrow screens.

For each verse, the tags shown are derived from `IndexGroup.index` membership for that verse number — there is no explicit per-verse tag list in the data; we compute it.

**Tag click behavior:**

- Tap level-1 tag → activate that series sub-tab (single-selection, replaces current series)
- Tap level-2 tag → toggle that group in the level-2 strip (also activates the parent series if not already active)

This means tag taps converge with strip taps — there is one filter state, and clicking the tag merely is a shortcut to the same toggle.

### Edge cases by package shape

| Package           | Tab strip | Series strip | Group strip       | Inline tags              |
| ----------------- | --------- | ------------ | ----------------- | ------------------------ |
| `5_krv`, `8_krv`  | shown     | hidden       | hidden            | hidden (single category) |
| `100_krv`         | shown     | shown        | hidden (no L2)    | level-1 only             |
| `60`, `180`, …    | shown     | shown        | shown when series | both levels              |

The same components handle all cases by checking data shape; no per-package branching needed in route code.

### VerseCard (verse detail page) tag display

`/library/[packageId]/[verseNo]` already renders `VerseCard`. Add a tags row at the bottom of the card (after the body text), reusing the same tag visual.

- Tap tag → navigate to `/library/[packageId]?series=…&groups=…` with the tag's filter pre-applied
- Decorative oversized quote-mark element is removed (existing `.vc-quote` decoration)

## Architecture

### State & Routing

URL is the source of truth for filter state. Query params:

- `?series=<groupName>` — level-1 series filter (URL-encoded)
- `?groups=<groupName1>,<groupName2>` — level-2 group filters (comma-separated, URL-encoded)

Why `groupName` (not numeric id): the data has no stable numeric id; group_name is the natural key per (package, level).

State derived from URL:

```ts
const seriesId = $derived(page.url.searchParams.get('series') ?? null);
const groupIds = $derived(
  (page.url.searchParams.get('groups') ?? '').split(',').filter(Boolean)
);
```

Filter mutations use `goto()` with `replaceState: true` and `keepFocus: true` so back-button history isn't polluted by every chip toggle.

### Component breakdown

```
src/lib/components/
  nav/
    PackageTabStrip.svelte          NEW   — top tab strip
  filter/
    SeriesSubTabStrip.svelte        NEW   — level-1 series chips
    GroupSubStrip.svelte            NEW   — level-2 group chips
    CategoryTag.svelte              NEW   — single tag pill (used by row + verse card)
  GroupList.svelte                  EDIT  — accept filtered verses + tag display per row
  PackageCard.svelte                no change
  card/
    VerseCard.svelte                EDIT  — add tags slot, remove decorative quote
src/lib/db/verses.ts                EDIT  — add filter helper functions
src/routes/library/[packageId]/+page.svelte  EDIT  — wire URL → filter state → child strips
src/routes/library/[packageId]/[verseNo]/+page.svelte  EDIT  — wire tags into VerseCard
```

### Filter helpers in `verses.ts`

```ts
// New helpers — pure, no DB changes
export function tagsForVerse(
  groups: IndexGroup[],
  verseNo: number
): IndexGroup[];                     // returns groups whose .index includes verseNo

export function filterVerses(
  verses: StoredVerse[],
  groups: IndexGroup[],
  seriesId: string | null,
  groupIds: string[]
): StoredVerse[];

export function level2GroupsForSeries(
  groups: IndexGroup[],
  seriesId: string | null
): IndexGroup[];                     // intersect by index range; returns level-2 groups within series
```

Pure functions — easy to unit test, no Dexie calls.

### Visual tokens

Tag styling lives in `CategoryTag.svelte`. Two variants from existing tokens (no new theme tokens needed):

| Level | Background | Border | Text | Notes |
| ----- | ---------- | ------ | ---- | ----- |
| 1     | `--color-accent` (gold) | none | white | filled solid |
| 2     | `--color-accent-soft` (cream) | `--color-border` | `--color-text-secondary` | outlined |

Active state for filter chips on strips: dark `--color-text` background with white text — visually distinct from "available" tags on rows.

## Accessibility

- Tab strip: `<nav aria-label="패키지 선택">` wrapping `<a>` per package; active tab uses `aria-current="page"`.
- Sub-tab strip: `<div role="tablist">` with `role="tab"` buttons; active series uses `aria-selected="true"`. Chips are `<button>` with `aria-pressed` for the multi-select group strip.
- Inline tags on rows: avoid nested interactive elements (HTML disallows `<a>`/`<button>` inside `<a>`). Restructure the row from a single full-row `<a>` into two sibling interactive zones inside a non-interactive container:
  - `<a class="row-link">` wraps only the number badge + title + cite (navigates to verse detail).
  - `<div class="row-tags">` holds tag `<button>`s as separate controls; each tag button calls `goto()` to update URL.

  Use `aria-pressed` on tag buttons to reflect whether their filter is active. The two zones share visual padding so the row still reads as one card.
- All horizontal scrollers use `overflow-x: auto; overscroll-behavior-x: contain;` and remain keyboard-accessible (focus moves with arrow keys via native tab order).

## Tests

### Unit (Vitest)

- `tagsForVerse` — verse 1 of `60_krv` returns `[A. 새로운 삶, 중심되신 그리스도]`; verse 1 of `5_krv` returns single group; verse 1 of `100_krv` returns level-1 only.
- `filterVerses` — series filter only; series + groups filter; null series passes through.
- `level2GroupsForSeries` — level-2 list scoped to selected series; returns `[]` when series has no level-2 (e.g., `100_krv`).
- `CategoryTag.svelte` — renders correct level styling; emits click; respects `interactive={false}` for read-only display.
- `SeriesSubTabStrip.svelte` — does not render when `level1Groups.length <= 1`; renders `전체` chip first; active chip reflects URL state.
- `GroupSubStrip.svelte` — does not render when no level-2 in current series; multi-toggle adds/removes from URL.

### E2E (Playwright)

- `/library/60_krv`: series strip visible, group strip hidden initially, click `A. 새로운 삶` → group strip appears with that series's level-2s, verse count drops.
- `/library/60_krv?series=A.+새로운+삶&groups=중심되신+그리스도`: deep link renders correct filtered list.
- `/library/5_krv`: no series strip, no group strip, no inline tags on rows.
- `/library/100_krv`: series strip visible, no group strip even after series selection.
- Click level-1 tag on row in `60_krv` → series strip activates that series.
- Click level-2 tag on row → corresponding group strip chip activates.
- `VerseCard` tag tap navigates to filtered package detail.

## Out of Scope

- Filtering Today screen by category (Phase 3 SRS will revisit)
- Searching by group name (text search) — could come later
- Persisting last-selected filter per package across sessions
- Combining filters across different series (UX clarity > flexibility — series is single-select)
- Performance optimization — 900_krv with 119 level-2s rendered as a strip is fine via `overflow-x: auto`; no virtualization needed at this scale

## Open Questions Resolved During Brainstorming

- ✅ Tag placement: inline on each verse row (option B), small size
- ✅ Package switcher: tab strip with abbreviation
- ✅ Sub-tab behavior: filter mode (not anchor scroll)
- ✅ Active level-2 filter UI: second sub-strip auto-exposed when series selected (option B)
- ✅ Color palette: gold (L1) + cream outlined (L2) — paper aesthetic
- ✅ VerseCard tags: shown at card bottom, clickable
- ✅ Decorative quote on VerseCard: removed
