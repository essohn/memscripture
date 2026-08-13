# Progressive Reveal Memorization Mode — Design Spec

**Date:** 2026-05-08
**Status:** Draft → User review
**Scope:** `VerseCard.svelte` — adds an in-card "암송 모드" that hides verse body and progressively reveals clause-sized chunks on tap.

## Goal

Help users actively recall a verse from memory by hiding its body and revealing it one clause at a time. The user enters the verse detail page in read mode (full text), taps "암송 시작" to switch to memorize mode (body hidden, cite still visible), then taps a cue area to reveal one chunk per tap until all are shown.

This is a single-screen, single-card feature — no new routes, no persistent SRS state. Phase 3 (SRS) will reuse and extend it.

## User Experience

### Modes

```
┌─ Read mode (default) ─────────────┐
│ 60구절 #1                         │
│ 중심되신 그리스도                 │
│ — 고후 5:17                       │
│                                   │
│ 그런즉 누구든지 그리스도 안에 있  │
│ 으면 새로운 피조물이라 …          │
│                                   │
│ [tag chips]                       │
│                  ┌──────────────┐ │
│                  │ 암송 시작    │ │
│                  └──────────────┘ │
└───────────────────────────────────┘

  ↓ tap "암송 시작"

┌─ Memorize mode (hidden) ──────────┐
│ 60구절 #1                         │
│ 중심되신 그리스도                 │
│ — 고후 5:17                       │
│                                   │
│ ┌───────────────────────────────┐ │
│ │  구절을 떠올려보세요          │ │
│ │  탭하면 첫 부분이 보여요      │ │
│ └───────────────────────────────┘ │
│                                   │
│  처음부터 다시 · 전체 보기 ·  ✕  │
└───────────────────────────────────┘

  ↓ tap cue area (1/N → 2/N → … → N/N)

┌─ Memorize mode (partial) ─────────┐
│ 60구절 #1                         │
│ 중심되신 그리스도                 │
│ — 고후 5:17                       │
│                                   │
│ 그런즉 누구든지 그리스도 안에 있  │
│ 으면                              │
│                                   │
│ ┌───────────────────────────────┐ │
│ │  탭해서 다음 부분 보기 →     │ │
│ └───────────────────────────────┘ │
│                                   │
│  처음부터 다시 · 전체 보기 ·  ✕  │
└───────────────────────────────────┘
```

### Default mode: read

When the user navigates to `/library/[packageId]/[verseNo]`, the card mounts in **read mode**. Full body is shown. A small "암송 시작" button is visible at the bottom-right of the card or alongside the existing tag area.

This default favors quick reading / lookup. Memorization is opt-in.

### Entering memorize mode

Tap "암송 시작" → the body collapses and a single tap-cue area takes its place: "구절을 떠올려보세요. 탭하면 첫 부분이 보여요." The cite, eyebrow, number badge, title, and tags remain visible. Mode-control buttons appear: `처음부터 다시 · 전체 보기 · ✕(암송 종료)`.

### Revealing chunks

Tap the cue area → the first chunk appears as a paragraph. The cue text updates to "탭해서 다음 부분 보기 →" and stays at the bottom of the revealed chunks. Each subsequent tap appends the next chunk. When the last chunk is revealed, the cue area disappears and the body now shows the complete verse text. The bottom controls remain.

**Pure sequential** (no length hints): hidden chunks are not represented visually — the user faces a blank cue and recalls from cold memory.

### Mode controls

| Control | Behavior |
| ------- | -------- |
| 처음부터 다시 | Reset `revealedCount` to 0. Body collapses; cue returns. Mode stays as memorize. |
| 전체 보기 | Set `revealedCount` to `chunks.length`. All chunks appear. Mode stays as memorize. (Useful as an escape hatch mid-memorization.) |
| ✕ (암송 종료) | Exit to read mode. Resets `revealedCount` to 0 internally for next entry. |

### Per-mount fresh state

State is owned by the component, not persisted. Navigating away and back to the same verse re-enters read mode with `revealedCount = 0`. This keeps the model simple; SRS-driven persistence is deferred to Phase 3.

## Architecture

### Chunking — `src/lib/utils/chunk.ts` (new)

Pure function that splits a verse string into clause-aligned chunks, with a length-based fallback when the primary heuristic underperforms.

```ts
/**
 * Split a verse body into recall chunks.
 *
 * Primary: split at Korean clause endings (-다, -라, -고, -며, -니) followed by whitespace.
 * Fallback: if primary yields fewer than 2 chunks OR any chunk longer than MAX_CHUNK_CHARS,
 *           fall back to length-based grouping at whitespace boundaries.
 */
export function splitVerseText(text: string, maxChunkChars?: number): string[];
```

**Algorithm:**

1. Trim input. If empty, return `[]`.
2. Split via regex `/(?<=[다라고며니])\s+/g`.
3. If `parts.length >= 2` AND every `part.length <= maxChunkChars` (default 40), return `parts`.
4. Otherwise, fall back: walk the trimmed text, accumulating words separated by `\s+`, starting a new chunk whenever the current chunk would exceed `maxChunkChars`. Returns at least one chunk.

**Edge cases:**

| Input | Output |
| ----- | ------ |
| `''` or whitespace-only | `[]` |
| Single short clause (no terminal endings) | `[text]` |
| Very long clause that beats fallback length | Length-based chunks |
| Already broken into 4-5 nice clauses | Clause-split result |

### Mode + reveal state — `VerseCard.svelte`

Two pieces of internal state:

```ts
let mode: 'read' | 'memorize' = $state('read');
let revealedCount = $state(0);
```

Derived:

