# Memorize Typing Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Type a verse from memory against a timer and have both difficulty ratings proposed from the result, with a confirmation step whenever the attempt was not perfect.

**Architecture:** Two pure modules hold everything worth testing — normalization + Levenshtein grading, and elapsed-time banding. A panel component owns the timer, the input and the confirmation; `VerseCard` mounts it under the curtain and forwards the results through the rating callbacks it already receives.

**Tech Stack:** SvelteKit 2 (runes), TypeScript, Vitest + @testing-library/svelte.

**Spec:** `docs/superpowers/specs/2026-08-10-memorize-typing-check-design.md`

## Global Constraints

- **No new npm dependencies.** Levenshtein is ~20 lines; do not add a library.
- Korean user-facing copy; English code comments explaining **why**, not what.
- **This repo has no Prettier config.** Match neighbouring files: tab indentation, single quotes, semicolons. Do NOT run `npx prettier` — it reformats to its own defaults.
- Svelte 5 runes (`$state`, `$derived`, `$props`, `$effect`). Read the file you are editing and follow its idiom.
- Component tests drive interactions with `fireEvent` from `@testing-library/svelte`. `@testing-library/user-event` is NOT installed.
- Cross-directory imports use `$lib/...`; same-directory use `./`; tests import relatively (`../../src/lib/...`).
- Every task ends green: `pnpm test` passes and `pnpm check` reports **0 errors** with no more than the 5 pre-existing warnings.

---

### Task 1: Grading module

**Files:**
- Create: `src/lib/memorize/grade.ts`
- Test: `tests/unit/grade.test.ts`

**Interfaces:**
- Consumes: `DifficultyLevel` from `$lib/db/verseRatings` (type-only).
- Produces:
  - `normalizeForGrading(text: string): string`
  - `levenshtein(a: string, b: string): number`
  - `accuracyOf(expected: string, actual: string): number` — 0..1
  - `fullDifficultyFor(accuracy: number): DifficultyLevel`
  - `markMismatchedWords(expected: string, actual: string): { word: string; ok: boolean }[]`
  - Task 3 calls `accuracyOf`, `fullDifficultyFor` and `markMismatchedWords`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/grade.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
	accuracyOf,
	fullDifficultyFor,
	levenshtein,
	markMismatchedWords,
	normalizeForGrading
} from '../../src/lib/memorize/grade';

const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';

describe('normalizeForGrading', () => {
	it('drops spaces', () => {
		expect(normalizeForGrading('갈 길과')).toBe('갈길과');
	});

	// The only punctuation in the shipped corpus is 291 '*' verse markers,
	// two commas and one pair of parentheses — all of it noise for grading.
	it('drops the verse-boundary marker and punctuation', () => {
		expect(normalizeForGrading('부하게 되느니라 *여름에')).toBe('부하게되느니라여름에');
		expect(normalizeForGrading('가르쳐서, (마땅히)')).toBe('가르쳐서마땅히');
	});

	it('keeps hangul, latin and digits', () => {
		expect(normalizeForGrading('시편 23 AB')).toBe('시편23AB');
	});
});

describe('levenshtein', () => {
	it('is zero for identical strings', () => {
		expect(levenshtein('가나다', '가나다')).toBe(0);
	});

	it('counts substitutions, insertions and deletions', () => {
		expect(levenshtein('가나다', '가라다')).toBe(1);
		expect(levenshtein('가나다', '가나다라')).toBe(1);
		expect(levenshtein('가나다', '가다')).toBe(1);
	});

	it('handles an empty side', () => {
		expect(levenshtein('', '가나')).toBe(2);
		expect(levenshtein('가나', '')).toBe(2);
	});
});

