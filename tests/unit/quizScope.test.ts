import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/local';
import { listTargets, loadAttempts, resolveTarget, type Target } from '../../src/lib/quiz/scope';
import { recordCheck } from '../../src/lib/db/checkHistory';

beforeEach(async () => {
	await db.delete();
	await db.open();
	await db.packages.bulkPut([
		{ id: 'a_krv', name: 'A구절' },
		{ id: 'b_krv', name: 'B구절' },
		// Registered but never installed: listPackages returns it, but no
		// verse row exists for it. listTargets must not offer it.
		{ id: 'c_krv', name: 'C구절' }
	] as never);
	await db.verses.bulkPut([
		{ package_id: 'a_krv', no: 1, i: 1, title: 'A1', cite: '창세기 1 : 1', w: 'a one' },
		{ package_id: 'a_krv', no: 2, i: 2, title: 'A2', cite: '창세기 1 : 2', w: 'a two' },
		{ package_id: 'b_krv', no: 1, i: 1, title: 'B1', cite: '출애굽기 1 : 1', w: 'b one' }
	] as never);
	await db.verseRatings.bulkPut([
		{ id: 'a_krv:1', packageId: 'a_krv', verseNo: 1, startDifficulty: 2, fullDifficulty: 4, updatedAt: 1 },
		{ id: 'b_krv:1', packageId: 'b_krv', verseNo: 1, startDifficulty: 5, fullDifficulty: 5, updatedAt: 1 }
	] as never);
});

const event = (ranges: { packageId: string; verseNos: number[] }[]): Target => ({
	kind: 'event',
	id: 'e1',
	label: '11월 암송 데이',
	ranges
});

describe('resolveTarget', () => {
	// One 암송 DAY can name ranges in two packages. Both belong to the session,
	// in the order the ranges are written.
	it('gathers an event that spans two packages, in range order', async () => {
		const { items } = await resolveTarget(
			event([
				{ packageId: 'b_krv', verseNos: [1] },
				{ packageId: 'a_krv', verseNos: [2, 1] }
			])
		);
		expect(items.map((i) => i.id)).toEqual(['b_krv:1', 'a_krv:2', 'a_krv:1']);
		expect(items[0]).toMatchObject({ title: 'B1', cite: '출애굽기 1 : 1', w: 'b one' });
	});

	// buildEventCards already skips ranges whose package is not installed;
	// a quiz scope that threw on one would be stricter than the home screen.
	it('skips a range whose package is not installed', async () => {
		const { items } = await resolveTarget(
			event([
				{ packageId: 'missing_krv', verseNos: [1] },
				{ packageId: 'a_krv', verseNos: [1] }
			])
		);
		expect(items.map((i) => i.id)).toEqual(['a_krv:1']);
	});

	// Two packages' verse 1 are different verses. Keyed by number alone, one
	// would take the other's difficulty.
	it('keys ratings by package and verse together', async () => {
		const { ratings } = await resolveTarget(
			event([
				{ packageId: 'a_krv', verseNos: [1] },
				{ packageId: 'b_krv', verseNos: [1] }
			])
		);
		expect(ratings.get('a_krv:1')).toEqual({ start: 2, full: 4 });
		expect(ratings.get('b_krv:1')).toEqual({ start: 5, full: 5 });
	});

	it('serves a whole package in verse order', async () => {
		const { items } = await resolveTarget({ kind: 'package', id: 'a_krv', label: 'A구절' });
		expect(items.map((i) => i.id)).toEqual(['a_krv:1', 'a_krv:2']);
	});

	// loadPackageData installs on a miss. Listing quiz scopes must not have
	// that side effect — the home screen was already fixed for this once.
	it('does not install a package that is missing', async () => {
		await resolveTarget(event([{ packageId: 'missing_krv', verseNos: [1] }]));
		expect(await db.packages.get('missing_krv')).toBeUndefined();
		expect(await db.verses.where('package_id').equals('missing_krv').count()).toBe(0);
	});

	it('returns an empty scope rather than throwing when nothing resolves', async () => {
		const { items, ratings } = await resolveTarget(event([]));
		expect(items).toEqual([]);
		expect(ratings.size).toBe(0);
	});
});

