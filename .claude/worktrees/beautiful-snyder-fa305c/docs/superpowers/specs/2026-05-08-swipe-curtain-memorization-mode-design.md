# Swipe Curtain Memorization Mode — Design Spec

**Date:** 2026-05-08
**Status:** Draft → User review
**Scope:** `VerseCard.svelte` — replaces the existing tap-to-reveal-clauses memorize mode with a swipe-based "curtain drag" that progressively reveals individual words.

## Goal

Replace the chunk-by-chunk tap-reveal interaction with one that feels more natural for active recall: the verse paragraph is shown in its full layout, but every word is masked by a striped placeholder of the same width. Dragging horizontally across the card moves a curtain that reveals words in reading order. The user controls reveal speed and granularity directly with their finger.

## Why this design

The previous mode hid the verse body wholesale and grew it back in clause-sized chunks. Two problems:

1. **No layout context.** The user couldn't see how long the verse was, where line breaks fell, or how words were grouped — they faced a blank cue area each time.
2. **Coarse granularity.** Even after merging short clauses (`minChunkChars = 10`), each tap exposed multiple words at once. A user testing "do I remember the next word" couldn't peek one word at a time.

The new design preserves the original paragraph shape (every word's footprint is reserved by a same-width box) and gives word-level granularity through a continuous gesture instead of discrete taps.

## User Experience

### Modes

The default `read` mode is unchanged — full text visible, "암송 시작" pill button at the bottom-right.

Tapping "암송 시작" enters the new memorize mode:

- The same paragraph is rendered, with each word wrapped in a span.
- Every word's text is hidden behind a striped pattern overlay sized to the word's bounding box.
- A subtle hint "→ 좌→우로 드래그해서 단어를 열어보세요" appears once below the paragraph; it fades out after the first drag.
- Mode controls (처음부터 다시 · 전체 보기 · ✕) are unchanged.

### Box visual style

Each covered word renders a striped diagonal pattern overlay (135° lines, alternating cream tones from the existing palette: `--color-border` and `--color-accent-soft`). The overlay covers the word's character box exactly — same width, same height — so the paragraph's line wraps and overall layout stay identical to read mode. Border-radius: 4px.

When a word is revealed, its overlay is removed and the original text appears. The transition is a 150ms cross-fade (overlay opacity 1 → 0 while text opacity 0 → 1).

### Drag mechanic

The interaction model is a **relative scrub**:

- `onPointerDown(event)` — capture the pointer; store `startX = event.clientX` and `baseline = revealedCount`.
- `onPointerMove(event)` — compute `deltaX = event.clientX - startX`; set `revealedCount = clamp(0, totalWords, baseline + Math.round(deltaX / pxPerWord))`.
- `onPointerUp` / `onPointerCancel` — release pointer capture; `revealedCount` remains at its last value.

**Within a single gesture:** dragging right increments revealed count; dragging left decrements (the user can scrub back if they overshoot). **Across gestures:** state is cumulative — the next drag picks up where the previous left off, since `baseline` is recalculated to the current `revealedCount` at each `onPointerDown`.

**`pxPerWord`** is computed from the actual paragraph layout: divide the paragraph's bounding-box width by `totalWords`. This means dragging across the full visible width of the card reveals all words. The value is recomputed once per memorize-mode entry (not per drag) using `ResizeObserver` so resizes during a session also adjust.

**Pointer events, not touch events:** modern browsers (including iOS Safari 13+) support `PointerEvent` uniformly for mouse and touch. Capturing the pointer ensures the gesture works even if the finger crosses outside the card's bounding box mid-drag.

**Vertical drags:** ignored. We only update `revealedCount` based on horizontal delta. This avoids accidental reveals during page scroll. To distinguish: if `|deltaY| > |deltaX|` at the first move event AND `|deltaY| > 8px`, release pointer capture and let the page scroll naturally.

### Reveal order: reading order, not curtain x-position

Words reveal in document order (left-to-right, top-to-bottom). The drag distance maps to a **count** of revealed words, not to a spatial curtain edge. So even on a multi-line paragraph, a single horizontal drag from the left edge to the right edge reveals every word in order.

This deliberately departs from a literal curtain (where finger.x would equal the visual edge) because:

- Korean Bible verses wrap to 3-5 lines on mobile — a literal curtain at finger.x would only affect the line the finger is on.
- A single horizontal drag is the natural input gesture; mapping it to "progress through the verse" gives the most predictable result.

### Mode controls (unchanged)

| Control | Behavior |
| ------- | -------- |
| 처음부터 다시 | Reset `revealedCount` to 0 (or `totalWords` for single-word verses). All boxes return. |
| 전체 보기 | Set `revealedCount` to `totalWords`. All boxes vanish. Useful as escape hatch. |
| ✕ (암송 종료) | Exit to read mode. `revealedCount` resets to 0 internally. |

### Per-mount fresh state

State is local to the component. Navigating away and back enters read mode with `revealedCount = 0`. (Same as the previous design — Phase 3 SRS will revisit persistence.)

### Edge cases

- **Single-word verses** — `totalWords <= 1`. `enterMemorize` sets `revealedCount = totalWords` immediately, so the word is shown plain (no box, no drag affordance). Mode controls remain functional. The hint text is suppressed.
- **Empty verse text** — should never happen for installed packages, but if it does, render an empty paragraph and the existing controls only.
- **Punctuation** — the verse data has very little punctuation in the Korean Bible packages. We split the text by whitespace (`\s+`) into "words". Each token (including any trailing punctuation) becomes one word and gets one box.
- **Long single word** — covered word boxes always match the word's actual rendered width via inline-block layout, regardless of word length.

## Architecture

### Components

`VerseCard.svelte` is the only component changing. The previous `splitVerseText`-driven chunk reveal is replaced with word-by-word logic. The pure helper at `src/lib/utils/chunk.ts` is **kept** because it's still useful and unit-tested — but it's no longer imported by `VerseCard`. (Future use: per-package "chunk preview" or summaries. Removing it now is YAGNI deletion of a working pure function. Leave it in place.)

### Word splitting helper — extend `src/lib/utils/chunk.ts`

Add a sibling helper that splits at whitespace only (no clause-ending heuristic):

```ts
/**
 * Split a verse body into individual whitespace-delimited words.
 * Each token (including any trailing punctuation) becomes one item.
 * Empty/whitespace-only input returns [].
 */
export function splitVerseWords(text: string): string[];
```

This is a 3-line wrapper around `text.trim().split(/\s+/).filter(Boolean)`. We add it to `chunk.ts` for cohesion (the file becomes "verse text utilities", not just chunking) — alternatives like a separate `words.ts` would split related logic for trivially small functions.

### State in VerseCard

Replace the existing memorize-mode state:

```ts
let mode: 'read' | 'memorize' = $state('read');
let revealedCount = $state(0);

const words = $derived(splitVerseWords(verse.w));
const totalWords = $derived(words.length);
const allRevealed = $derived(revealedCount >= totalWords);

// pxPerWord is reactive but only recomputed on mount + resize, not every render
let pxPerWord = $state(36); // sensible default; overwritten on first measure
```

Handlers:

- `enterMemorize()` — `mode = 'memorize'`. If `totalWords <= 1`, set `revealedCount = totalWords` (single-word fast path).
- `resetReveal()` — `revealedCount = totalWords <= 1 ? totalWords : 0`.
- `revealAll()` — `revealedCount = totalWords`.
- `exitMemorize()` — `mode = 'read'; revealedCount = 0`.

Pointer handlers (only active in memorize mode, attached to the paragraph element):

```ts
let dragBaseline = 0;
let dragStartX = 0;
let dragStartY = 0;
let dragActive = false;
let dragHorizontal = false; // locked to horizontal once we've decided

function onPointerDown(e: PointerEvent) {
	dragBaseline = revealedCount;
	dragStartX = e.clientX;
	dragStartY = e.clientY;
	dragActive = true;
	dragHorizontal = false;
	(e.currentTarget as Element).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
	if (!dragActive) return;
	const dx = e.clientX - dragStartX;
	const dy = e.clientY - dragStartY;

	// Direction lock: until we've moved enough to decide, don't update.
	// Once locked horizontal, ignore vertical component for the rest of the gesture.
	if (!dragHorizontal) {
		if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
			// Vertical-leaning gesture — release so the page can scroll
			dragActive = false;
			(e.currentTarget as Element).releasePointerCapture(e.pointerId);
			return;
		}
		if (Math.abs(dx) < 4) return; // not enough movement yet
		dragHorizontal = true;
	}

	revealedCount = Math.max(
		0,
		Math.min(totalWords, dragBaseline + Math.round(dx / pxPerWord))
	);
}

function onPointerUp(e: PointerEvent) {
	dragActive = false;
	if ((e.currentTarget as Element).hasPointerCapture(e.pointerId)) {
		(e.currentTarget as Element).releasePointerCapture(e.pointerId);
	}
}
```

The 4px deadzone before locking direction prevents jitter; the 8px vertical threshold lets short flicks scroll the page while real horizontal drags stay captured.

### Layout & rendering

In memorize mode, the paragraph is rendered as a sequence of word spans. Each word is an `<span class="word">` with two children: the actual text and a striped overlay. The text is always in the DOM (preserves layout via `<span>`'s natural inline-block behavior) but its visibility flips based on the word's index vs. `revealedCount`:

```svelte
<p class="paragraph" onpointerdown={onPointerDown} onpointermove={onPointerMove}
   onpointerup={onPointerUp} onpointercancel={onPointerUp}>
  {#each words as word, i (i)}
    <span class="word" class:covered={i >= revealedCount}>
      <span class="word-text">{word}</span>
    </span>
  {' '}
  {/each}
</p>
```

CSS:

```css
.word {
  display: inline-block;
  position: relative;
}
.word-text {
  transition: opacity 150ms ease;
}
.word.covered .word-text {
  opacity: 0;
}
.word.covered::after {
  content: '';
  position: absolute;
  inset: 6% 0;
  border-radius: 4px;
  background: repeating-linear-gradient(
    135deg,
    var(--color-border),
    var(--color-border) 4px,
    var(--color-accent-soft) 4px,
    var(--color-accent-soft) 8px
  );
  transition: opacity 150ms ease;
  opacity: 1;
}
.word:not(.covered)::after {
  opacity: 0;
}
```

`pxPerWord` measurement:

```ts
let paragraphEl: HTMLParagraphElement;

$effect(() => {
  if (mode !== 'memorize') return;
  if (!paragraphEl) return;
  const ro = new ResizeObserver(() => {
    if (totalWords > 0) {
      pxPerWord = paragraphEl.getBoundingClientRect().width / totalWords;
    }
  });
  ro.observe(paragraphEl);
  return () => ro.disconnect();
});
```

This runs on memorize-mode entry and tears down on exit.

### What's removed

- Chunk reveal UI: the cue-area button and progressive paragraph rendering.
- The clause-based chunking call in VerseCard.

`splitVerseText` and its tests stay in `chunk.ts`. The function is unused but exported and tested — it costs nothing to leave it for potential future use.

## Tests

### Unit (Vitest)

- `splitVerseWords('너는 마음을 다하여')` → `['너는', '마음을', '다하여']`.
- `splitVerseWords('')` → `[]`.
- `splitVerseWords('  hello   world  ')` → `['hello', 'world']`.
- `VerseCard.svelte`:
  - Default mode is read; full body visible.
  - "암송 시작" → all 13 word spans render with `covered` class.
  - Programmatically set `revealedCount = 3` (via mocked drag or by exposing a test hook) → first 3 word spans have `covered=false`, rest still covered.

  Component tests for the actual drag gesture are limited because jsdom doesn't fire real PointerEvents reliably with capture semantics. The component tests cover state-driven render only; gesture behavior is covered by E2E.

  - "처음부터 다시" → all spans become covered again.
  - "전체 보기" → all spans uncovered.
  - "암송 종료" → returns to read-mode `<p>` rendering.
  - Single-word verse: enterMemorize shows the word uncovered; no covered spans exist; 전체 보기 hidden.

### E2E (Playwright)

Playwright has full pointer-event support:

- `/library/5_krv/5`:
  - Body visible by default.
  - Click "암송 시작" → expect 13 covered word spans (use `.word.covered` count).
  - Use `page.mouse.move` + `page.mouse.down` + `page.mouse.move` + `page.mouse.up` to simulate a drag from card-left to ~30% across, then assert that 3-4 words are now uncovered (count `.word:not(.covered)`).
  - Drag back leftward → words re-cover.
  - "전체 보기" → 0 covered spans.
  - "처음부터 다시" → 13 covered spans.
  - "암송 종료" → body visible again as a single paragraph.

## Out of Scope

- Persisting `revealedCount` across navigation (Phase 3 SRS).
- Self-rating buttons after reveal (Phase 3 SRS).
- Custom drag-distance-per-word configuration (use computed default).
- Animation of the curtain edge or visual indicator of drag progress beyond the boxes themselves.
- Word-level click-to-reveal (only drag is supported; controls offer the only alternative).
- Reading-mode → memorize-mode animation.

## Open Questions Resolved During Brainstorming

- ✅ Mechanic: A (curtain drag on the card), reading-order word reveal mapped from horizontal delta.
- ✅ Box style: C (striped diagonal pattern, 135°, cream tones).
- ✅ Granularity: per-word.
- ✅ Drag model: relative scrub — bidirectional within a gesture, cumulative across gestures.
- ✅ Reveal animation: 150ms cross-fade.
- ✅ Vertical drag handling: release capture if `|dy| > |dx|` and let page scroll.
- ✅ Controls: 처음부터 다시 / 전체 보기 / 암송 종료 unchanged.
- ✅ `splitVerseText` (clause helper) is kept in `chunk.ts` (still tested) but no longer imported by VerseCard.
