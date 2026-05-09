# Phase 3.1 — SRS Data Layer & Pure Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the data model (Dexie schema v2 + types) and all pure SRS logic (buckets, scheduler, oldWindow, intake) plus thin I/O modules (progress, activity, activePackage), with full unit test coverage and zero UI changes.

**Architecture:** Pure logic in `src/lib/srs/` separated from I/O in `src/lib/db/`. Each file has one responsibility and a small public surface. Schema migration is additive — existing `packages`/`verses`/`settings` tables untouched. After this plan, the SRS engine works in isolation; the next sub-plan (Today page + ReviewCard) wires it into a real user flow.

**Tech Stack:** Dexie 4 (schema versioning), Vitest + fake-indexeddb, TypeScript 6, Svelte 5 (no UI yet though).

**Spec:** [docs/superpowers/specs/2026-05-10-srs-memorization-system-design.md](../specs/2026-05-10-srs-memorization-system-design.md)

---

## File Structure

**Create:**
- `src/lib/srs/buckets.ts` — bucket transition rules (`shouldGraduate`, `advanceBucket`)
- `src/lib/srs/oldWindow.ts` — Old priority surfacing (`priorityScore`, `selectOldActiveWindow`)
- `src/lib/srs/intake.ts` — next-verse recommendation (`recommendNext`)
- `src/lib/srs/scheduler.ts` — daily queue composition (`buildTodayQueue`)
- `src/lib/db/progress.ts` — VerseProgress I/O
- `src/lib/db/activity.ts` — DailyActivity I/O + helpers
- `src/lib/db/activePackage.ts` — single-row active package preference
- `tests/unit/buckets.test.ts`
- `tests/unit/oldWindow.test.ts`
- `tests/unit/intake.test.ts`
- `tests/unit/scheduler.test.ts`
- `tests/unit/progress.test.ts`
- `tests/unit/activity.test.ts`
- `tests/unit/activePackage.test.ts`

**Modify:**
- `src/lib/types.ts` — add `Bucket`, `VerseProgress`, `DailyActivity`
- `src/lib/db/local.ts` — bump to schema v2 with `progress` and `activity` tables
- `tests/unit/db.test.ts` — verify v2 tables exist + roundtrip new tables

Pure logic doesn't import `db/` — keeps tests fast (no fake-indexeddb needed) and decisions deterministic.

---

## Task 1: SRS types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Append SRS types**

Add to the END of `src/lib/types.ts`:

```ts
export type Bucket = 'new' | 'current' | 'old' | 'mastered';

export interface VerseProgress {
	id: string; // composite key: `${packageId}:${verseNo}`
	packageId: string;
	verseNo: number;
	bucket: Bucket;
	enteredBucketAt: number; // ms timestamp; reset on bucket transition
	daysActiveInBucket: number; // count of distinct active days while in current bucket
	lastReviewedAt: number;
	citeRatings: number[]; // sliding window: last 10 ratings (1=Again, 4=Easy)
	recallRatings: number[]; // sliding window: last 10 ratings
}

export interface DailyActivity {
	dateKey: string; // local-date 'YYYY-MM-DD'
}
```

- [ ] **Step 2: Run type check**

Run: `pnpm check`
Expected: PASS — 0 errors. Types compile in isolation.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add SRS types (Bucket, VerseProgress, DailyActivity)"
```

---

## Task 2: Schema v2 migration

**Files:**
- Modify: `src/lib/db/local.ts`
- Modify: `tests/unit/db.test.ts`

- [ ] **Step 1: Update db tests for v2**

Replace `tests/unit/db.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