describe('accuracyOf', () => {
	it('ignores spacing differences entirely', () => {
		expect(accuracyOf(VERSE, '그들에게 율례와 법도를 가르쳐서 마땅히 갈길과 할일을 그들에게 보이고')).toBe(1);
	});

	it('penalises a wrong word', () => {
		const a = accuracyOf(VERSE, VERSE.replace('가르쳐서', '가르치고'));
		expect(a).toBeLessThan(1);
		expect(a).toBeGreaterThan(0.9);
	});

	it('scores an empty attempt at zero', () => {
		expect(accuracyOf(VERSE, '')).toBe(0);
	});

	// Dividing by the longer side stops a rambling answer from scoring well
	// just because it contains the right text somewhere.
	it('does not reward padding the answer', () => {
		expect(accuracyOf('가나다', '가나다' + '라'.repeat(30))).toBeLessThan(0.2);
	});

	it('never returns a value outside 0..1', () => {
		expect(accuracyOf('', '')).toBe(1);
		expect(accuracyOf('가', '나')).toBeGreaterThanOrEqual(0);
	});
});

describe('fullDifficultyFor', () => {
	it.each([
		[1, 5],
		[0.99, 4],
		[0.95, 4],
		[0.9, 3],
		[0.85, 3],
		[0.8, 2],
		[0.7, 2],
		[0.69, 1],
		[0, 1]
	])('maps accuracy %s to level %s', (accuracy, level) => {
		expect(fullDifficultyFor(accuracy)).toBe(level);
	});
});

