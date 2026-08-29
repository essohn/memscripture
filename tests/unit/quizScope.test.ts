import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/lib/db/local';
import { listTargets, offerableTargets, newestAttempt, resolveTarget, type Target } from '../../src/lib/quiz/scope';

// listRecentChecks defaults to the real implementation below, so every test
// but the one that overrides it reads through fake-indexeddb like normal.
const { listRecentChecksMock } = vi.hoisted(() => ({ listRecentChecksMock: vi.fn() }));

vi.mock('../../src/lib/db/checkHistory', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../src/lib/db/checkHistory')>();
	listRecentChecksMock.mockImplementation(actual.listRecentChecks);
	return { ...actual, listRecentChecks: listRecentChecksMock };
});

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

	// beforeEach already installs a_krv with verses 1 and 2 and no history.
	it('returns a signal for every verse, including one never checked', async () => {
		const { signals } = await resolveTarget({ kind: 'package', id: 'a_krv', label: 'A구절' });
		expect(signals.get('a_krv:1')).toEqual({ fails: 0, passes: 0, lastAskedAt: undefined });
		expect(signals.get('a_krv:2')).toEqual({ fails: 0, passes: 0, lastAskedAt: undefined });
	});

	it("counts a failed check into the verse's signal", async () => {
		await db.checkHistory.add({
			id: 'a_krv:1:1000',
			verseKey: 'a_krv:1',
			packageId: 'a_krv',
			verseNo: 1,
			checkedAt: 1000,
			start: null,
			full: null,
			accuracy: 0.5,
			elapsedMs: 1000
		});
		const { signals } = await resolveTarget({ kind: 'package', id: 'a_krv', label: 'A구절' });
		expect(signals.get('a_krv:1')?.fails).toBe(1);
	});

	it('returns the recorded near miss as an attempt', async () => {
		await db.checkHistory.add({
			id: 'a_krv:1:1000',
			verseKey: 'a_krv:1',
			packageId: 'a_krv',
			verseNo: 1,
			checkedAt: 1000,
			start: null,
			full: null,
			accuracy: 0.95,
			elapsedMs: 1000,
			typed: '거의 맞은 문장'
		});
		const { attempts } = await resolveTarget({ kind: 'package', id: 'a_krv', label: 'A구절' });
		expect(attempts.get('a_krv:1')).toBe('거의 맞은 문장');
	});

	// The verses are fine; only the history read failed. Emptying the scope
	// would tell the reader they have nothing to quiz, which is false.
	it('keeps the scope intact when the history read fails', async () => {
		listRecentChecksMock.mockRejectedValueOnce(new Error('read failed'));
		const r = await resolveTarget({ kind: 'package', id: 'a_krv', label: 'A구절' });
		expect(r.items).toHaveLength(2);
		expect(r.signals.size).toBe(0);
		expect(r.attempts.size).toBe(0);
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

describe('newestAttempt', () => {
	// Rows arrive newest-first, as listRecentChecks returns them.
	const near = (typed: string) => ({ typed, accuracy: 0.95 });

	it('returns nothing when no attempt was ever kept', () => {
		expect(newestAttempt([])).toBeUndefined();
	});

	it('returns the stored attempt for a verse that has one', () => {
		expect(newestAttempt([near('거의 맞은 문장')])).toBe('거의 맞은 문장');
	});

	it('prefers the newer of two stored attempts', () => {
		expect(newestAttempt([near('새 문장'), near('옛 문장')])).toBe('새 문장');
	});

	it('is not erased by a later clean check', () => {
		expect(newestAttempt([{ typed: undefined, accuracy: 1 }, near('거의 맞은 문장')])).toBe(
			'거의 맞은 문장'
		);
	});

	it('is not displaced by a later clean check that kept its own sentence', () => {
		expect(newestAttempt([{ typed: '완벽한 문장', accuracy: 1 }, near('거의 맞은 문장')])).toBe(
			'거의 맞은 문장'
		);
	});

	it('does not offer a perfect attempt as a question', () => {
		expect(newestAttempt([{ typed: '완벽한 문장', accuracy: 1 }])).toBeUndefined();
	});

	// It used to refuse this. Every check the confetti did not fire on is
	// material now: the sentence is the reader's either way, and a thin
	// question beats a game with nothing in it.
	it('offers a collapsed attempt as a question', () => {
		expect(newestAttempt([{ typed: '앞부분만', accuracy: 0.3 }])).toBe('앞부분만');
	});
});

describe('offerableTargets', () => {
	const ev = (id: string, label: string) => ({ kind: 'event' as const, id, label, ranges: [] });
	const pkg = (id: string, label: string) => ({ kind: 'package' as const, id, label });

	// The DAY led and the packages were hidden behind it, which meant the quiz
	// could only ask about this month's hundred and fifty verses while every
	// check recorded against the other nine hundred sat there unusable. It
	// still leads; it no longer stands alone.
	it('leads with the 암송 DAYs and keeps the packages behind them', () => {
		const out = offerableTargets([pkg('a_krv', 'A구절'), ev('e1', '11월 암송 데이'), pkg('b_krv', 'B구절')]);
		expect(out.map((t) => t.id)).toEqual(['e1', 'a_krv', 'b_krv']);
	});

	it('keeps every DAY, in front of the packages', () => {
		const out = offerableTargets([ev('e1', '1월'), ev('e2', '2월'), pkg('a_krv', 'A구절')]);
		expect(out.map((t) => t.id)).toEqual(['e1', 'e2', 'a_krv']);
	});

	// Without this a reader with no DAY would meet an empty picker and no way
	// to quiz anything at all.
	it('falls back to packages when there is no DAY', () => {
		const out = offerableTargets([pkg('a_krv', 'A구절'), pkg('b_krv', 'B구절')]);
		expect(out.map((t) => t.id)).toEqual(['a_krv', 'b_krv']);
	});

	it('has nothing to offer from nothing', () => {
		expect(offerableTargets([])).toEqual([]);
	});
});

describe('newestAttempt — 빈 답안', () => {
	// 포기 without typing leaves an empty string. It is scored as a miss like
	// any other, and now that every miss is a question the emptiness is the
	// only thing standing between it and being asked about.
	it('passes over an attempt with nothing in it', () => {
		expect(newestAttempt([{ typed: '', accuracy: 0 }])).toBeUndefined();
		expect(newestAttempt([{ typed: '   ', accuracy: 0 }])).toBeUndefined();
	});

	it('takes the newest one that has something in it', () => {
		expect(
			newestAttempt([
				{ typed: '', accuracy: 0 },
				{ typed: '그들에게 율례와', accuracy: 0.2 }
			])
		).toBe('그들에게 율례와');
	});

	// The floor is gone: a collapse is a question now, because a thin question
	// beats a game with nothing in it.
	it('keeps an attempt that collapsed', () => {
		expect(newestAttempt([{ typed: '그', accuracy: 0.02 }])).toBe('그');
	});

	it('still passes over a flawless one', () => {
		expect(newestAttempt([{ typed: '온전히 맞은 문장', accuracy: 1 }])).toBeUndefined();
	});
});
