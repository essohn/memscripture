# Self Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 확인 button on the verse card records that the reader checked the verse in their head — no typing — so 최근 점검, the 만점 badge and the history all reflect the review they actually do.

**Architecture:** A new `source` value, `'self'`, on the existing `CheckRecord`. The row is keyed by its day so a second tap restamps rather than adds. Three filters that each spelled the same rule inline get one name, `countsAsCheck`. Two sync hazards the derived id creates — union-by-id resolving a collision backwards, and a tombstone deleting the re-created row — are closed. `HISTORY_LIMIT` rises to 50 and the diagnosis block takes its own window of 10.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, TypeScript, Dexie (IndexedDB), Tailwind v4, Vitest + `@testing-library/svelte` (jsdom) with `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-08-30-self-check-design.md`

## Global Constraints

- **Branch:** `feat/self-check`, cut from `main` at `7f056f3`. Baseline: **2055 tests across 134 files, all passing.** The suite must stay green after every task.
- **Test command:** `npx vitest run --maxWorkers=2 --testTimeout=20000`. The `--maxWorkers=2` is not optional — this suite times out random specs when the machine is busy, and a flaky red is worse than a slow green. Single file: `npx vitest run tests/unit/<file>.test.ts --maxWorkers=2 --testTimeout=20000`.
- **Type check:** `npx svelte-check --threshold error --output human 2>&1 | tail -20`. Baseline is **0 errors and 5 pre-existing warnings**; look only for new errors.
- **No new Dexie table and no schema version bump.** `'self'` is a new value in an existing optional field. `db.checkDeletions` already exists.
- **Absent is not empty.** A self check carries no `hints`, no `missed`, no `typed` — the fields are absent, not `0`/`[]`/`''`. The table's three existing comments say why, and tests assert absence with `'field' in row`, never with falsiness.
- **Korean UI copy is exact.** Copy strings character for character; they are asserted in tests.
- **`src/lib/memorize/` must not import from `src/lib/quiz/`.** Nothing does today.
- **Commit after every task** with the message given in the task's final step. Do not push — the controller handles that.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/db/local.ts` | modify | `CheckRecord.source` gains `'self'` |
| `src/lib/db/checkHistory.ts` | modify | `countsAsCheck`; `countsAsRecall` on top of it; `recordSelfCheck`; `HISTORY_LIMIT` 50 |
| `src/lib/sync/merge.ts` | modify | `checkHistory` resolves a collision by the later `checkedAt` |
| `src/lib/memorize/missStats.ts` | modify | sees `source`; drops self checks before the window |
| `src/lib/memorize/diagnosis.ts` | modify | `DIAGNOSIS_WINDOW = 10` |
| `src/lib/components/card/CheckDiagnosis.svelte` | modify | reads only its window |
| `src/lib/components/card/CheckHistorySheet.svelte` | modify | a self-check row says what it is |
| `src/lib/components/card/VerseCard.svelte` | modify | the 확인 button; `checkOnlyHistory` admits self checks |

Tasks 1–3 build and protect the record. Task 4 keeps it out of the one place it would do harm. Task 5 raises the limits. Tasks 6–7 render and wire.

---

### Task 1: `countsAsCheck`, and a fourth source

Three readers of `checkHistory` each spell "is this a 점검" their own way. Before anything can be a new kind of check, that rule needs one name.