describe('markMismatchedWords', () => {
	// Marking is per word even though the score is per character: a
	// character-level diff highlights fragments of syllables, which is
	// unreadable, and "which words did I miss" is the useful question.
	it('marks only the words that differ', () => {
		const marks = markMismatchedWords('갈 길과 할 일을', '갈 길은 할 일을');
		expect(marks).toEqual([
			{ word: '갈', ok: true },
			{ word: '길과', ok: false },
			{ word: '할', ok: true },
			{ word: '일을', ok: true }
		]);
	});

	it('compares words under the same normalization', () => {
		const marks = markMismatchedWords('가르쳐서, 마땅히', '가르쳐서 마땅히');
		expect(marks.every((m) => m.ok)).toBe(true);
	});

	it('marks missing trailing words as wrong rather than dropping them', () => {
		const marks = markMismatchedWords('갈 길과 할 일을', '갈 길과');
		expect(marks.map((m) => m.ok)).toEqual([true, true, false, false]);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/unit/grade.test.ts`
Expected: FAIL — cannot resolve `../../src/lib/memorize/grade`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/memorize/grade.ts`:

```ts
import type { DifficultyLevel } from '$lib/db/verseRatings';

/**
 * Strips everything that is not a Hangul syllable, Latin letter or digit.
 *
 * In practice this removes spacing and punctuation. Korean spacing is a
 * spelling problem rather than a recall failure, and counting it would make
 * the proposed rating feel unfair — which is worse than useless, because a
 * rating the reader distrusts is one they stop using. Across all 1495
 * shipped verses the only punctuation present is 291 '*' verse-boundary
 * markers, two commas and one pair of parentheses.
 */
export function normalizeForGrading(text: string): string {
	return text.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9]/g, '');
}

/** Standard edit distance. The longest shipped verse is 224 characters, so
 *  the full matrix costs nothing and there is no reason to optimise it. */
export function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	// Single row, rolled forward — the matrix is never needed in full.
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
		}
		prev = row;
	}
	return prev[b.length];
}

/**
 * 0..1, dividing by the longer side.
 *
 * Dividing by the expected length alone would let a rambling answer that
 * happens to contain the verse score near 1, and could push the ratio past 1
 * outright.
 */
export function accuracyOf(expected: string, actual: string): number {
	const e = normalizeForGrading(expected);
	const a = normalizeForGrading(actual);
	const longest = Math.max(e.length, a.length);
	if (longest === 0) return 1;
	return Math.max(0, 1 - levenshtein(e, a) / longest);
}

/** Accuracy bands. Expected to need tuning after real use — keep them here. */
const FULL_BANDS: { min: number; level: DifficultyLevel }[] = [
	{ min: 1, level: 5 },
	{ min: 0.95, level: 4 },
	{ min: 0.85, level: 3 },
	{ min: 0.7, level: 2 },
	{ min: 0, level: 1 }
];

export function fullDifficultyFor(accuracy: number): DifficultyLevel {
	return (FULL_BANDS.find((b) => accuracy >= b.min) ?? FULL_BANDS[FULL_BANDS.length - 1]).level;
}

/**
 * Per-word right/wrong marks for display.
 *
 * Positional, not a diff: word i of the attempt is compared with word i of
 * the verse. A real alignment would forgive an inserted word and shift the
 * rest, but it would also disagree with the character-level score in ways
 * that are hard to explain. This is feedback, not scoring.
 */
export function markMismatchedWords(
	expected: string,
	actual: string
): { word: string; ok: boolean }[] {
	const expectedWords = expected.trim().split(/\s+/).filter(Boolean);
	const actualWords = actual.trim().split(/\s+/).filter(Boolean);
	return expectedWords.map((word, i) => ({
		word,
		ok: normalizeForGrading(word) === normalizeForGrading(actualWords[i] ?? '')
	}));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/grade.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/memorize/grade.ts tests/unit/grade.test.ts
git commit -m "feat(memorize): grade a typed verse against the original

Normalization drops spacing and punctuation before comparing. Korean
spacing is a spelling problem, not a recall failure, and counting it would
make the proposed rating feel unfair — a rating the reader distrusts is one
they stop using.

Accuracy divides the edit distance by the longer of the two strings, so
padding an answer cannot score well and the ratio cannot exceed 1.

Word-level marking is separate from the character-level score, and
positional rather than a true diff: it exists to answer 'which words did I
miss', and an alignment that forgave inserted words would disagree with the
score in ways that are hard to explain."
```

---

### Task 2: Timing module

**Files:**
- Create: `src/lib/memorize/timing.ts`
- Test: `tests/unit/timing.test.ts`

**Interfaces:**
- Consumes: `DifficultyLevel` (type-only); `extractFirstClause` from `$lib/srs/firstClause`; `normalizeForGrading` from `./grade` (Task 1).
- Produces:
  - `startDifficultyFor(elapsedMs: number): DifficultyLevel`
  - `hasTypedOpening(verse: string, typed: string): boolean`
  - Task 3 calls both.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/timing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hasTypedOpening, startDifficultyFor } from '../../src/lib/memorize/timing';

const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';

describe('startDifficultyFor', () => {
	it.each([
		[0, 5],
		[5_000, 5],
		[5_001, 4],
		[10_000, 4],
		[10_001, 3],
		[20_000, 3],
		[20_001, 2],
		[40_000, 2],
		[40_001, 1],
		[600_000, 1]
	])('maps %sms to level %s', (elapsed, level) => {
		expect(startDifficultyFor(elapsed)).toBe(level);
	});
});

describe('hasTypedOpening', () => {
	// extractFirstClause takes the first ~1/3 of the tokens, clamped to 3–8.
	// This verse has 11 words, so the opening is its first 4.
	it('is true once the opening has been typed', () => {
		expect(hasTypedOpening(VERSE, '그들에게 율례와 법도를 가르쳐서')).toBe(true);
	});

	it('is still true once the reader has typed past the opening', () => {
		expect(hasTypedOpening(VERSE, '그들에게 율례와 법도를 가르쳐서 마땅히 갈')).toBe(true);
	});

	it('is false while the opening is incomplete', () => {
		expect(hasTypedOpening(VERSE, '그들에게 율례와')).toBe(false);
	});

	it('is false when the opening is wrong', () => {
		expect(hasTypedOpening(VERSE, '그들에게 율법과 법도를 가르쳐서')).toBe(false);
	});

	// Same normalization as the score, so spacing never gates the timer.
	it('ignores spacing', () => {
		expect(hasTypedOpening(VERSE, '그들에게율례와 법도를가르쳐서')).toBe(true);
	});

	it('is false for an empty attempt', () => {
		expect(hasTypedOpening(VERSE, '')).toBe(false);
		expect(hasTypedOpening('', '')).toBe(false);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/unit/timing.test.ts`
Expected: FAIL — cannot resolve `../../src/lib/memorize/timing`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/memorize/timing.ts`:

```ts
import type { DifficultyLevel } from '$lib/db/verseRatings';
import { extractFirstClause } from '$lib/srs/firstClause';
import { normalizeForGrading } from './grade';

/**
 * Elapsed-time bands for 첫 시작 난이도.
 *
 * Absolute seconds rather than a rate: this rating is about recalling how a
 * verse *begins*, which barely varies with the verse's total length.
 * Expected to need tuning after real use — mobile typing is slow.
 */
const START_BANDS: { maxMs: number; level: DifficultyLevel }[] = [
	{ maxMs: 5_000, level: 5 },
	{ maxMs: 10_000, level: 4 },
	{ maxMs: 20_000, level: 3 },
	{ maxMs: 40_000, level: 2 },
	{ maxMs: Infinity, level: 1 }
];

export function startDifficultyFor(elapsedMs: number): DifficultyLevel {
	return (START_BANDS.find((b) => elapsedMs <= b.maxMs) ?? START_BANDS[START_BANDS.length - 1])
		.level;
}

/**
 * Has the reader produced the verse's opening yet?
 *
 * Reuses extractFirstClause, which the daily review card already uses as its
 * Stage 2 cue — the same notion of "opening", so the two features cannot
 * drift apart. Compared under the grading normalization so spacing never
 * holds the timer open.
 */
export function hasTypedOpening(verse: string, typed: string): boolean {
	const opening = normalizeForGrading(extractFirstClause(verse));
	if (opening.length === 0) return false;
	return normalizeForGrading(typed).startsWith(opening);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/timing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/memorize/timing.ts tests/unit/timing.test.ts
git commit -m "feat(memorize): band elapsed time into a start difficulty

첫 시작 난이도 is about recalling how a verse begins, which barely varies
with its total length — so the bands are absolute seconds rather than a
rate.

The 'has the opening been typed' test reuses extractFirstClause, which the
daily review card already uses as its cue, so the two features share one
notion of a verse's opening instead of drifting apart. It normalizes the
same way the score does, so spacing never holds the timer open."
```

---

### Task 3: Check panel component

**Files:**
- Create: `src/lib/components/card/MemorizeCheckPanel.svelte`
- Test: `tests/unit/MemorizeCheckPanel.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 and 2; `DifficultyBadge` from `./DifficultyBadge.svelte`; `DifficultyLevel` from `$lib/db/verseRatings`.
- Produces a component with props:
  ```ts
  interface Props {
      verse: string;
      onResult: (r: { start: DifficultyLevel | null; full: DifficultyLevel }) => void;
  }
  ```
  Task 4 mounts it and forwards `onResult` into the existing rating callbacks.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/MemorizeCheckPanel.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import MemorizeCheckPanel from '../../src/lib/components/card/MemorizeCheckPanel.svelte';

const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';

function setup(onResult = vi.fn()) {
	render(MemorizeCheckPanel, { verse: VERSE, onResult });
	return onResult;
}

async function type(text: string) {
	const box = screen.getByRole('textbox');
	await fireEvent.input(box, { target: { value: text } });
	return box;
}

describe('MemorizeCheckPanel', () => {
	it('disables submit until something is typed', async () => {
		setup();
		expect(screen.getByRole('button', { name: '제출' })).toBeDisabled();
		await type('그');
		expect(screen.getByRole('button', { name: '제출' })).toBeEnabled();
	});

	// A perfect recitation should not need a dialog.
	it('saves straight away on a perfect attempt', async () => {
		const onResult = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onResult).toHaveBeenCalledTimes(1);
		expect(onResult.mock.calls[0][0].full).toBe(5);
		expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
	});

	// Spacing is not a recall failure, so this still counts as perfect.
	it('treats a spacing-only difference as perfect', async () => {
		const onResult = setup();
		await type(VERSE.replace('갈 길과', '갈길과'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onResult.mock.calls[0][0].full).toBe(5);
	});

	// The app may declare success on its own; it may not decide that a flawed
	// attempt was nonetheless easy.
	it('asks for confirmation when the attempt is flawed, writing nothing yet', async () => {
		const onResult = setup();
		await type(VERSE.replace('가르쳐서', '가르치고'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onResult).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
	});

	it('writes the proposal once confirmed', async () => {
		const onResult = setup();
		await type(VERSE.replace('가르쳐서', '가르치고'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		expect(onResult).toHaveBeenCalledTimes(1);
		expect(onResult.mock.calls[0][0].full).toBeLessThan(5);
	});

	it('writes nothing when the confirmation is cancelled', async () => {
		const onResult = setup();
		await type('전혀 다른 문장');
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '취소' }));
		expect(onResult).not.toHaveBeenCalled();
	});

	it('marks the words that were wrong', async () => {
		setup();
		await type(VERSE.replace('가르쳐서', '가르치고'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		const wrong = screen.getByTestId('mismatched-words').querySelectorAll('[data-ok="false"]');
		expect(wrong).toHaveLength(1);
		expect(wrong[0].textContent).toBe('가르쳐서');
	});

	// The opening was never produced, so there is nothing to time.
	it('proposes no start rating when the opening was never typed', async () => {
		const onResult = setup();
		await type('전혀 다른 문장');
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		expect(onResult.mock.calls[0][0].start).toBeNull();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/unit/MemorizeCheckPanel.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write the component**

Create `src/lib/components/card/MemorizeCheckPanel.svelte`. Match the card's
existing type scale and the `var(--color-*)` tokens; take the confirm/cancel
button styling from the selection bar in
`src/routes/library/[packageId]/+page.svelte`.

```svelte
<script lang="ts">
	import DifficultyBadge from './DifficultyBadge.svelte';
	import type { DifficultyLevel } from '$lib/db/verseRatings';
	import { accuracyOf, fullDifficultyFor, markMismatchedWords } from '$lib/memorize/grade';
	import { hasTypedOpening, startDifficultyFor } from '$lib/memorize/timing';

	interface Props {
		verse: string;
		onResult: (r: { start: DifficultyLevel | null; full: DifficultyLevel }) => void;
	}
	let { verse, onResult }: Props = $props();

	let typed = $state('');
	let elapsedMs = $state(0);
	/** Set the moment the opening is first produced, then never revised — the
	 *  reading is "how long to recall the start", not "how long in total". */
	let openingAtMs = $state<number | null>(null);
	let confirming = $state(false);
	let proposed = $state<{ start: DifficultyLevel | null; full: DifficultyLevel } | null>(null);

	const startedAt = Date.now();

	$effect(() => {
		const id = setInterval(() => {
			if (!confirming) elapsedMs = Date.now() - startedAt;
		}, 250);
		return () => clearInterval(id);
	});

	// Stop the start clock the first time the opening is correct. Watching the
	// text rather than keystrokes means a correction that finally gets the
	// opening right still counts, at the later time it became right.
	$effect(() => {
		if (openingAtMs === null && hasTypedOpening(verse, typed)) {
			openingAtMs = Date.now() - startedAt;
		}
	});

	const mismatches = $derived(markMismatchedWords(verse, typed));

	function mmss(ms: number): string {
		const s = Math.floor(ms / 1000);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}

	function submit() {
		const accuracy = accuracyOf(verse, typed);
		const result = {
			start: openingAtMs === null ? null : startDifficultyFor(openingAtMs),
			full: fullDifficultyFor(accuracy)
		};
		if (accuracy === 1) {
			onResult(result);
			return;
		}
		// Anything short of perfect goes through the reader — the app may
		// declare success on its own, but not that a flawed attempt was easy.
		proposed = result;
		confirming = true;
	}

	function save() {
		if (proposed) onResult(proposed);
		confirming = false;
	}
</script>

<div class="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-elevated)] p-3">
	{#if !confirming}
		<div class="mb-2 flex items-center justify-between text-[11px]">
			<span class="tabular-nums text-[var(--color-text-secondary)]">⏱ {mmss(elapsedMs)}</span>
			{#if openingAtMs !== null}
				<span class="text-[var(--color-text-tertiary)]">도입부 {mmss(openingAtMs)}</span>
			{/if}
		</div>
		<textarea
			bind:value={typed}
			rows="3"
			aria-label="암송 구절 입력"
			placeholder="외운 구절을 입력하세요"
			class="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-2 text-[14px] text-[var(--color-text)]"
		></textarea>
		<div class="mt-2 flex justify-end">
			<button
				type="button"
				disabled={typed.trim().length === 0}
				onclick={submit}
				class="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
			>
				제출
			</button>
		</div>
	{:else}
		<p class="text-[12px] text-[var(--color-text-secondary)]">
			틀린 곳이 있어 자동으로 저장하지 않았습니다. 확인 후 저장해주세요.
		</p>
		<p data-testid="mismatched-words" class="mt-2 text-[14px] leading-[1.7]">
			{#each mismatches as m, i (i)}<span
					data-ok={m.ok}
					class={m.ok
						? 'text-[var(--color-text)]'
						: 'rounded bg-[var(--color-ribbon-red)]/20 px-0.5 text-[var(--color-danger)]'}
					>{m.word}</span
				>{' '}{/each}
		</p>
		<div class="mt-3 flex items-center gap-3">
			<DifficultyBadge
				value={proposed?.start ?? null}
				label="첫 시작 난이도"
				onpick={(l) => proposed && (proposed = { ...proposed, start: l })}
			/>
			<DifficultyBadge
				value={proposed?.full ?? null}
				label="전체 암송 난이도"
				onpick={(l) => proposed && l !== null && (proposed = { ...proposed, full: l })}
			/>
			<div class="ml-auto flex items-center gap-1.5">
				<button
					type="button"
					onclick={() => (confirming = false)}
					class="rounded-full px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-card)]"
				>
					취소
				</button>
				<button
					type="button"
					onclick={save}
					class="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
				>
					저장
				</button>
			</div>
		</div>
	{/if}
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/MemorizeCheckPanel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/card/MemorizeCheckPanel.svelte tests/unit/MemorizeCheckPanel.test.ts
git commit -m "feat(memorize): add the typing check panel

Timer, input and grading in one panel. A perfect attempt saves itself;
anything less opens a confirmation showing the proposal and the words that
were wrong, with both pickers so the reader can adjust before saving.

The start clock stops the first time the opening reads correctly, and is
never revised afterwards — the reading is 'how long to recall the start',
not 'how long in total'. Watching the text rather than keystrokes means a
correction that finally gets the opening right still counts, at the later
moment it became right."
```

---

### Task 4: Mount the panel in VerseCard

**Files:**
- Modify: `src/lib/components/card/VerseCard.svelte`
- Test: `tests/unit/VerseCard.memorize.test.ts`

**Interfaces:**
- Consumes: `MemorizeCheckPanel` (Task 3).
- Produces: no new exports. The panel's `onResult` feeds the existing
  `onPickStartDifficulty` / `onPickFullDifficulty` props, so every page that
  already renders a `VerseCard` persists the ratings with no new wiring.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/VerseCard.memorize.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import VerseCard from '../../src/lib/components/card/VerseCard.svelte';

const verse = {
	i: 127,
	no: 127,
	package_id: '900_krv',
	title: '양  육',
	cite: '출애굽기 18 : 20',
	w: '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고'
};

function setup(over = {}) {
	const props = {
		verse,
		packageName: '900구절',
		packageId: '900_krv',
		tags: [],
		onPickStartDifficulty: vi.fn(),
		onPickFullDifficulty: vi.fn(),
		...over
	};
	render(VerseCard, props);
	return props;
}

describe('VerseCard memorize check', () => {
	it('shows no panel in read mode', () => {
		setup();
		expect(screen.queryByLabelText('암송 구절 입력')).toBeNull();
	});

	it('shows the panel once memorize mode starts', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '암송' }));
		expect(screen.getByLabelText('암송 구절 입력')).toBeInTheDocument();
	});

	// The whole point of the panel is to feed the ratings the card already
	// persists, without any page needing new wiring.
	it('routes a perfect attempt into both rating callbacks', async () => {
		const props = setup();
		await fireEvent.click(screen.getByRole('button', { name: '암송' }));
		await fireEvent.input(screen.getByLabelText('암송 구절 입력'), {
			target: { value: verse.w }
		});
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(props.onPickFullDifficulty).toHaveBeenCalledWith(5);
		expect(props.onPickStartDifficulty).toHaveBeenCalled();
	});

	it('leaves the curtain working', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '암송' }));
		expect(screen.getByText(/드래그해서 단어 열기|모두 열렸습니다/)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/unit/VerseCard.memorize.test.ts`
Expected: FAIL — no element labelled 암송 구절 입력.

- [ ] **Step 3: Mount the panel**

In `src/lib/components/card/VerseCard.svelte`, add to the `<script>`:

```ts
	import MemorizeCheckPanel from './MemorizeCheckPanel.svelte';
```

Then, immediately after the memorize-mode curtain block's closing `</div>`
(the row containing the drag hint), inside the same `{:else}` branch, add:

```svelte
		<!-- The check sits under the curtain, not instead of it: the curtain is
		     the hint when the reader gets stuck. -->
		{#if ratingsEnabled && verse.w.trim().length > 0}
			<MemorizeCheckPanel
				verse={verse.w}
				onResult={(r) => {
					if (r.start !== null) onPickStartDifficulty!(r.start);
					onPickFullDifficulty!(r.full);
				}}
			/>
		{/if}
```

`ratingsEnabled` is the existing derived guard — it is already true only
when both pick callbacks were supplied, which is exactly when there is
somewhere for a result to go.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/VerseCard.memorize.test.ts && pnpm test && pnpm check`
Expected: all PASS; `pnpm check` 0 errors.

- [ ] **Step 5: Manual check**

```bash
pnpm dev
```

Open a package list, tap 암송 on a verse, and confirm:
1. The curtain still drags, and the panel sits under it.
2. Typing the verse correctly (spacing however you like) saves both ratings with no dialog.
3. A wrong word opens the confirmation with that word marked, and 취소 writes nothing.
4. The two badges on the card reflect what was saved.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/card/VerseCard.svelte tests/unit/VerseCard.memorize.test.ts
git commit -m "feat(memorize): show the typing check under the curtain

The panel mounts inside memorize mode, below the curtain rather than in
place of it — the curtain is what the reader falls back on when stuck.

Results route into onPickStartDifficulty/onPickFullDifficulty, which the
card already receives, so every page that renders a VerseCard persists them
through the path it already used and none needed new wiring."
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| Panel under the verse body, curtain untouched | 4 |
| Timer visible during the attempt | 3 |
| Normalization drops spacing/punctuation/`*` | 1 |
| Accuracy via edit distance over the longer side | 1 |
| Accuracy → 전체 난이도 bands | 1 |
| Elapsed → 첫 시작 난이도 bands | 2 |
| Timing stops when the opening is typed, via `extractFirstClause` | 2 |
| 100% saves silently | 3 |
| Flawed attempt opens confirmation, adjustable, cancel writes nothing | 3 |
| Mismatches marked per word | 1 (logic), 3 (render) |
| Ratings persist through existing callbacks | 4 |
| Empty submission blocked | 3 |
| Opening never matched → start left unset | 2, 3 |
| Verse with no body → no panel | 4 |
| Panel closed mid-attempt writes nothing | 4 (unmount; nothing is written before submit) |

No gaps.

**Placeholders:** none — every code step carries the code.

**Type consistency:** `DifficultyLevel` is imported from the existing
`$lib/db/verseRatings` in all three new modules. `normalizeForGrading` is
defined in Task 1 and consumed by Task 2. The `{ start, full }` result shape
is defined in Task 3's props and consumed unchanged in Task 4.
`extractFirstClause` is the existing export from `$lib/srs/firstClause`.

**Note on Task 3's timer:** the panel reads `Date.now()` directly rather than
taking an injected clock. The tests assert on ratings and dialog behaviour,
not on specific elapsed values, so no fake timers are needed; a test that
wanted to pin a band would call `startDifficultyFor` from Task 2 instead.