```ts
const chunks = $derived(splitVerseText(verse.w));
const allRevealed = $derived(revealedCount >= chunks.length);
const visibleChunks = $derived(chunks.slice(0, revealedCount));
```

Event handlers:

- `enterMemorize()` → `mode = 'memorize'; revealedCount = 0;`
- `revealNext()` → `revealedCount = Math.min(chunks.length, revealedCount + 1);`
- `resetReveal()` → `revealedCount = 0;`
- `revealAll()` → `revealedCount = chunks.length;`
- `exitMemorize()` → `mode = 'read'; revealedCount = 0;`

When `chunks.length <= 1` (single-chunk verse), entering memorize mode immediately reveals the only chunk — no "tap to reveal" UI shown. The mode toggle still works for consistency, but functionally indistinguishable from read mode.

### Markup states (rough)

```svelte
{#if mode === 'read'}
  <p class="…body…">{verse.w}</p>
{:else}
  <!-- memorize mode: render chunks separately even when all revealed,
       to keep visual rhythm consistent with the reveal experience -->
  {#each visibleChunks as chunk}
    <p class="…chunk…">{chunk}</p>
  {/each}
  {#if !allRevealed}
    <button class="cue-area" onclick={revealNext}>
      {revealedCount === 0 ? '구절을 떠올려보세요. 탭하면 첫 부분이 보여요.' : '탭해서 다음 부분 보기 →'}
    </button>
  {/if}
{/if}

<!-- Controls -->
{#if mode === 'read'}
  <button onclick={enterMemorize}>암송 시작</button>
{:else}
  <button onclick={resetReveal}>처음부터 다시</button>
  {#if !allRevealed}<button onclick={revealAll}>전체 보기</button>{/if}
  <button onclick={exitMemorize} aria-label="암송 종료">✕</button>
{/if}
```

**Note on visual rhythm:** Memorize mode renders each chunk as its own paragraph even after all are revealed. We don't switch back to a single block — that would feel like the screen "snapped back" and lose the sense of progress.

**Single-chunk fallback:** When `chunks.length <= 1` (e.g., a very short verse the splitter couldn't break), `enterMemorize` sets `revealedCount = 1` immediately so the body appears in full without showing a useless cue. The mode toggle still functions (so the user can compare layouts), but functionally indistinguishable from read mode.

(Final styling will use existing CategoryTag/CategoryCard tokens; visual polish in implementation.)

### Visual design notes

- **Cue area:** dashed border with `--color-accent` and soft `--color-accent-soft` background. Mimics the existing tag-strip toggle aesthetic but at a different scale (taller, more inviting).
- **Chunks during reveal:** plain paragraphs with the same `text-[17px] leading-[1.85]` as the existing body, separated by small vertical rhythm. No card wrappers — keeps the verse feeling like one continuous text.
- **Mode controls:** small underlined links beneath the body, separated by middots. The `✕` close icon for "암송 종료" is right-aligned.
- **"암송 시작" button (read mode):** small pill in the card's bottom-right corner with the gold accent, adjacent to (not below) the tags row.
- **No celebration / completion animation** in v1. When the last chunk is revealed, the cue simply disappears.

## Tests

### Unit (Vitest)

- `splitVerseText('너는 마음을 다하여 여호와를 의뢰하고 네 명철을 의지하지 말라 너는 범사에 그를 인정하라 그리하면 네 길을 지도하시리라')` → 4 chunks ending with `의뢰하고`, `말라`, `인정하라`, `지도하시리라`.
- `splitVerseText('짧은 한 문장')` → 1 chunk (length OK, no terminal ending).
- `splitVerseText('')` → `[]`.
- `splitVerseText` on a long contiguous text without terminal endings → falls back to length-based, every chunk ≤ 40 chars.
- `splitVerseText` on text where one clause is very long → falls back to length-based.
- `VerseCard.svelte`:
  - Default mode is read; full body visible.
  - Click "암송 시작" → cue visible, body chunks not yet rendered.
  - Click cue → first chunk renders.
  - Click cue 4 times on a 4-chunk verse → all chunks visible, cue removed.
  - Click "처음부터 다시" → chunks gone, cue returns.
  - Click "전체 보기" → all chunks visible, cue removed.
  - Click "암송 종료" → mode returns to read, full body visible.

### E2E (Playwright)

- `/library/60_krv/1`:
  - Body is initially visible.
  - "암송 시작" button visible. Click it.
  - Body text is no longer visible; cue text "탭해서 첫 부분 보기" or "구절을 떠올려보세요" visible.
  - Click cue → first chunk visible.
  - Click cue repeatedly → more chunks revealed.
  - Click "처음부터 다시" → cue back, no chunks.
  - Click "전체 보기" → all chunks visible at once.
  - Click "암송 종료" → mode is read, body visible.

## Out of Scope

- Persistence of mode or `revealedCount` across navigations
- Per-verse memorization progress in IndexedDB
- Auto-advance to next verse when finished
- Self-rating buttons (잘함 / 틀림) — Phase 3 SRS
- First-letter / shadowed-text hint modes
- Animations beyond the default Tailwind transitions
- Different chunking strategies per package or per language
- Customizing chunk size from settings

## Open Questions Resolved During Brainstorming

- ✅ Chunking unit: clause-based primary (-다/라/고/며/니), length-based fallback for outliers.
- ✅ Reveal pattern: pure sequential (no length-hint placeholders) — minimalist + cold recall.
- ✅ Default mode: read (full text visible). Memorization is opt-in via "암송 시작".
- ✅ State persistence: per-mount fresh state. No IndexedDB.
- ✅ Controls: 처음부터 다시, 전체 보기, 암송 종료 (✕).