describe('local db schema v2', () => {
	it('exposes all 5 tables', () => {
		const names = db.tables.map((t) => t.name).sort();
		expect(names).toEqual(['activity', 'packages', 'progress', 'settings', 'verses']);
	});

	it('round-trips a verse', async () => {
		await db.verses.put({ package_id: '5_krv', no: 1, i: 1, title: 't', cite: 'c', w: 'w' });
		const v = await db.verses.get(['5_krv', 1]);
		expect(v?.title).toBe('t');
	});

	it('round-trips a progress row', async () => {
		await db.progress.put({
			id: '5_krv:1',
			packageId: '5_krv',
			verseNo: 1,
			bucket: 'new',
			enteredBucketAt: 1000,
			daysActiveInBucket: 0,
			lastReviewedAt: 0,
			citeRatings: [],
			recallRatings: []
		});
		const p = await db.progress.get('5_krv:1');
		expect(p?.bucket).toBe('new');
	});

	it('round-trips an activity row', async () => {
		await db.activity.put({ dateKey: '2026-05-10' });
		const a = await db.activity.get('2026-05-10');
		expect(a?.dateKey).toBe('2026-05-10');
	});

	it('progress has packageId index for filtering', async () => {
		await db.progress.put({
			id: '5_krv:1',
			packageId: '5_krv',
			verseNo: 1,
			bucket: 'new',
			enteredBucketAt: 0,
			daysActiveInBucket: 0,
			lastReviewedAt: 0,
			citeRatings: [],
			recallRatings: []
		});
		await db.progress.put({
			id: '60_krv:1',
			packageId: '60_krv',
			verseNo: 1,
			bucket: 'current',
			enteredBucketAt: 0,
			daysActiveInBucket: 0,
			lastReviewedAt: 0,
			citeRatings: [],
			recallRatings: []
		});
		const fives = await db.progress.where('packageId').equals('5_krv').toArray();
		expect(fives).toHaveLength(1);
	});

	it('progress has bucket index for filtering', async () => {
		await db.progress.put({
			id: '5_krv:1',
			packageId: '5_krv',
			verseNo: 1,
			bucket: 'new',
			enteredBucketAt: 0,
			daysActiveInBucket: 0,
			lastReviewedAt: 0,
			citeRatings: [],
			recallRatings: []
		});
		await db.progress.put({
			id: '5_krv:2',
			packageId: '5_krv',
			verseNo: 2,
			bucket: 'current',
			enteredBucketAt: 0,
			daysActiveInBucket: 0,
			lastReviewedAt: 0,
			citeRatings: [],
			recallRatings: []
		});
		const news = await db.progress.where('bucket').equals('new').toArray();
		expect(news).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run test, see failure**

Run: `pnpm test tests/unit/db.test.ts`
Expected: FAIL — only 3 tables exist (`packages`, `verses`, `settings`); `progress`/`activity` undefined.

- [ ] **Step 3: Update schema**

Replace `src/lib/db/local.ts`:

```ts
import Dexie, { type Table } from 'dexie';
import type { PackageMeta, Verse, VerseProgress, DailyActivity } from '$lib/types';

export type StoredVerse = Verse & { package_id: string; no: number };
export type StoredPackage = PackageMeta;
export type StoredSetting = { key: string; value: unknown };

class LocalDB extends Dexie {
	packages!: Table<StoredPackage, string>;
	verses!: Table<StoredVerse, [string, number]>;
	settings!: Table<StoredSetting, string>;
	progress!: Table<VerseProgress, string>;
	activity!: Table<DailyActivity, string>;

	constructor() {
		super('memscripture');
		this.version(1).stores({
			packages: '&id, name',
			verses: '[package_id+no], package_id',
			settings: '&key'
		});
		this.version(2).stores({
			packages: '&id, name',
			verses: '[package_id+no], package_id',
			settings: '&key',
			progress: '&id, packageId, bucket',
			activity: '&dateKey'
		});
	}
}

export const db = new LocalDB();
```

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm test tests/unit/db.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Run full test suite for regression**

Run: `pnpm test`
Expected: PASS — all pre-existing tests still green (verses, recent, viewOptions, etc.).

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/local.ts tests/unit/db.test.ts
git commit -m "feat(db): bump schema to v2 with progress and activity tables"
```

---

## Task 3: progress.ts I/O module

**Files:**
- Create: `src/lib/db/progress.ts`
- Create: `tests/unit/progress.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/progress.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	getProgress,
	upsertProgress,
	pushRating,
	listProgressByPackage,
	listProgressByBucket,
	progressId
} from '../../src/lib/db/progress';
import type { VerseProgress } from '../../src/lib/types';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

const mk = (overrides: Partial<VerseProgress> = {}): VerseProgress => ({
	id: '5_krv:1',
	packageId: '5_krv',
	verseNo: 1,
	bucket: 'new',
	enteredBucketAt: 1000,
	daysActiveInBucket: 0,
	lastReviewedAt: 0,
	citeRatings: [],
	recallRatings: [],
	...overrides
});

describe('progress I/O', () => {
	it('progressId composes id correctly', () => {
		expect(progressId('60_krv', 17)).toBe('60_krv:17');
	});

	it('getProgress returns undefined for missing row', async () => {
		const p = await getProgress('5_krv', 1);
		expect(p).toBeUndefined();
	});

	it('upsertProgress writes and reads back', async () => {
		await upsertProgress(mk({ bucket: 'current' }));
		const p = await getProgress('5_krv', 1);
		expect(p?.bucket).toBe('current');
	});

	it('pushRating(cite) appends to citeRatings and caps at 10', async () => {
		await upsertProgress(mk());
		for (let i = 1; i <= 12; i++) {
			await pushRating('5_krv', 1, 'cite', (i % 4) + 1);
		}
		const p = await getProgress('5_krv', 1);
		expect(p?.citeRatings).toHaveLength(10);
		expect(p?.recallRatings).toHaveLength(0);
	});

	it('pushRating(recall) appends to recallRatings only', async () => {
		await upsertProgress(mk());
		await pushRating('5_krv', 1, 'recall', 3);
		const p = await getProgress('5_krv', 1);
		expect(p?.citeRatings).toEqual([]);
		expect(p?.recallRatings).toEqual([3]);
	});

	it('pushRating updates lastReviewedAt', async () => {
		await upsertProgress(mk({ lastReviewedAt: 0 }));
		const before = Date.now();
		await pushRating('5_krv', 1, 'recall', 3);
		const p = await getProgress('5_krv', 1);
		expect(p!.lastReviewedAt).toBeGreaterThanOrEqual(before);
	});

	it('pushRating is a no-op for missing progress row', async () => {
		await pushRating('nothing', 0, 'cite', 4);
		const p = await getProgress('nothing', 0);
		expect(p).toBeUndefined();
	});

	it('listProgressByPackage filters by packageId', async () => {
		await upsertProgress(mk({ id: '5_krv:1', packageId: '5_krv' }));
		await upsertProgress(mk({ id: '60_krv:1', packageId: '60_krv' }));
		const rows = await listProgressByPackage('5_krv');
		expect(rows).toHaveLength(1);
		expect(rows[0].packageId).toBe('5_krv');
	});

	it('listProgressByBucket filters by bucket', async () => {
		await upsertProgress(mk({ id: '5_krv:1', bucket: 'new' }));
		await upsertProgress(mk({ id: '5_krv:2', verseNo: 2, bucket: 'current' }));
		const news = await listProgressByBucket('new');
		expect(news).toHaveLength(1);
		expect(news[0].bucket).toBe('new');
	});
});
```

- [ ] **Step 2: Run test, see fail**

Run: `pnpm test progress`
Expected: FAIL — module `'$lib/db/progress'` not found.

- [ ] **Step 3: Implement module**

Create `src/lib/db/progress.ts`:

```ts
import { db } from './local';
import type { VerseProgress } from '$lib/types';

const RATING_WINDOW = 10;

export function progressId(packageId: string, verseNo: number): string {
	return `${packageId}:${verseNo}`;
}

export async function getProgress(
	packageId: string,
	verseNo: number
): Promise<VerseProgress | undefined> {
	return db.progress.get(progressId(packageId, verseNo));
}

export async function upsertProgress(p: VerseProgress): Promise<void> {
	await db.progress.put(p);
}

export async function pushRating(
	packageId: string,
	verseNo: number,
	axis: 'cite' | 'recall',
	score: number
): Promise<void> {
	const id = progressId(packageId, verseNo);
	const existing = await db.progress.get(id);
	if (!existing) return;
	const key = axis === 'cite' ? 'citeRatings' : 'recallRatings';
	const next = [...existing[key], score].slice(-RATING_WINDOW);
	await db.progress.put({
		...existing,
		[key]: next,
		lastReviewedAt: Date.now()
	});
}

export async function listProgressByPackage(packageId: string): Promise<VerseProgress[]> {
	return db.progress.where('packageId').equals(packageId).toArray();
}

export async function listProgressByBucket(
	bucket: VerseProgress['bucket']
): Promise<VerseProgress[]> {
	return db.progress.where('bucket').equals(bucket).toArray();
}
```

- [ ] **Step 4: Verify tests pass**

Run: `pnpm test progress`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/progress.ts tests/unit/progress.test.ts
git commit -m "feat(db): add progress I/O module with rating window cap"
```

---

## Task 4: activity.ts I/O module

**Files:**
- Create: `src/lib/db/activity.ts`
- Create: `tests/unit/activity.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/activity.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	markActiveToday,
	daysActiveSince,
	todayLocalKey,
	getActivityHistory
} from '../../src/lib/db/activity';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

describe('activity I/O', () => {
	it('todayLocalKey returns YYYY-MM-DD format', () => {
		const key = todayLocalKey();
		expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('markActiveToday creates a row for today', async () => {
		expect(await db.activity.count()).toBe(0);
		await markActiveToday();
		expect(await db.activity.count()).toBe(1);
	});

	it('markActiveToday is idempotent within one day', async () => {
		await markActiveToday();
		await markActiveToday();
		expect(await db.activity.count()).toBe(1);
	});

	it('daysActiveSince counts entries with dateKey >= cutoff', async () => {
		await db.activity.put({ dateKey: '2026-05-08' });
		await db.activity.put({ dateKey: '2026-05-09' });
		await db.activity.put({ dateKey: '2026-05-10' });
		expect(await daysActiveSince('2026-05-09')).toBe(2);
		expect(await daysActiveSince('2026-05-08')).toBe(3);
		expect(await daysActiveSince('2026-05-11')).toBe(0);
	});

	it('getActivityHistory returns rows sorted ascending by dateKey', async () => {
		await db.activity.put({ dateKey: '2026-05-10' });
		await db.activity.put({ dateKey: '2026-05-08' });
		await db.activity.put({ dateKey: '2026-05-09' });
		const history = await getActivityHistory();
		expect(history.map((h) => h.dateKey)).toEqual(['2026-05-08', '2026-05-09', '2026-05-10']);
	});

	it('getActivityHistory returns empty array when nothing recorded', async () => {
		expect(await getActivityHistory()).toEqual([]);
	});
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm test activity`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement module**

Create `src/lib/db/activity.ts`:

```ts
import { db } from './local';
import type { DailyActivity } from '$lib/types';

export function todayLocalKey(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export async function markActiveToday(): Promise<void> {
	await db.activity.put({ dateKey: todayLocalKey() });
}

export async function daysActiveSince(cutoffKey: string): Promise<number> {
	return db.activity.where('dateKey').aboveOrEqual(cutoffKey).count();
}

export async function getActivityHistory(): Promise<DailyActivity[]> {
	return db.activity.orderBy('dateKey').toArray();
}
```

- [ ] **Step 4: Verify**

Run: `pnpm test activity`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/activity.ts tests/unit/activity.test.ts
git commit -m "feat(db): add activity tracking module"
```

---

## Task 5: activePackage.ts I/O module

**Files:**
- Create: `src/lib/db/activePackage.ts`
- Create: `tests/unit/activePackage.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/activePackage.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	getActivePackageId,
	setActivePackage,
	clearActivePackage
} from '../../src/lib/db/activePackage';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

describe('activePackage', () => {
	it('returns null when no active package set', async () => {
		expect(await getActivePackageId()).toBeNull();
	});

	it('round-trips set and get', async () => {
		await setActivePackage('60_krv');
		expect(await getActivePackageId()).toBe('60_krv');
	});

	it('overwrites previous value on set', async () => {
		await setActivePackage('60_krv');
		await setActivePackage('100_krv');
		expect(await getActivePackageId()).toBe('100_krv');
	});

	it('clearActivePackage returns to null', async () => {
		await setActivePackage('60_krv');
		await clearActivePackage();
		expect(await getActivePackageId()).toBeNull();
	});

	it('returns null when stored value is malformed (string)', async () => {
		await db.settings.put({ key: 'active_package', value: 'broken' });
		expect(await getActivePackageId()).toBeNull();
	});

	it('returns null when stored value lacks packageId field', async () => {
		await db.settings.put({ key: 'active_package', value: { setAt: 123 } });
		expect(await getActivePackageId()).toBeNull();
	});
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm test activePackage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement module**

Create `src/lib/db/activePackage.ts`:

```ts
import { db } from './local';

const KEY = 'active_package';

interface ActivePackageRecord {
	packageId: string;
	setAt: number;
}

export async function getActivePackageId(): Promise<string | null> {
	const entry = await db.settings.get(KEY);
	const value = entry?.value;
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const id = (value as Partial<ActivePackageRecord>).packageId;
	return typeof id === 'string' ? id : null;
}

export async function setActivePackage(packageId: string): Promise<void> {
	const record: ActivePackageRecord = { packageId, setAt: Date.now() };
	await db.settings.put({ key: KEY, value: record });
}

export async function clearActivePackage(): Promise<void> {
	await db.settings.delete(KEY);
}
```

- [ ] **Step 4: Verify**

Run: `pnpm test activePackage`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/activePackage.ts tests/unit/activePackage.test.ts
git commit -m "feat(db): add active package preference module"
```

---

## Task 6: buckets.ts pure logic

**Files:**
- Create: `src/lib/srs/buckets.ts`
- Create: `tests/unit/buckets.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/buckets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
	NEW_DURATION_DAYS,
	CURRENT_DURATION_DAYS,
	shouldGraduate,
	advanceBucket
} from '../../src/lib/srs/buckets';
import type { VerseProgress } from '../../src/lib/types';

const mk = (overrides: Partial<VerseProgress> = {}): VerseProgress => ({
	id: 'pkg:1',
	packageId: 'pkg',
	verseNo: 1,
	bucket: 'new',
	enteredBucketAt: 1000,
	daysActiveInBucket: 0,
	lastReviewedAt: 0,
	citeRatings: [],
	recallRatings: [],
	...overrides
});

describe('shouldGraduate', () => {
	it('returns true when New card has reached NEW_DURATION_DAYS', () => {
		expect(
			shouldGraduate(mk({ bucket: 'new', daysActiveInBucket: NEW_DURATION_DAYS }))
		).toBe(true);
	});

	it('returns false when New card is below threshold', () => {
		expect(
			shouldGraduate(mk({ bucket: 'new', daysActiveInBucket: NEW_DURATION_DAYS - 1 }))
		).toBe(false);
	});

	it('returns true when Current card has reached CURRENT_DURATION_DAYS', () => {
		expect(
			shouldGraduate(mk({ bucket: 'current', daysActiveInBucket: CURRENT_DURATION_DAYS }))
		).toBe(true);
	});

	it('returns false when Current card is below threshold', () => {
		expect(
			shouldGraduate(mk({ bucket: 'current', daysActiveInBucket: CURRENT_DURATION_DAYS - 1 }))
		).toBe(false);
	});

	it('returns false for Old (no auto-graduation)', () => {
		expect(shouldGraduate(mk({ bucket: 'old', daysActiveInBucket: 9999 }))).toBe(false);
	});

	it('returns false for Mastered', () => {
		expect(shouldGraduate(mk({ bucket: 'mastered', daysActiveInBucket: 9999 }))).toBe(false);
	});
});

describe('advanceBucket', () => {
	it('new → current', () => {
		const result = advanceBucket(mk({ bucket: 'new', daysActiveInBucket: 7 }));
		expect(result.bucket).toBe('current');
	});

	it('current → old', () => {
		const result = advanceBucket(mk({ bucket: 'current', daysActiveInBucket: 42 }));
		expect(result.bucket).toBe('old');
	});

	it('resets daysActiveInBucket to 0 on transition', () => {
		const result = advanceBucket(mk({ bucket: 'new', daysActiveInBucket: 7 }));
		expect(result.daysActiveInBucket).toBe(0);
	});

	it('updates enteredBucketAt to now on transition', () => {
		const before = Date.now();
		const result = advanceBucket(mk({ bucket: 'new', enteredBucketAt: 1000 }));
		expect(result.enteredBucketAt).toBeGreaterThanOrEqual(before);
	});

	it('does not mutate input', () => {
		const input = mk({ bucket: 'new', daysActiveInBucket: 7 });
		const copy = { ...input };
		advanceBucket(input);
		expect(input).toEqual(copy);
	});

	it('old returns unchanged (no further advance)', () => {
		const input = mk({ bucket: 'old', daysActiveInBucket: 100 });
		const result = advanceBucket(input);
		expect(result.bucket).toBe('old');
		expect(result).toBe(input); // same reference, not advanced
	});

	it('mastered returns unchanged', () => {
		const input = mk({ bucket: 'mastered' });
		const result = advanceBucket(input);
		expect(result.bucket).toBe('mastered');
	});

	it('preserves citeRatings and recallRatings on transition', () => {
		const input = mk({
			bucket: 'new',
			citeRatings: [3, 4, 2],
			recallRatings: [2, 3, 4]
		});
		const result = advanceBucket(input);
		expect(result.citeRatings).toEqual([3, 4, 2]);
		expect(result.recallRatings).toEqual([2, 3, 4]);
	});
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm test buckets`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement module**

Create `src/lib/srs/buckets.ts`:

```ts
import type { Bucket, VerseProgress } from '$lib/types';

export const NEW_DURATION_DAYS = 7;
export const CURRENT_DURATION_DAYS = 42;

export function shouldGraduate(p: VerseProgress): boolean {
	if (p.bucket === 'new') return p.daysActiveInBucket >= NEW_DURATION_DAYS;
	if (p.bucket === 'current') return p.daysActiveInBucket >= CURRENT_DURATION_DAYS;
	return false;
}

export function advanceBucket(p: VerseProgress): VerseProgress {
	const nextBucket: Bucket =
		p.bucket === 'new' ? 'current' : p.bucket === 'current' ? 'old' : p.bucket;
	if (nextBucket === p.bucket) return p;
	return {
		...p,
		bucket: nextBucket,
		enteredBucketAt: Date.now(),
		daysActiveInBucket: 0
	};
}
```

- [ ] **Step 4: Verify**

Run: `pnpm test buckets`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/srs/buckets.ts tests/unit/buckets.test.ts
git commit -m "feat(srs): add bucket graduation logic"
```

---

## Task 7: oldWindow.ts pure logic

**Files:**
- Create: `src/lib/srs/oldWindow.ts`
- Create: `tests/unit/oldWindow.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/oldWindow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { priorityScore, selectOldActiveWindow } from '../../src/lib/srs/oldWindow';
import type { VerseProgress } from '../../src/lib/types';

const mk = (overrides: Partial<VerseProgress> = {}): VerseProgress => ({
	id: 'pkg:1',
	packageId: 'pkg',
	verseNo: 1,
	bucket: 'old',
	enteredBucketAt: 0,
	daysActiveInBucket: 0,
	lastReviewedAt: 0,
	citeRatings: [],
	recallRatings: [],
	...overrides
});

describe('priorityScore', () => {
	it('returns 0 for empty rating history (highest priority)', () => {
		expect(priorityScore(mk())).toBe(0);
	});

	it('returns average of last-5 cite + last-5 recall ratings', () => {
		const p = mk({ citeRatings: [4, 4, 4, 4, 4], recallRatings: [4, 4, 4, 4, 4] });
		expect(priorityScore(p)).toBe(4);
	});

	it('uses only last 5 of each axis', () => {
		const p = mk({
			citeRatings: [1, 1, 1, 1, 1, 4, 4, 4, 4, 4],
			recallRatings: [1, 1, 1, 1, 1, 4, 4, 4, 4, 4]
		});
		expect(priorityScore(p)).toBe(4);
	});

	it('mixed ratings produce intermediate score', () => {
		const p = mk({ citeRatings: [1, 2, 3, 4], recallRatings: [4, 3, 2, 1] });
		expect(priorityScore(p)).toBeCloseTo(2.5, 5);
	});

	it('cite-only history scores against just cite axis', () => {
		const p = mk({ citeRatings: [2, 2, 2], recallRatings: [] });
		expect(priorityScore(p)).toBe(2);
	});
});

describe('selectOldActiveWindow', () => {
	it('returns at most 12 entries', () => {
		const cards = Array.from({ length: 30 }, (_, i) =>
			mk({ id: `pkg:${i}`, verseNo: i, citeRatings: [3], recallRatings: [3] })
		);
		expect(selectOldActiveWindow(cards)).toHaveLength(12);
	});

	it('returns all cards when fewer than 12', () => {
		const cards = Array.from({ length: 5 }, (_, i) => mk({ id: `pkg:${i}`, verseNo: i }));
		expect(selectOldActiveWindow(cards)).toHaveLength(5);
	});

	it('returns empty array for empty input', () => {
		expect(selectOldActiveWindow([])).toEqual([]);
	});

	it('orders by priority ascending (lowest score first = neediest)', () => {
		const a = mk({ id: 'pkg:1', citeRatings: [4, 4], recallRatings: [4, 4] });
		const b = mk({ id: 'pkg:2', citeRatings: [1, 1], recallRatings: [1, 1] });
		const c = mk({ id: 'pkg:3', citeRatings: [], recallRatings: [] });
		const result = selectOldActiveWindow([a, b, c]);
		expect(result.map((p) => p.id)).toEqual(['pkg:3', 'pkg:2', 'pkg:1']);
	});

	it('breaks ties by oldest lastReviewedAt first', () => {
		const a = mk({ id: 'pkg:1', citeRatings: [3], recallRatings: [3], lastReviewedAt: 2000 });
		const b = mk({ id: 'pkg:2', citeRatings: [3], recallRatings: [3], lastReviewedAt: 1000 });
		const result = selectOldActiveWindow([a, b]);
		expect(result.map((p) => p.id)).toEqual(['pkg:2', 'pkg:1']);
	});

	it('does not mutate input array', () => {
		const cards = [
			mk({ id: 'a', citeRatings: [4] }),
			mk({ id: 'b', citeRatings: [1] })
		];
		const before = cards.map((c) => c.id);
		selectOldActiveWindow(cards);
		expect(cards.map((c) => c.id)).toEqual(before);
	});
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm test oldWindow`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement module**

Create `src/lib/srs/oldWindow.ts`:

```ts
import type { VerseProgress } from '$lib/types';

const ACTIVE_WINDOW_SIZE = 12;
const SCORING_WINDOW = 5;

export function priorityScore(p: VerseProgress): number {
	const cite = p.citeRatings.slice(-SCORING_WINDOW);
	const recall = p.recallRatings.slice(-SCORING_WINDOW);
	const recent = [...cite, ...recall];
	if (recent.length === 0) return 0;
	return recent.reduce((a, b) => a + b, 0) / recent.length;
}

export function selectOldActiveWindow(allOld: VerseProgress[]): VerseProgress[] {
	return [...allOld]
		.sort((a, b) => priorityScore(a) - priorityScore(b) || a.lastReviewedAt - b.lastReviewedAt)
		.slice(0, ACTIVE_WINDOW_SIZE);
}
```

- [ ] **Step 4: Verify**

Run: `pnpm test oldWindow`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/srs/oldWindow.ts tests/unit/oldWindow.test.ts
git commit -m "feat(srs): add Old window priority surfacing"
```

---

## Task 8: intake.ts pure logic

**Files:**
- Create: `src/lib/srs/intake.ts`
- Create: `tests/unit/intake.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/intake.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { recommendNext } from '../../src/lib/srs/intake';
import type { VerseProgress } from '../../src/lib/types';
import type { StoredVerse } from '../../src/lib/db/local';

const verse = (no: number): StoredVerse => ({
	package_id: 'pkg',
	no,
	i: no,
	title: `t${no}`,
	cite: `c${no}`,
	w: `w${no}`
});

const progress = (no: number, bucket: VerseProgress['bucket']): VerseProgress => ({
	id: `pkg:${no}`,
	packageId: 'pkg',
	verseNo: no,
	bucket,
	enteredBucketAt: 0,
	daysActiveInBucket: 0,
	lastReviewedAt: 0,
	citeRatings: [],
	recallRatings: []
});

describe('recommendNext', () => {
	it('returns first verse when no progress exists', () => {
		expect(recommendNext([verse(1), verse(2), verse(3)], [])).toBe(1);
	});

	it('skips verses already in any bucket', () => {
		const prog = [progress(1, 'new'), progress(2, 'current')];
		expect(recommendNext([verse(1), verse(2), verse(3)], prog)).toBe(3);
	});

	it('skips Old verses', () => {
		const prog = [progress(1, 'old')];
		expect(recommendNext([verse(1), verse(2)], prog)).toBe(2);
	});

	it('skips Mastered verses', () => {
		const prog = [progress(1, 'mastered')];
		expect(recommendNext([verse(1), verse(2)], prog)).toBe(2);
	});

	it('returns null when all verses are in some bucket', () => {
		const prog = [progress(1, 'old'), progress(2, 'mastered')];
		expect(recommendNext([verse(1), verse(2)], prog)).toBeNull();
	});

	it('orders by verseNo ascending (package author intent)', () => {
		expect(recommendNext([verse(3), verse(1), verse(2)], [])).toBe(1);
	});

	it('returns null for empty package', () => {
		expect(recommendNext([], [])).toBeNull();
	});

	it('treats progress for different package as not-memorized for this package', () => {
		const otherPkg: VerseProgress = { ...progress(1, 'new'), id: 'other:1', packageId: 'other' };
		// recommendNext only takes this-package progress; caller should pre-filter.
		// Test documents the invariant: we only check verseNo membership.
		expect(recommendNext([verse(1)], [])).toBe(1);
		expect(recommendNext([verse(1)], [otherPkg])).toBeNull();
		// Note: caller is responsible for passing only same-package progress.
	});
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm test intake`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement module**

Create `src/lib/srs/intake.ts`:

```ts
import type { VerseProgress } from '$lib/types';
import type { StoredVerse } from '$lib/db/local';

/**
 * Picks the next unmemorized verse from a package, ordered by verseNo ascending.
 * Caller passes only this-package progress; this function does NOT filter by packageId.
 */
export function recommendNext(
	packageVerses: StoredVerse[],
	packageProgress: VerseProgress[]
): number | null {
	const memorizedNos = new Set(packageProgress.map((p) => p.verseNo));
	const candidates = packageVerses
		.filter((v) => !memorizedNos.has(v.no))
		.sort((a, b) => a.no - b.no);
	return candidates[0]?.no ?? null;
}
```

- [ ] **Step 4: Verify**

Run: `pnpm test intake`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/srs/intake.ts tests/unit/intake.test.ts
git commit -m "feat(srs): add intake recommendation logic"
```

---

## Task 9: scheduler.ts pure logic

**Files:**
- Create: `src/lib/srs/scheduler.ts`
- Create: `tests/unit/scheduler.test.ts`

This is the queue composer. It takes pre-graduated progress (graduation orchestration is handled in the next sub-plan, by the Today page's `load()` function) and returns today's queue mixing New + rotating Current + Old window surface.

- [ ] **Step 1: Write failing tests**

Create `tests/unit/scheduler.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildTodayQueue } from '../../src/lib/srs/scheduler';
import type { VerseProgress, DailyActivity } from '../../src/lib/types';

const mk = (overrides: Partial<VerseProgress> = {}): VerseProgress => ({
	id: 'pkg:1',
	packageId: 'pkg',
	verseNo: 1,
	bucket: 'new',
	enteredBucketAt: 0,
	daysActiveInBucket: 0,
	lastReviewedAt: 0,
	citeRatings: [],
	recallRatings: [],
	...overrides
});

const activity = (count: number): DailyActivity[] =>
	Array.from({ length: count }, (_, i) => ({
		dateKey: `2026-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`
	}));

describe('buildTodayQueue', () => {
	it('returns empty queue for empty progress', () => {
		expect(buildTodayQueue([], [])).toEqual([]);
	});

	it('includes all New cards every day', () => {
		const news = [
			mk({ id: 'pkg:1', verseNo: 1, bucket: 'new' }),
			mk({ id: 'pkg:2', verseNo: 2, bucket: 'new' })
		];
		const queue = buildTodayQueue(news, activity(0));
		expect(queue.filter((p) => p.bucket === 'new')).toHaveLength(2);
	});

	it('rotates Current cards across a 3-day cycle', () => {
		const currents = Array.from({ length: 12 }, (_, i) =>
			mk({ id: `pkg:${i}`, verseNo: i, bucket: 'current' })
		);
		const day0 = buildTodayQueue(currents, activity(0)).filter((p) => p.bucket === 'current');
		const day1 = buildTodayQueue(currents, activity(1)).filter((p) => p.bucket === 'current');
		const day2 = buildTodayQueue(currents, activity(2)).filter((p) => p.bucket === 'current');
		// each day surfaces a non-empty subset
		expect(day0.length).toBeGreaterThan(0);
		expect(day1.length).toBeGreaterThan(0);
		expect(day2.length).toBeGreaterThan(0);
		// over 3 days, every card appears at least once
		const seen = new Set([
			...day0.map((p) => p.id),
			...day1.map((p) => p.id),
			...day2.map((p) => p.id)
		]);
		expect(seen.size).toBe(12);
	});

	it('Current rotation is deterministic per id (same day → same set)', () => {
		const currents = Array.from({ length: 12 }, (_, i) =>
			mk({ id: `pkg:${i}`, verseNo: i, bucket: 'current' })
		);
		const a = buildTodayQueue(currents, activity(5));
		const b = buildTodayQueue(currents, activity(5));
		expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
	});

	it('surfaces 1-2 Old cards per day from active window', () => {
		const olds = Array.from({ length: 30 }, (_, i) =>
			mk({ id: `pkg:${i}`, verseNo: i, bucket: 'old' })
		);
		const queue = buildTodayQueue(olds, activity(0));
		const oldInQueue = queue.filter((p) => p.bucket === 'old');
		expect(oldInQueue.length).toBeGreaterThanOrEqual(1);
		expect(oldInQueue.length).toBeLessThanOrEqual(2);
	});

	it('surfaces no Old when there are no Old cards', () => {
		const queue = buildTodayQueue([mk({ bucket: 'new' })], []);
		expect(queue.filter((p) => p.bucket === 'old')).toHaveLength(0);
	});

	it('excludes Mastered cards entirely', () => {
		const queue = buildTodayQueue([mk({ id: 'pkg:1', bucket: 'mastered' })], []);
		expect(queue).toHaveLength(0);
	});

	it('mixes New, Current, and Old buckets in one queue', () => {
		const mix = [
			mk({ id: 'pkg:1', verseNo: 1, bucket: 'new' }),
			mk({ id: 'pkg:2', verseNo: 2, bucket: 'current' }),
			mk({ id: 'pkg:3', verseNo: 3, bucket: 'old' }),
			mk({ id: 'pkg:4', verseNo: 4, bucket: 'mastered' })
		];
		const queue = buildTodayQueue(mix, []);
		const buckets = new Set(queue.map((p) => p.bucket));
		expect(buckets.has('new')).toBe(true);
		expect(buckets.has('old')).toBe(true);
		expect(buckets.has('mastered')).toBe(false);
	});
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm test scheduler`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement module**

Create `src/lib/srs/scheduler.ts`:

```ts
import type { VerseProgress, DailyActivity } from '$lib/types';
import { selectOldActiveWindow } from './oldWindow';

const CURRENT_ROTATION_BUCKETS = 3;
const OLD_PER_DAY = 2;

/**
 * Stable hash of a verse id. Returns the same number for the same id every time.
 * Used to assign each Current card to a deterministic 0/1/2 rotation slot.
 */
function rotationSlot(verseId: string): number {
	let hash = 0;
	for (let i = 0; i < verseId.length; i++) {
		hash = (hash * 31 + verseId.charCodeAt(i)) | 0;
	}
	return Math.abs(hash) % CURRENT_ROTATION_BUCKETS;
}

/**
 * Composes today's review queue from already-graduated progress.
 * Activity history length is the day index; the caller is responsible for
 * having marked today active (or not) before calling this.
 *
 * Auto-graduation is NOT done here — call applyGraduations (Phase 3.2)
 * before passing progress in.
 */
export function buildTodayQueue(
	progress: VerseProgress[],
	activityHistory: DailyActivity[]
): VerseProgress[] {
	const dayIndex = activityHistory.length;

	const news = progress.filter((p) => p.bucket === 'new');

	const currents = progress
		.filter((p) => p.bucket === 'current')
		.filter((p) => rotationSlot(p.id) === dayIndex % CURRENT_ROTATION_BUCKETS);

	const oldWindow = selectOldActiveWindow(progress.filter((p) => p.bucket === 'old'));
	const olds: VerseProgress[] = [];
	if (oldWindow.length > 0) {
		const start = (dayIndex * OLD_PER_DAY) % oldWindow.length;
		for (let i = 0; i < OLD_PER_DAY; i++) {
			olds.push(oldWindow[(start + i) % oldWindow.length]);
		}
		// dedupe (small windows can produce same id twice)
		const seen = new Set<string>();
		const uniqueOlds = olds.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
		olds.length = 0;
		olds.push(...uniqueOlds);
	}

	return [...news, ...currents, ...olds];
}
```

- [ ] **Step 4: Verify**

Run: `pnpm test scheduler`
Expected: PASS — 8 tests.

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: PASS — 80+ existing tests + ~50 new = ~130 tests, all green.

- [ ] **Step 6: Run type check**

Run: `pnpm check`
Expected: PASS — 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add src/lib/srs/scheduler.ts tests/unit/scheduler.test.ts
git commit -m "feat(srs): add today queue composition (scheduler)"
```

---

## Self-Review

### Spec coverage

| Spec section | Implemented in |
|---|---|
| `Bucket` type | Task 1 |
| `VerseProgress` interface | Task 1 |
| `DailyActivity` interface | Task 1 |
| Dexie schema v2 with progress/activity tables | Task 2 |
| `progress` indexed by `packageId` and `bucket` | Task 2 (test asserts both indexes) |
| Sliding window cap (last 10 ratings) | Task 3 (`pushRating`) |
| `markActiveToday` idempotent | Task 4 |
| `daysActiveSince` counts distinct days | Task 4 |
| Single-row active package preference | Task 5 |
| Time graduation thresholds (7 days New, 42 days Current) | Task 6 |
| `advanceBucket` immutable | Task 6 |
| Old → priority surface (no auto-grad) | Task 6 (`shouldGraduate` returns false for Old) |
| `priorityScore` from sliding-5 each axis | Task 7 |
| 12-card active Old window with tie-break | Task 7 |
| Recommend next unmemorized verse, ordered by verseNo | Task 8 |
| `buildTodayQueue` composes New + rotating Current + Old surface | Task 9 |
| Mastered excluded from queue | Task 9 |

**Auto-graduation orchestration** (running `shouldGraduate`/`advanceBucket` over loaded progress, persisting transitions, then calling `buildTodayQueue`) is *not* in this sub-plan. It belongs in Phase 3.2 with the Today page `load()` function. This is intentional separation: keeps scheduler pure and decisions easy to test in isolation.

### Placeholder scan

No "TBD", "TODO", "implement later", or vague handwaving. Each step has concrete code, exact paths, exact commands, exact expected output.

### Type consistency

- `Bucket` used identically in types.ts, buckets.ts, oldWindow.ts, intake.ts, scheduler.ts, progress.ts
- `VerseProgress` field names consistent: `daysActiveInBucket`, `enteredBucketAt`, `citeRatings`, `recallRatings`, `lastReviewedAt`
- `progressId(packageId, verseNo)` returns `${packageId}:${verseNo}`; used in tests and impl identically
- `pushRating` axis param: `'cite' | 'recall'` everywhere
- Dexie schema indexes match field names: `&id, packageId, bucket`

### Out of Scope (covered in later sub-plans)

- Auto-graduation orchestration in load() — Phase 3.2
- `daysActiveInBucket` increment on review (needs `lastActiveDayKey` on VerseProgress, deferred to avoid scope creep) — Phase 3.2
- Today page UI, ReviewCard, RatingButtons — Phase 3.2
- Home hero update — Phase 3.3
- Library/verse-detail bucket UI — Phase 3.4
- Intake suggestion prompt UI — Phase 3.5