**Files:**
- Modify: `src/lib/db/local.ts` (the `source` field on `CheckRecord`)
- Modify: `src/lib/db/checkHistory.ts` (`recordCheck`'s entry type, `countsAsCheck`, `countsAsRecall`, `listLastCheckedAt`)
- Test: `tests/unit/checkHistory.test.ts`

**Interfaces:**
- Produces:
  - `CheckRecord['source']` is now `'quiz' | 'quiz-opening' | 'quiz-spot' | 'self' | undefined`
  - `countsAsCheck(r: Pick<CheckRecord, 'source'>): boolean`
  - `countsAsRecall(r: Pick<CheckRecord, 'source'>): boolean` — unchanged name and signature, new body

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/checkHistory.test.ts`. Extend the existing import from `../../src/lib/db/checkHistory` to also pull in `countsAsCheck` (`countsAsRecall`, `recordCheck`, `listLastCheckedAt` are already imported there or add them to the same line — do not add a second import statement from the same module):

```ts
describe('countsAsCheck', () => {
	// 점검 and 확인 are both the reader sitting down with the verse and saying
	// how it went. A quiz round is not — it is the app asking.
	it('counts 점검 and 확인, and nothing else', () => {
		expect(countsAsCheck({ source: undefined })).toBe(true);
		expect(countsAsCheck({ source: 'self' })).toBe(true);
		expect(countsAsCheck({ source: 'quiz' })).toBe(false);
		expect(countsAsCheck({ source: 'quiz-opening' })).toBe(false);
		expect(countsAsCheck({ source: 'quiz-spot' })).toBe(false);
	});
});

describe('countsAsRecall after 확인', () => {
	// Recall is the wider circle: it adds the quiz's full typing round, which
	// is the same act as 점검 without the rating.
	it('is every check plus the quiz typing round', () => {
		expect(countsAsRecall({ source: undefined })).toBe(true);
		expect(countsAsRecall({ source: 'self' })).toBe(true);
		expect(countsAsRecall({ source: 'quiz' })).toBe(true);
		expect(countsAsRecall({ source: 'quiz-opening' })).toBe(false);
		expect(countsAsRecall({ source: 'quiz-spot' })).toBe(false);
	});
});

describe('listLastCheckedAt with 확인', () => {
	// The whole point of the feature: the card's 최근 점검 line has to move.
	it('reports a 확인 as the verse's last check', async () => {
		await recordCheck(
			'900_krv',
			1,
			{ start: 3, full: 3, accuracy: 1, elapsedMs: 0, source: 'self' },
			5000
		);
		expect((await listLastCheckedAt('900_krv')).get('900_krv:1')).toBe(5000);
	});

	// Still not a quiz round: that line reports 점검, and opens a sheet built
	// around a difficulty no quiz round carries.
	it('still ignores a quiz round', async () => {
		await recordCheck(
			'900_krv',
			2,
			{ start: 3, full: 3, accuracy: 1, elapsedMs: 0, source: 'quiz' },
			5000
		);
		expect((await listLastCheckedAt('900_krv')).has('900_krv:2')).toBe(false);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/checkHistory.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: FAIL — `countsAsCheck is not a function`, and a type error on `source: 'self'`.

- [ ] **Step 3: Widen the source union**

In `src/lib/db/local.ts`, replace the `source` field's declaration and extend its comment:

```ts
	/** What produced this record. Absent means 점검 — every record written
	 *  before this field existed was one, and it is the app's primary act, so
	 *  the default already says the true thing about old rows.
	 *
	 *  'self' is a check the reader made in their head and reported with the
	 *  확인 button. No attempt was typed, so it carries no `missed` and no
	 *  `typed` — but the reader said it went fine, so it counts as a pass and
	 *  therefore as recall. */
	source?: 'quiz' | 'quiz-opening' | 'quiz-spot' | 'self';
```

- [ ] **Step 4: Let `recordCheck` accept it, and name the concept**

In `src/lib/db/checkHistory.ts`:

1. In `recordCheck`'s `entry` parameter type, replace the inline source union so it cannot drift from the record's:

```ts
		source?: CheckRecord['source'];
```

2. Replace the whole `countsAsRecall` function — comment included — with these two:

```ts
/**
 * Is this a check the reader performed on this verse, typed or not?
 *
 * Distinct from countsAsRecall, which asks whether a row is evidence of
 * recall — a quiz round is evidence, and it is not a 점검. This asks whether
 * the reader sat down with the verse and said how it went, which is what the
 * card's 최근 점검 line reports and what the history sheet lists.
 *
 * Not a new concept: the same rule was already spelled out inline in three
 * places, three different ways, before it had a name.
 */
export function countsAsCheck(r: Pick<CheckRecord, 'source'>): boolean {
	return r.source === undefined || r.source === 'self';
}

/**
 * Does this record say something about recall?
 *
 * Every check does, and so does the quiz's full typing round — the same act
 * without the rating. The opening game proves only that the reader can start
 * the verse, and the spot game proves they can recognise a mistake; neither
 * is evidence that the verse was recited, so neither may move the underline
 * suggestions or the 만점 badge.
 */
export function countsAsRecall(r: Pick<CheckRecord, 'source'>): boolean {
	return countsAsCheck(r) || r.source === 'quiz';
}
```

3. In `listLastCheckedAt`, replace the skip line:

```ts
		if (!countsAsCheck(r)) continue;
```

and replace the paragraph of its doc comment that begins "Stricter than countsAsRecall" with:

```
 * Stricter than countsAsRecall, deliberately: that asks whether a row is
 * evidence of recall, and a full quiz round is. This asks what the card's
 * line may report, and the line says 최근 점검 and opens a sheet built around
 * a difficulty no quiz round carries — so countsAsCheck is the rule here,
 * which admits 확인 and refuses every quiz source.
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/checkHistory.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: PASS.

- [ ] **Step 6: Run the whole suite and the type check**

Run: `npx vitest run --maxWorkers=2 --testTimeout=20000`
Expected: PASS — nothing else changes behaviour yet, since no row carries `'self'` outside the new tests.

Run: `npx svelte-check --threshold error --output human 2>&1 | tail -20`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/local.ts src/lib/db/checkHistory.ts tests/unit/checkHistory.test.ts
git commit -m "refactor(db): name the rule three readers were each spelling out"
```

---

### Task 2: `recordSelfCheck`

**Files:**
- Modify: `src/lib/db/checkHistory.ts`
- Test: `tests/unit/checkHistory.test.ts`

**Interfaces:**
- Consumes: `countsAsCheck`, the `'self'` source (Task 1).
- Produces:
  ```ts
  recordSelfCheck(
    packageId: string,
    verseNo: number,
    rating: { start: DifficultyLevel | null; full: DifficultyLevel | null },
    now?: number,
    dateKey?: string
  ): Promise<void>
  ```

**Read this before writing the code.** The row's id is derived from the date, not stamped with the clock. A timestamped id looks equivalent and is a trap: replacing the day's row would mean deleting the old one, and `checkHistory` merges by **union**, so a row deleted locally without a tombstone comes straight back on the next sync and the verse ends the day with two self checks. Writing a tombstone instead would leave one behind per verse per day, forever, in a snapshot uploaded whole on every sync.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/checkHistory.test.ts` (extend the existing import to add `recordSelfCheck`, and `deleteCheck` / `listCheckDeletions` / `listPerfectVerseNos` if they are not already on it):

```ts
describe('recordSelfCheck', () => {
	// Nothing was measured, so nothing is claimed. Absence is asserted with
	// `in`, not falsiness: 0 and '' are things this must not write.
	it('records a pass with nothing measured', async () => {
		await recordSelfCheck('900_krv', 1, { start: 3, full: 4 }, 1000, '2026-08-30');
		const [row] = await listChecks('900_krv', 1);

		expect(row).toMatchObject({
			source: 'self',
			accuracy: 1,
			elapsedMs: 0,
			start: 3,
			full: 4
		});
		expect('hints' in row).toBe(false);
		expect('missed' in row).toBe(false);
		expect('typed' in row).toBe(false);
	});

	it('keys the row by its day', async () => {
		await recordSelfCheck('900_krv', 1, { start: 3, full: 3 }, 1000, '2026-08-30');
		expect((await listChecks('900_krv', 1))[0].id).toBe('900_krv:1:self:2026-08-30');
	});

	// A second 확인 the same day is the same fact, restamped — not a second one.
	it('restamps rather than adding when 확인 is tapped again the same day', async () => {
		await recordSelfCheck('900_krv', 1, { start: 3, full: 3 }, 1000, '2026-08-30');
		await recordSelfCheck('900_krv', 1, { start: 4, full: 5 }, 5000, '2026-08-30');

		const rows = await listChecks('900_krv', 1);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ checkedAt: 5000, start: 4, full: 5 });
	});

	it('adds a row on the next day', async () => {
		await recordSelfCheck('900_krv', 1, { start: 3, full: 3 }, 1000, '2026-08-30');
		await recordSelfCheck('900_krv', 1, { start: 3, full: 3 }, 90_000_000, '2026-08-31');
		expect(await listChecks('900_krv', 1)).toHaveLength(2);
	});

	// Deleting a check leaves a tombstone keyed by its id, and mergeSnapshots
	// subtracts those from the union. A derived id means recording again today
	// writes the very id the tombstone names — so without lifting it, the next
	// sync would delete the row the reader just asked for.
	it('lifts a tombstone left by deleting the same day', async () => {
		await recordSelfCheck('900_krv', 1, { start: 3, full: 3 }, 1000, '2026-08-30');
		await deleteCheck('900_krv:1:self:2026-08-30');
		expect(await listCheckDeletions()).toHaveLength(1);

		await recordSelfCheck('900_krv', 1, { start: 3, full: 3 }, 2000, '2026-08-30');
		expect(await listChecks('900_krv', 1)).toHaveLength(1);
		expect(await listCheckDeletions()).toEqual([]);
	});

	it('becomes the verse's last check', async () => {
		await recordSelfCheck('900_krv', 1, { start: 3, full: 3 }, 1000, '2026-08-30');
		expect((await listLastCheckedAt('900_krv')).get('900_krv:1')).toBe(1000);
	});

	// The deliberate part of the design: the reader's word lights the badge.
	it('lights the 만점 badge', async () => {
		await recordSelfCheck('900_krv', 1, { start: 3, full: 3 }, 1000, '2026-08-30');
		expect(await listPerfectVerseNos('900_krv')).toEqual(new Set([1]));
	});

	// 포기 records no level at all, and neither does an unrated verse checked
	// in the reader's head. A null must survive as a null.
	it('stores an unrated verse's nulls rather than inventing a level', async () => {
		await recordSelfCheck('900_krv', 1, { start: null, full: null }, 1000, '2026-08-30');
		expect((await listChecks('900_krv', 1))[0]).toMatchObject({ start: null, full: null });
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/checkHistory.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: FAIL — `recordSelfCheck is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/lib/db/checkHistory.ts`, add the import for the day key at the top, beside the existing imports:

```ts
import { todayLocalKey } from './activity';
```

and add the function directly after `recordCheck`'s `nextSuffix` helper:

```ts
/**
 * Records that the reader checked this verse in their head.
 *
 * One row per verse per day, because the id is derived from the date rather
 * than stamped with the clock — so a second 확인 is a plain put at the same
 * id, with no lookup, no delete, and no branch for whether today's row
 * already exists.
 *
 * A timestamped id would have been a trap. Replacing the day's row would mean
 * deleting the old one, and checkHistory merges by union: a row deleted
 * locally without a tombstone comes straight back on the next sync, leaving
 * the verse with two self checks for one day. Writing a tombstone instead
 * would leave one behind per verse per day, forever, in a snapshot that is
 * uploaded whole every time.
 *
 * `accuracy: 1` is a mechanism, not a measurement. The reader said it went
 * fine and the app takes them at their word — that is what lights the 만점
 * badge, and it is the deliberate trade this feature makes. `hints`, `missed`
 * and `typed` stay absent: nothing was measured, which is a different thing
 * from having measured nothing.
 */
export async function recordSelfCheck(
	packageId: string,
	verseNo: number,
	rating: { start: DifficultyLevel | null; full: DifficultyLevel | null },
	now: number = Date.now(),
	dateKey: string = todayLocalKey()
): Promise<void> {
	const key = verseKeyOf(packageId, verseNo);
	const id = `${key}:self:${dateKey}`;

	await db.checkHistory.put({
		id,
		verseKey: key,
		packageId,
		verseNo,
		checkedAt: now,
		start: rating.start,
		full: rating.full,
		accuracy: 1,
		elapsedMs: 0,
		source: 'self'
	});

	// The reader deleting today's check and then deciding to record it again is
	// an ordinary sequence, and the tombstone that made the delete stick would
	// otherwise make the new row disappear on the next sync. restoreCheck lifts
	// it for the same reason.
	await db.checkDeletions.delete(id);
	await prune(key);
	await touchDataModified();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/checkHistory.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: PASS.

- [ ] **Step 5: Check for an import cycle**

Run: `npx svelte-check --threshold error --output human 2>&1 | tail -20`
Expected: 0 errors. `checkHistory.ts` now imports `./activity`; confirm with `grep -n "^import" src/lib/db/activity.ts` that `activity.ts` does not import `checkHistory` back.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/checkHistory.ts tests/unit/checkHistory.test.ts
git commit -m "feat(db): a verse checked in the reader's head leaves a row too"
```

---

### Task 3: the merge has to prefer the later stamp

**Files:**
- Modify: `src/lib/sync/merge.ts`
- Test: `tests/unit/merge.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks — this is independently reviewable.
- Produces: no new exports.

**Read this before writing the code.** `mergeSnapshots` unions `checkHistory` by id on the stated grounds that ids are unique per check, so there is nothing to resolve. `unionById` writes local first and remote second into a `Map`, so **the remote copy silently wins any collision**. Task 2's derived id creates exactly such a collision — two devices checking one verse on one day — and the current rule resolves it backwards: a phone that checked at 21:00 merging against a tablet that checked at 09:00 keeps 09:00. Both are "today", so nothing looks broken; the card just quietly reports a stale hour.

`mergeById(a, b, idOf, versionOf)` already exists in this file and keeps whichever copy has the greater version.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/merge.test.ts`, at the top level of the file (not inside an existing `describe`, so it does not depend on a helper scoped to one):

```ts
describe('two devices restamping one day', () => {
	const selfCheck = (checkedAt: number) =>
		({
			id: 'x:1:self:2026-08-30',
			verseKey: 'x:1',
			packageId: 'x',
			verseNo: 1,
			checkedAt,
			start: 3,
			full: 3,
			accuracy: 1,
			elapsedMs: 0,
			source: 'self'
		}) as never;

	// A 확인 row is keyed by its day so a second tap restamps rather than adds.
	// That makes a collision possible where none was before, and the later
	// stamp is the true one — the reader really did check it again at 21:00.
	it('keeps the later stamp', () => {
		const early = snap({ checkHistory: [selfCheck(100)] });
		const late = snap({ checkHistory: [selfCheck(900)] });

		const merged = mergeSnapshots(early, late).checkHistory;
		expect(merged).toHaveLength(1);
		expect(merged[0].checkedAt).toBe(900);
	});

	// And not because of argument order: unionById kept whichever side came
	// second, which is exactly the bug this replaces.
	it('keeps it whichever side it arrives from', () => {
		const early = snap({ checkHistory: [selfCheck(100)] });
		const late = snap({ checkHistory: [selfCheck(900)] });

		expect(mergeSnapshots(late, early).checkHistory[0].checkedAt).toBe(900);
	});

	// Every id in the table today is unique per check, so this must remain a
	// no-op for everything that already exists.
	it('still unions rows with distinct ids', () => {
		const a = snap({
			checkHistory: [
				{
					id: 'x:1:100:0',
					verseKey: 'x:1',
					packageId: 'x',
					verseNo: 1,
					checkedAt: 100,
					start: 5,
					full: 5,
					accuracy: 1,
					elapsedMs: 1
				}
			] as never
		});
		const b = snap({
			checkHistory: [
				{
					id: 'x:1:200:0',
					verseKey: 'x:1',
					packageId: 'x',
					verseNo: 1,
					checkedAt: 200,
					start: 4,
					full: 4,
					accuracy: 0.9,
					elapsedMs: 1
				}
			] as never
		});

		expect(mergeSnapshots(a, b).checkHistory).toHaveLength(2);
	});

	// A tombstone still wins over either copy.
	it('a tombstone still removes the row', () => {
		const deleted = snap({
			checkHistory: [selfCheck(100)],
			checkDeletions: [{ id: 'x:1:self:2026-08-30', deletedAt: 500 }] as never
		});
		const stillHasIt = snap({ checkHistory: [selfCheck(900)] });

		expect(mergeSnapshots(deleted, stillHasIt).checkHistory).toEqual([]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/merge.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: FAIL — `keeps the later stamp` gets `100`, because the remote copy wins.

- [ ] **Step 3: Write the implementation**

In `src/lib/sync/merge.ts`, replace the `checkHistory:` entry and its comment inside `mergeSnapshots`:

```ts
		// An append-only log, with one deliberate exception: a 확인 row is keyed
		// by its day so a second tap restamps it rather than adding one. That
		// makes a collision possible where none was before — two devices
		// checking one verse on one day — and unionById resolved it backwards,
		// keeping whichever copy it happened to write second (the remote)
		// rather than whichever happened later. The later stamp is the fact.
		//
		// Every other id in this table is unique per check, so nothing that
		// already exists collides and nothing about it changes.
		checkHistory: mergeById(
			local.checkHistory,
			remote.checkHistory,
			(c) => c.id,
			(c) => c.checkedAt
		).filter((c) => !deleted.has(c.id)),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/merge.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: PASS, including every pre-existing assertion in the file.

- [ ] **Step 5: Confirm `unionById` is still used**

Run: `grep -n "unionById(" src/lib/sync/merge.ts`
Expected: three remaining callers — `checkDeletions`, the OYO `verses`, and `activity`. `checkHistory` was the fourth. If the count is anything else, stop and report it: a `unionById` with no callers left is dead code that must go, and a fifth caller means this file changed under the plan.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sync/merge.ts tests/unit/merge.test.ts
git commit -m "fix(sync): a restamped day should not lose to the older device"
```

---

### Task 4: keep 확인 out of the underline suggestions

**Files:**
- Modify: `src/lib/memorize/missStats.ts`
- Test: `tests/unit/missStats.test.ts`

**Interfaces:**
- Produces: `suggestedMarks(history: Pick<CheckRecord, 'missed' | 'hints' | 'source'>[], wordCount: number): Set<number>` — the `Pick` widens by one field; the behaviour for every existing caller is unchanged.

**Why this is not the same as a pre-feature record.** `suggestedMarks` lets a record with no `missed` fill its five-record window "silently rather than counting as a clean run" — right for a check written before the field existed, because that check *did* have missed words and the app simply failed to write them down. A self check never had positions to record. Letting five of them fill the window would retract every underline suggestion the reader had earned, on the strength of five taps that measured nothing — and the reader tapping 확인 five days running is exactly the one still working on the verse.

The function's only caller hands it `checkHistory.filter(countsAsRecall)`, which self checks now pass, and the `Pick` does not currently include `source` — so the rule cannot be written without widening it.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('suggestedMarks', …)` in `tests/unit/missStats.test.ts`:

```ts
	// A 확인 never had positions to record, unlike a pre-feature check that had
	// them and simply was not asked for them. Five taps must not starve a
	// suggestion the reader earned — and the reader tapping 확인 five days
	// running is precisely the one still working on this verse.
	it('does not let 확인 taps crowd out an earned suggestion', () => {
		const tap = { missed: undefined, source: 'self' as const };
		const history = [tap, tap, tap, tap, tap, { missed: [2] }, { missed: [2] }];
		expect(suggestedMarks(history, 11)).toEqual(new Set([2]));
	});

	// The exclusion is on the source, not on the missing array: a 점검 whose
	// positions were never recorded still fills the window, as it always has.
	it('still lets a pre-feature 점검 fill the window', () => {
		const old = { missed: undefined };
		const history = [old, old, old, old, old, { missed: [2] }, { missed: [2] }];
		expect(suggestedMarks(history, 11)).toEqual(new Set());
	});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/missStats.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: FAIL — `does not let 확인 taps crowd out an earned suggestion` returns an empty set, because the five taps fill the window.

- [ ] **Step 3: Write the implementation**

In `src/lib/memorize/missStats.ts`, widen the signature:

```ts
export function suggestedMarks(
	history: Pick<CheckRecord, 'missed' | 'hints' | 'source'>[],
	wordCount: number
): Set<number> {
```

and replace the filter line together with the comment above it:

```ts
	// Two kinds of record are dropped before the window is taken, not after.
	//
	// An assisted check — one made with the words on screen — is not evidence
	// that the reader knows the verse; grade.ts says the same thing about
	// difficulty. Truthy rather than defined, so an absent field (predating the
	// feature) and a zero (힌트 never pressed) both count as unassisted.
	//
	// A 확인 never measured a position at all. That is not the same as a check
	// written before `missed` existed, which had missed words and simply was
	// not asked for them — and which still fills the window below. Letting five
	// taps fill it would retract a suggestion the reader had earned.
	for (const record of history
		.filter((r) => !r.hints && r.source !== 'self')
		.slice(0, SUGGEST_WINDOW)) {
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/missStats.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: PASS.

- [ ] **Step 5: Type check**

Run: `npx svelte-check --threshold error --output human 2>&1 | tail -20`
Expected: 0 errors. The caller in `VerseCard.svelte` passes full `CheckRecord`s, which satisfy the wider `Pick` without a change.

- [ ] **Step 6: Commit**

```bash
git add src/lib/memorize/missStats.ts tests/unit/missStats.test.ts
git commit -m "fix(marks): five 확인 taps must not retract an earned suggestion"
```

---

### Task 5: 50 records kept, 10 diagnosed

**Files:**
- Modify: `src/lib/db/checkHistory.ts` (`HISTORY_LIMIT`)
- Modify: `src/lib/memorize/diagnosis.ts` (`DIAGNOSIS_WINDOW`)
- Modify: `src/lib/components/card/CheckDiagnosis.svelte`
- Test: `tests/unit/CheckDiagnosis.test.ts`

**Interfaces:**
- Produces: `DIAGNOSIS_WINDOW = 10` exported from `src/lib/memorize/diagnosis.ts`.

**Why the diagnosis needs its own window now.** `CheckDiagnosis` was built to read "exactly the rows the list shows", with no window constant, so a summary could never disagree with the list beneath it. At 50 rows that becomes 50 sparkline bars at 3px apiece and 50 difficulty pips wrapping down the sheet. The no-disagreement rule survives because the block already opens by naming its own scope: **최근 10회** over a 50-row list is a true sentence, where 최근 8회 over a 5-row list was not.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('CheckDiagnosis', …)` in `tests/unit/CheckDiagnosis.test.ts`:

```ts
	// The block reads a window now, and says so. 50 bars at 3px apiece is not a
	// sparkline, and 50 pips wrap down the sheet.
	it('summarises its own window and names it', () => {
		const many = Array.from({ length: 14 }, (_, i) =>
			record({ id: `r${i}`, checkedAt: 1_000_000 - i * 1000 })
		);
		mount(many);

		expect(screen.getByTestId('diagnosis-effort')).toHaveTextContent('최근 10회');
		expect(screen.getAllByTestId('accuracy-bar')).toHaveLength(10);
	});

	// Newest first in, so the window is the ten most recent — not the ten
	// oldest, which is the mistake a bare slice at the wrong end would make.
	it('takes the newest ten, not the oldest', () => {
		const many = [
			...Array.from({ length: 10 }, (_, i) =>
				record({ id: `new${i}`, checkedAt: 2_000_000 - i, accuracy: 1 })
			),
			record({ id: 'ancient', checkedAt: 1, accuracy: 0 })
		];
		mount(many);

		expect(screen.getByLabelText(/정확도 변화:/)).not.toHaveAccessibleName(/0%/);
	});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/CheckDiagnosis.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: FAIL — the effort line reads `최근 14회` and there are 14 bars.

- [ ] **Step 3: Raise the storage limit**

In `src/lib/db/checkHistory.ts`, replace `HISTORY_LIMIT` and its comment:

```ts
/** Entries kept per verse. Older ones are pruned as new checks land.
 *
 *  A cap costs nothing to a verse that has not reached it: a reader with two
 *  hundred verses checked six times each carries the same rows at 10 as at 50.
 *  What it costs is paid only by the verses that go past it — which are the
 *  ones the reader has worked hardest on, and whose history is worth the most.
 *
 *  Measured rather than guessed at: one row with a full Korean verse in
 *  `typed` and a 21-entry `missed` array is 455 bytes, so a 1147-verse library
 *  with every verse at the cap would carry about 25MB. That is the ceiling
 *  nobody reaches, and it is paid on every sync in both directions — syncFlow
 *  downloads the whole remote snapshot and uploads the whole merged one, with
 *  no delta. */
export const HISTORY_LIMIT = 50;
```

- [ ] **Step 4: Give the diagnosis its own window**

In `src/lib/memorize/diagnosis.ts`, add beside `MIN_RECORDS`:

```ts
/**
 * How many of the records it is handed the diagnosis actually reads.
 *
 * The block used to read exactly the rows the list showed, with no window of
 * its own, so a summary could never disagree with the list beneath it. That
 * rule still holds — what changed is that HISTORY_LIMIT is 50, and fifty
 * sparkline bars at three pixels apiece is not a chart. The block opens by
 * naming its own scope, so 최근 10회 over a fifty-row list is a true sentence,
 * where 최근 8회 over a five-row list would not have been.
 */
export const DIAGNOSIS_WINDOW = 10;
```

- [ ] **Step 5: Read the window in the component**

In `src/lib/components/card/CheckDiagnosis.svelte`, add `DIAGNOSIS_WINDOW` to the existing import from `$lib/memorize/diagnosis`, then insert this derived value immediately after `let { records, words }: Props = $props();`:

```ts
	/** The records this block speaks for. Newest first, as the sheet hands them
	 *  over, so the slice takes the most recent — and the effort line names the
	 *  count, which is what keeps the summary honest about a longer list. */
	const shownRecords = $derived(records.slice(0, DIAGNOSIS_WINDOW));
```

Then replace **every** remaining use of `records` in the component with `shownRecords` — there are five: the `shown` gate, `effortTotals`, `accuracySeries`, `wordHeat`, `chronological`, and the `difficultyTrend(records, d.dim)` call in the markup's `{@const}`. Leave the `Props` declaration and the prop's doc comment alone, and extend that comment with a second paragraph:

```ts
		 *
		 *  The block reads only the newest DIAGNOSIS_WINDOW of them and says how
		 *  many in its first line, so a fifty-row sheet gets a ten-check summary
		 *  that is honest about being one.
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/unit/CheckDiagnosis.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: PASS.

- [ ] **Step 7: Run the whole suite**

Run: `npx vitest run --maxWorkers=2 --testTimeout=20000`
Expected: PASS with **no test file edits**. Every `HISTORY_LIMIT` use in `tests/unit/checkHistory.test.ts` is relative (`HISTORY_LIMIT + 5`, `toHaveLength(HISTORY_LIMIT)`), so those specs test the pruning rule rather than the number and follow the constant on their own. They will get slower — the loops now write 50-55 records each instead of 10-15, and `recordCheck` issues a count query per write. If one times out, that is the `--testTimeout=20000` earning its place, not a failure; report it rather than trimming the loop.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/checkHistory.ts src/lib/memorize/diagnosis.ts src/lib/components/card/CheckDiagnosis.svelte tests/unit/CheckDiagnosis.test.ts
git commit -m "feat(db): keep fifty checks a verse, and diagnose the newest ten"
```

---

### Task 6: a 확인 row says what it is

**Files:**
- Modify: `src/lib/components/card/CheckHistorySheet.svelte`
- Test: `tests/unit/CheckHistorySheet.test.ts`

**Interfaces:**
- Consumes: the `'self'` source (Task 1).
- Produces: no new exports.

**The bug this closes.** The sheet prints one of three sentences for `typed`: the text, *"입력한 내용 없이 저장했습니다"* for `''`, and *"입력 본문이 기록되기 전의 점검입니다"* for absent. A self check has an absent `typed` and would get the third — which is a lie. It does not predate the field; it never had one.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/CheckHistorySheet.test.ts`:

```ts
describe('a 확인 row', () => {
	const selfCheck = () =>
		record({ id: 'self', source: 'self', accuracy: 1, elapsedMs: 0, start: 4, full: 4 });

	it('says what it is', () => {
		mount([selfCheck(), record({ id: 'typed', checkedAt: NOW - 2 * DAY })]);
		expect(screen.getByText('머릿속으로 확인했습니다')).toBeInTheDocument();
	});

	// It never had an attempt to print, so it must not borrow the sentence for
	// a 점검 that predates the field — that one would be a lie about it.
	it('does not claim to predate the attempt field', () => {
		mount([selfCheck(), selfCheck()]);
		expect(screen.queryByText('입력 본문이 기록되기 전의 점검입니다')).toBeNull();
	});

	// No accuracy was measured, so none is reported — the 1 it stores is a
	// mechanism for the badge, not a score to show the reader.
	it('reports no accuracy', () => {
		mount([selfCheck(), selfCheck()]);
		expect(screen.queryByText(/정확도/)).toBeNull();
	});

	// The rating it was made at is still worth showing: it is what the
	// difficulty trend above reads.
	it('still shows the difficulty it was made at', () => {
		mount([selfCheck()]);
		expect(screen.getByLabelText('첫 시작 난이도 4')).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/CheckHistorySheet.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: FAIL — `머릿속으로 확인했습니다` is not in the document.

- [ ] **Step 3: Write the implementation**

In `src/lib/components/card/CheckHistorySheet.svelte`, inside the row's `{:else}` branch (the one that renders a normal row, after the date-and-dots `<div>`), wrap the accuracy line and the three-state attempt block in a source test. The date row and the delete button stay outside it, shared by both kinds:

```svelte
				{#if h.source === 'self'}
					<!-- No attempt was typed and no accuracy measured, so neither is
					     reported. The 1 this row stores is the mechanism that lights
					     the 만점 badge, not a score to show the reader — printing it
					     would be the app claiming to have watched something it did
					     not. -->
					<p class="mt-1.5 text-[11px] text-[var(--color-text-tertiary)]">
						머릿속으로 확인했습니다
					</p>
				{:else}
					<div
						class="mt-1.5 flex flex-wrap gap-x-2 text-[11px] tabular-nums text-[var(--color-text-tertiary)]"
					>
						<!-- …the existing accuracy and 힌트 spans, unchanged… -->
					</div>

					<!-- …the existing three-state {#if h.typed} block, unchanged… -->
				{/if}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/CheckHistorySheet.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: PASS, including every pre-existing assertion — a normal row must still show its accuracy and its attempt.

- [ ] **Step 5: Type check**

Run: `npx svelte-check --threshold error --output human 2>&1 | tail -20`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/card/CheckHistorySheet.svelte tests/unit/CheckHistorySheet.test.ts
git commit -m "feat(card): a 확인 row reports what it measured, which is nothing"
```

---

### Task 7: the 확인 button

**Files:**
- Modify: `src/lib/components/card/VerseCard.svelte`
- Test: `tests/unit/VerseCard.history.test.ts`

**Interfaces:**
- Consumes: `recordSelfCheck` (Task 2), `countsAsCheck` (Task 1).
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/VerseCard.history.test.ts`:

```ts
describe('확인', () => {
	const tapConfirm = () => screen.getByRole('button', { name: /확인/ });

	it('records a check without typing anything', async () => {
		setup({ packageId: '900_krv', startDifficulty: 3, fullDifficulty: 4 });
		await fireEvent.click(tapConfirm());

		await waitFor(async () => {
			const rows = await listChecks('900_krv', 127);
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({ source: 'self', accuracy: 1, start: 3, full: 4 });
		});
	});

	// The button carries its state in its name, so the change is not colour
	// alone and a screen reader hears it.
	it('says it has been used today', async () => {
		setup({ packageId: '900_krv' });
		await fireEvent.click(tapConfirm());

		await waitFor(() => {
			expect(screen.getByRole('button', { name: /오늘 확인함/ })).toBeInTheDocument();
		});
	});

	// A reader who checked at breakfast and again at night did the thing twice.
	// The button refusing them would be the app arguing.
	it('records again on a second tap rather than doing nothing', async () => {
		setup({ packageId: '900_krv' });
		await fireEvent.click(tapConfirm());
		await waitFor(() => expect(screen.getByRole('button', { name: /오늘 확인함/ })).toBeInTheDocument());

		const before = (await listChecks('900_krv', 127))[0].checkedAt;
		await fireEvent.click(screen.getByRole('button', { name: /오늘 확인함/ }));

		await waitFor(async () => {
			const rows = await listChecks('900_krv', 127);
			expect(rows).toHaveLength(1);
			expect(rows[0].checkedAt).toBeGreaterThanOrEqual(before);
		});
	});

	it('updates the card's 최근 점검 line', async () => {
		setup({ packageId: '900_krv' });
		expect(screen.queryByRole('button', { name: /점검 기록 보기/ })).toBeNull();

		await fireEvent.click(tapConfirm());
		await waitFor(() => {
			expect(screen.getByRole('button', { name: /점검 기록 보기/ })).toBeInTheDocument();
		});
	});

	// A card that cannot be checked cannot be self-checked either.
	it('is absent where the card is not checkable', () => {
		setup({ packageId: '900_krv', onPickStartDifficulty: undefined, onPickFullDifficulty: undefined });
		expect(screen.queryByRole('button', { name: /확인/ })).toBeNull();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/VerseCard.history.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: FAIL — no button matching `/확인/`.

Note on the last test: `checkable` is `ratingsEnabled && normalizeForGrading(verse.w).length > 0` (`VerseCard.svelte:138`), and `ratingsEnabled` is `Boolean(onPickStartDifficulty) && Boolean(onPickFullDifficulty)` (`:120`). Withholding both handlers is therefore the right way to switch it off, which is what the test does.

- [ ] **Step 3: Admit self checks to the card's history**

In `src/lib/components/card/VerseCard.svelte`, add `countsAsCheck` and `recordSelfCheck` to the existing import from `$lib/db/checkHistory`, then replace `checkOnlyHistory` and its comment:

```ts
	/** 점검 and 확인 — the checks the reader performed, typed or not. A quiz
	 *  round is the same act without the rating, so the underline suggestions
	 *  count it, but anything that shows a difficulty has nothing to show for
	 *  one. */
	const checkOnlyHistory = $derived(checkHistory.filter(countsAsCheck));
```

- [ ] **Step 4: Add the state and the handler**

Add after the `lastCheckPerfect` declaration:

```ts
	/** Whether today already holds a 확인 for this verse. Read off the loaded
	 *  history rather than a flag of its own, so it survives the card being
	 *  scrolled away and rebuilt, and so a check synced in from another device
	 *  counts. */
	const selfCheckedToday = $derived(
		checkOnlyHistory.some((r) => r.source === 'self' && r.id.endsWith(`:self:${todayLocalKey()}`))
	);

	/**
	 * 확인: the reader checked this verse in their head.
	 *
	 * Mirrors what onGraded does for a typed check — stamp the line, light the
	 * badge, then write and reload — because the card must respond to the tap
	 * rather than to the round trip.
	 */
	function confirmSelfCheck() {
		if (!packageId) return;
		const checkedAt = Date.now();
		lastCheckedLocal = checkedAt;
		noChecksLeft = false;
		lastCheckPerfect = true;
		recordSelfCheck(
			packageId,
			verse.no,
			{ start: startDifficulty ?? null, full: fullDifficulty ?? null },
			checkedAt
		)
			.then(loadCheckHistory)
			.catch(() => {});
	}
```

Add `import { todayLocalKey } from '$lib/db/activity';` to the imports.

- [ ] **Step 5: Add the button**

In the card's head, immediately after the `{#if checkable}` block that renders 점검 and inside the same `{#if checkable}` guard, add:

```svelte
						<button
							type="button"
							onclick={confirmSelfCheck}
							aria-label={selfCheckedToday
								? `${heading} 오늘 확인함, 다시 기록`
								: `${heading} 확인 기록`}
							class="rounded-full border px-3.5 py-1 text-[11px] font-semibold transition-colors {selfCheckedToday
								? 'border-[var(--color-accent)] text-[var(--color-accent)]'
								: 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]'}"
						>
							{selfCheckedToday ? '확인함' : '확인'}
						</button>
```

The visible label carries the state as well as the colour, so the change is not colour alone. `aria-pressed` is deliberately not used: this is not a toggle and a second tap does not turn it off.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/unit/VerseCard.history.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: PASS.

- [ ] **Step 7: Run the whole suite and the type check**

Run: `npx vitest run --maxWorkers=2 --testTimeout=20000`
Expected: PASS across all files.

Run: `npx svelte-check --threshold error --output human 2>&1 | tail -20`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/components/card/VerseCard.svelte tests/unit/VerseCard.history.test.ts
git commit -m "feat(card): 확인 records the check the reader did in their head"
```

---

## Self-Review

**Spec coverage.** Every section maps to a task: the `'self'` record and the three predicates → Task 1; the day-keyed id, the tombstone lift and `recordSelfCheck` → Task 2; the merge hazard → Task 3; the `suggestedMarks` exclusion and its widened `Pick` → Task 4; `HISTORY_LIMIT` 50 and `DIAGNOSIS_WINDOW` → Task 5; the sheet's fourth sentence → Task 6; the button, its two states and its accessible name → Task 7. The spec's edge-case table is covered by Tasks 2 (day boundary, tombstone, unrated verse, two devices) and 5 (fifty rows, ten diagnosed), except "a typed 점검 lands after today's self check", which needs no code — `listPerfectVerseNos` already takes the most recent recall-bearing row.

**Placeholders.** None. Two steps deliberately ask the implementer to report a finding rather than guess: Task 3 Step 5 (whether `unionById` still has a caller) and Task 7 Step 2 (what `checkable` actually depends on). Both are verifications with a stated action, not deferred work.

**Type consistency.** `countsAsCheck` / `countsAsRecall` / `recordSelfCheck` / `DIAGNOSIS_WINDOW` / `HISTORY_LIMIT` are named identically where defined and where used. The `'self'` literal is spelled the same in `local.ts`, `checkHistory.ts`, `missStats.ts`, the sheet and the card. `recordSelfCheck`'s `rating` parameter is `{ start, full }`, matching what Task 7 passes.

**Three things this review checked against the code rather than assuming.** `checkable`'s real dependency (`ratingsEnabled`, itself the two difficulty handlers) — Task 7's last test switches off the right thing. `unionById`'s caller count — three survive Task 3, so the function does not become dead code. And every `HISTORY_LIMIT` use in the existing tests is relative, so Task 5 needs no test edits; the loops merely get slower.

**One thing to re-derive during execution.** Trust "all green, no new failures" over any test count stated here.