// buildEventCards fetches /data/events.json, which has no server to answer it
// in this environment — the relative URL fails to parse and the rejection is
// swallowed by listTargets' own `.catch(() => [])`, the same fallback a real
// network failure would hit. That keeps these assertions to the package half;
// the event half is proven separately in events.test.ts.
describe('listTargets', () => {
	it('offers an installed package', async () => {
		const targets = await listTargets('2026-08-27');
		const ids = targets.filter((t) => t.kind === 'package').map((t) => t.id);
		expect(ids).toContain('a_krv');
	});

	// listPackages returns the registry, not the installed set — a registered
	// package with no verse rows must not be offered, or the picker preselects
	// a scope that resolves to nothing.
	it('does not offer a registered package with no verses', async () => {
		const targets = await listTargets('2026-08-27');
		const ids = targets.filter((t) => t.kind === 'package').map((t) => t.id);
		expect(ids).not.toContain('c_krv');
	});

	it('carries kind and the package name as label', async () => {
		const targets = await listTargets('2026-08-27');
		const a = targets.find((t) => t.kind === 'package' && t.id === 'a_krv');
		expect(a).toMatchObject({ kind: 'package', label: 'A구절' });
	});
});

describe('loadAttempts', () => {
	const item = (packageId: string, verseNo: number) => ({
		id: `${packageId}:${verseNo}`,
		packageId,
		verseNo,
		title: 't',
		cite: 'c',
		w: 'w'
	});

	it('returns nothing when no attempt was ever kept', async () => {
		expect((await loadAttempts([item('a_krv', 1)])).size).toBe(0);
	});

	it('returns the stored attempt for a verse that has one', async () => {
		await recordCheck('a_krv', 1, { start: null, full: null, accuracy: 0.95, elapsedMs: 1, typed: '거의 맞은 문장' } as never, 1000);
		expect((await loadAttempts([item('a_krv', 1)])).get('a_krv:1')).toBe('거의 맞은 문장');
	});

	// The most recent record with an attempt — not the most recent record,
	// which may well be a later clean check that kept nothing.
	it('is not erased by a later clean check', async () => {
		await recordCheck('a_krv', 1, { start: null, full: null, accuracy: 0.95, elapsedMs: 1, typed: '거의 맞은 문장' } as never, 1000);
		await recordCheck('a_krv', 1, { start: null, full: null, accuracy: 1, elapsedMs: 1 } as never, 2000);
		expect((await loadAttempts([item('a_krv', 1)])).get('a_krv:1')).toBe('거의 맞은 문장');
	});

	it('prefers the newer of two stored attempts', async () => {
		await recordCheck('a_krv', 1, { start: null, full: null, accuracy: 0.95, elapsedMs: 1, typed: '먼저' } as never, 1000);
		await recordCheck('a_krv', 1, { start: null, full: null, accuracy: 0.95, elapsedMs: 1, typed: '나중' } as never, 2000);
		expect((await loadAttempts([item('a_krv', 1)])).get('a_krv:1')).toBe('나중');
	});

	it('keeps two packages\' verse 1 apart', async () => {
		await recordCheck('a_krv', 1, { start: null, full: null, accuracy: 0.95, elapsedMs: 1, typed: 'A' } as never, 1000);
		await recordCheck('b_krv', 1, { start: null, full: null, accuracy: 0.95, elapsedMs: 1, typed: 'B' } as never, 1000);
		const got = await loadAttempts([item('a_krv', 1), item('b_krv', 1)]);
		expect(got.get('a_krv:1')).toBe('A');
		expect(got.get('b_krv:1')).toBe('B');
	});
});
