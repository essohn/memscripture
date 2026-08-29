import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	dDay, activeEvents, isMemorized, rangeHref, serializeEventRange,
	loadEvents, resolveRangeVerseNos, rangeProgress, buildEventCards, _resetEventsCache,
	eventStats, versesAtLevel, versesByPerfection, statsVersesHref, statsPerfectHref,
	hasEventStats, DIMENSION_LABELS, statsListHeading, parseStatsLevel, type RangeCardVM
} from '../../src/lib/db/events';
import { recordCheck } from '../../src/lib/db/checkHistory';
import { db } from '../../src/lib/db/local';
import { listPackages, installPackage, isPackageInstalled } from '../../src/lib/db/verses';
import { upsertProgress } from '../../src/lib/db/progress';
import { setStartDifficulty, setFullDifficulty, DIFFICULTY_LEVELS } from '../../src/lib/db/verseRatings';
import type { MemEvent, VerseProgress } from '../../src/lib/types';

const ev = (over: Partial<MemEvent> = {}): MemEvent => ({
	id: 'e1',
	title: '11월 암송 데이',
	dueAt: '2026-11-09',
	ranges: [],
	...over
});

describe('dDay', () => {
	it('counts days until the due date', () => {
		expect(dDay('2026-11-09', '2026-10-28')).toBe(12);
	});
	it('is 0 on the due date and negative after', () => {
		expect(dDay('2026-11-09', '2026-11-09')).toBe(0);
		expect(dDay('2026-11-09', '2026-11-10')).toBe(-1);
	});
	it('handles month boundaries', () => {
		expect(dDay('2026-12-01', '2026-11-30')).toBe(1);
	});
});

describe('activeEvents', () => {
	it('keeps events whose window contains today, sorted by dueAt asc', () => {
		const a = ev({ id: 'a', dueAt: '2026-11-20' });
		const b = ev({ id: 'b', dueAt: '2026-11-05' });
		expect(activeEvents([a, b], '2026-11-01').map((e) => e.id)).toEqual(['b', 'a']);
	});
	it('hides events past their dueAt', () => {
		expect(activeEvents([ev({ dueAt: '2026-11-09' })], '2026-11-10')).toHaveLength(0);
	});
	it('respects startAt when present', () => {
		const e = ev({ startAt: '2026-11-01', dueAt: '2026-11-30' });
		expect(activeEvents([e], '2026-10-31')).toHaveLength(0);
		expect(activeEvents([e], '2026-11-01')).toHaveLength(1);
	});
});

describe('isMemorized', () => {
	const r = (start: number | null, full: number | null) => ({
		id: '5_krv:1', packageId: '5_krv', verseNo: 1,
		startDifficulty: start, fullDifficulty: full, updatedAt: 0
	});
	it('needs both ratings', () => {
		expect(isMemorized(r(3, 4))).toBe(true);
		expect(isMemorized(r(3, null))).toBe(false);
		expect(isMemorized(r(null, 4))).toBe(false);
		expect(isMemorized(r(null, null))).toBe(false);
	});
	// An untouched verse has no row at all, which must read as not memorized
	// rather than throwing on the lookup.
	it('treats a missing rating row as not memorized', () => {
		expect(isMemorized(undefined)).toBe(false);
	});
	// Level 1 is the hardest tier, not an absent rating — a truthiness check
	// here would silently discount every verse rated 1.
	it('counts level 1, which is falsy as a number', () => {
		expect(isMemorized(r(1, 1))).toBe(true);
	});
});

describe('rangeHref', () => {
	// range=, not sel=. Both used to be sel=, which conflated two intents: a
	// recent bundle restores a selection the reader made, while an event card
	// is "show me these verses to study". Selection mode is right for the
	// first and wrong for the second.
	it('builds a range link for verseNos ranges', () => {
		expect(rangeHref({ packageId: '8_krv', verseNos: [1] }, [1])).toBe('/library/8_krv?range=1');
	});
	it('includes s and g for series/group ranges', () => {
		const href = rangeHref({ packageId: '60_krv', seriesIndex: 0, groupIndices: [2] }, [1, 2]);
		expect(href).toBe('/library/60_krv?range=1%2C2&s=0&g=2');
	});
});

describe('serializeEventRange', () => {
	it('emits sorted verseNos plus an empty label placeholder', () => {
		const json = serializeEventRange('8_krv', [3, 1, 2], null, []);
		expect(JSON.parse(json)).toEqual({ packageId: '8_krv', verseNos: [1, 2, 3], label: '' });
	});
	it('includes seriesIndex/groupIndices when set', () => {
		const json = serializeEventRange('60_krv', [1], 0, [2]);
		expect(JSON.parse(json)).toEqual({ packageId: '60_krv', verseNos: [1], seriesIndex: 0, groupIndices: [2], label: '' });
	});
});

const samplePackages = {
	'5_krv': {
		id: '5_krv', name: '샘플', verse_number: 3, translation: 'krv', translation_name: '개역한글',
		abbreviation: '샘플', language: 'kor', copyright: '', copyright_text: '', version: 1,
		source: 'data/5_krv.json', default: true
	}
};
const sampleVerses = [
	{ i: 1, title: 't1', cite: 'c1', w: 'w1' },
	{ i: 2, title: 't2', cite: 'c2', w: 'w2' },
	{ i: 3, title: 't3', cite: 'c3', w: 'w3' }
];
const sampleGroups = [
	{ package_id: '5_krv', group_name: 'A', level: 1, index: [1, 2] },
	{ package_id: '5_krv', group_name: 'B', level: 1, index: [3] }
];
const sampleEvents = [
	{ id: 'e1', title: '11월 암송 데이', dueAt: '2099-12-31', ranges: [{ packageId: '5_krv', verseNos: [1, 2], label: '시편 23편' }] }
];

function mockFetch(map: Record<string, unknown>) {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
		const u = String(url);
		const key = Object.keys(map).find((k) => u.endsWith(k));
		if (!key) return new Response('not found', { status: 404 });
		return new Response(JSON.stringify(map[key]), { status: 200, headers: { 'content-type': 'application/json' } });
	});
}

describe('events data layer', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		vi.restoreAllMocks();
		_resetEventsCache();
	});

	it('loadEvents fetches then caches', async () => {
		mockFetch({ 'data/events.json': sampleEvents });
		const first = await loadEvents();
		expect(first).toHaveLength(1);
		vi.mocked(globalThis.fetch).mockClear();
		await loadEvents();
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});

	it('resolveRangeVerseNos passes verseNos through', async () => {
		expect(await resolveRangeVerseNos({ packageId: '5_krv', verseNos: [2, 1] })).toEqual([2, 1]);
	});

	it('resolveRangeVerseNos resolves a series range to its verse numbers', async () => {
		mockFetch({
			'data/packages.json': samplePackages,
			'data/5_krv.json': sampleVerses,
			'data/packages_index.json': sampleGroups
		});
		await listPackages();
		await installPackage('5_krv');
		const nos = await resolveRangeVerseNos({ packageId: '5_krv', seriesIndex: 0, groupIndices: [] });
		expect(nos).toEqual([1, 2]);
	});

	it('resolveRangeVerseNos returns [] for an uninstalled package (no auto-install)', async () => {
		mockFetch({ 'data/packages.json': samplePackages });
		await listPackages(); // metadata only — verses not installed
		expect(await resolveRangeVerseNos({ packageId: '5_krv', seriesIndex: 0, groupIndices: [] })).toEqual([]);
		expect(await isPackageInstalled('5_krv')).toBe(false); // did not install as a side-effect
	});

	it('rangeProgress counts verses rated on both dimensions', async () => {
		await setStartDifficulty('5_krv', 1, 2);
		await setFullDifficulty('5_krv', 1, 5);
		// Half-rated: started but not finished, so it does not count yet.
		await setStartDifficulty('5_krv', 2, 3);
		expect(await rangeProgress('5_krv', [1, 2])).toEqual({ done: 1, total: 2 });
		expect(await rangeProgress('5_krv', [])).toEqual({ done: 0, total: 0 });
	});

	it('rangeProgress drops a verse back when a rating is cleared', async () => {
		await setStartDifficulty('5_krv', 1, 2);
		await setFullDifficulty('5_krv', 1, 5);
		expect(await rangeProgress('5_krv', [1])).toEqual({ done: 1, total: 1 });
		await setFullDifficulty('5_krv', 1, null);
		expect(await rangeProgress('5_krv', [1])).toEqual({ done: 0, total: 1 });
	});

	it('buildEventCards assembles a card per active event range', async () => {
		mockFetch({ 'data/events.json': sampleEvents });
		// Verse 1 rated on both dimensions, verse 2 untouched → 1 of 2.
		await setStartDifficulty('5_krv', 1, 2);
		await setFullDifficulty('5_krv', 1, 4);
		const cards = await buildEventCards('2099-12-30');
		expect(cards).toHaveLength(1);
		expect(cards[0].eventTitle).toBe('11월 암송 데이');
		expect(cards[0].dDay).toBe(1);
		// The export button needs to name the verses it exports. They are
		// already resolved here for the progress count, so the card carries
		// them rather than making the UI re-parse them out of the href.
		expect(cards[0].ranges[0]).toEqual({
			label: '시편 23편',
			done: 1,
			total: 2,
			href: '/library/5_krv?range=1%2C2',
			packageId: '5_krv',
			verseNos: [1, 2]
		});
	});

	// The stats are read from the same tables the progress count already
	// touches, so the card carries them rather than making the home page go
	// back to Dexie once it has rendered.
	it('carries the event stats on the card', async () => {
		mockFetch({
			'data/events.json': sampleEvents,
			'data/packages.json': samplePackages,
			'data/5_krv.json': sampleVerses,
			'data/packages_index.json': sampleGroups
		});
		await listPackages();
		await installPackage('5_krv');
		await setStartDifficulty('5_krv', 1, 2);
		await setFullDifficulty('5_krv', 1, 4);
		await recordCheck('5_krv', 2, { start: 5, full: 5, accuracy: 1, elapsedMs: 10 }, 1000);

		const cards = await buildEventCards('2099-12-30');
		expect(cards[0].stats).toEqual({
			total: 2,
			perfect: 1,
			start: [0, 0, 1, 0, 0, 0],
			full: [0, 0, 0, 0, 1, 0]
		});
	});

	it("carries each range's verse text for 전체 듣기", async () => {
		mockFetch({
			'data/events.json': sampleEvents,
			'data/packages.json': samplePackages,
			'data/5_krv.json': sampleVerses,
			'data/packages_index.json': sampleGroups
		});
		await listPackages();
		await installPackage('5_krv');
		const [card] = await buildEventCards('2099-12-30');
		expect(card.verses).toEqual([
			{ title: 't1', cite: 'c1', w: 'w1' },
			{ title: 't2', cite: 'c2', w: 'w2' }
		]);
	});

	// The invariant the placement exists for: a range that resolved to nothing
	// is dropped from the card, so its verses must not be heard either —
	// otherwise the reader hears verses that are not on their screen.
	it('omits verses from a range that was skipped', async () => {
		mockFetch({
			'data/events.json': [
				{
					id: 'e4',
					title: '한 범위는 해석 실패',
					dueAt: '2099-12-31',
					ranges: [
						{ packageId: '5_krv', verseNos: [1], label: 'A' },
						// No verseNos and an uninstalled package: resolves to [] and is
						// dropped from `ranges`.
						{ packageId: 'missing_krv', seriesIndex: 0, label: 'B' }
					]
				}
			],
			'data/packages.json': samplePackages,
			'data/5_krv.json': sampleVerses,
			'data/packages_index.json': sampleGroups
		});
		await listPackages();
		await installPackage('5_krv');
		const [card] = await buildEventCards('2099-12-30');
		expect(card.ranges).toHaveLength(1);
		expect(card.verses.map((v) => v.cite)).toEqual(['c1']);
	});

	// loadPackageData installs on a miss — a network fetch and an IndexedDB
	// write. Rendering the home screen must not do that for a package the
	// reader has never opened. Same rule resolveRangeVerseNos already follows.
	it('does not install a package just to resolve its verse text', async () => {
		mockFetch({
			'data/events.json': sampleEvents,
			'data/packages.json': samplePackages,
			'data/5_krv.json': sampleVerses,
			'data/packages_index.json': sampleGroups
		});
		await listPackages(); // metadata only — verses not installed
		const [card] = await buildEventCards('2099-12-30');
		expect(await isPackageInstalled('5_krv')).toBe(false);
		// The range still shows (its verseNos are explicit), but with nothing to
		// read aloud the event offers no audio at all rather than partial audio.
		expect(card.ranges).toHaveLength(1);
		expect(card.verses).toEqual([]);
	});

	// Heard in the order they are read: range by range, verse by verse within
	// each. The second range is listed first here precisely so a sort would
	// show up as a failure.
	it('keeps verses in range order, not verse-number order', async () => {
		mockFetch({
			'data/events.json': [
				{
					id: 'e3',
					title: '두 범위',
					dueAt: '2099-12-31',
					ranges: [
						{ packageId: '5_krv', verseNos: [3], label: 'B' },
						{ packageId: '5_krv', verseNos: [1, 2], label: 'A' }
					]
				}
			],
			'data/packages.json': samplePackages,
			'data/5_krv.json': sampleVerses,
			'data/packages_index.json': sampleGroups
		});
		await listPackages();
		await installPackage('5_krv');
		const [card] = await buildEventCards('2099-12-30');
		expect(card.verses.map((v) => v.cite)).toEqual(['c3', 'c1', 'c2']);
	});
});

describe('eventStats', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		vi.restoreAllMocks();
		_resetEventsCache();
	});

	const range = (verseNos: number[], packageId = '5_krv'): RangeCardVM => ({
		label: 'r',
		done: 0,
		total: verseNos.length,
		href: '',
		packageId,
		verseNos
	});

	it('tallies the ratings of the verses the event covers', async () => {
		await setStartDifficulty('5_krv', 1, 1);
		await setStartDifficulty('5_krv', 2, 1);
		await setStartDifficulty('5_krv', 3, 4);
		await setFullDifficulty('5_krv', 1, 5);

		const stats = await eventStats([range([1, 2, 3])]);
		expect(stats.start).toEqual([0, 2, 0, 0, 1, 0]);
		expect(stats.full).toEqual([0, 0, 0, 0, 0, 1]);
	});

	// A verse outside the event is somebody else's business, however it is rated.
	it('ignores ratings on verses the event does not cover', async () => {
		await setStartDifficulty('5_krv', 1, 3);
		await setStartDifficulty('5_krv', 9, 3);

		expect((await eventStats([range([1])])).start).toEqual([0, 0, 0, 1, 0, 0]);
	});

	// Two ranges of one package may overlap; the reader memorized the verse
	// once, so it may only be counted once.
	it('counts a verse once when two ranges both cover it', async () => {
		await setStartDifficulty('5_krv', 1, 2);

		expect((await eventStats([range([1, 2]), range([1, 3])])).start).toEqual([0, 0, 1, 0, 0, 0]);
	});

	it('sums across ranges from different packages', async () => {
		await setStartDifficulty('5_krv', 1, 2);
		await setStartDifficulty('8_krv', 1, 2);

		expect((await eventStats([range([1]), range([1], '8_krv')])).start).toEqual([0, 0, 2, 0, 0, 0]);
	});

	// Half-rated verses are the normal mid-week state; the two histograms are
	// independent, and neither invents a bar for a level nobody chose.
	it('leaves an unrated dimension out of its histogram', async () => {
		await setStartDifficulty('5_krv', 1, 3);

		const stats = await eventStats([range([1, 2])]);
		expect(stats.start).toEqual([0, 0, 0, 1, 0, 0]);
		expect(stats.full).toEqual([0, 0, 0, 0, 0, 0]);
	});

	it('counts a verse as perfect when its last check was flawless', async () => {
		await recordCheck('5_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 1000 }, 1000);

		expect((await eventStats([range([1])])).perfect).toBe(1);
	});

	// The badge says "this verse is solid right now" — a flawless run in May
	// that was fumbled this morning is not one.
	it('drops a perfect verse once a later check missed', async () => {
		await recordCheck('5_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 1000 }, 1000);
		await recordCheck('5_krv', 1, { start: 3, full: 3, accuracy: 0.8, elapsedMs: 1000 }, 2000);

		expect((await eventStats([range([1])])).perfect).toBe(0);
	});

	it('counts no perfect verse outside the event ranges', async () => {
		await recordCheck('5_krv', 9, { start: 5, full: 5, accuracy: 1, elapsedMs: 1000 }, 1000);

		expect((await eventStats([range([1])])).perfect).toBe(0);
	});

	// A row can arrive from a synced device without passing through the
	// setters' guard, and an out-of-range level would index off the end of the
	// histogram and turn the whole bar chart into NaN.
	it('ignores a rating outside the 0-5 scale', async () => {
		await db.verseRatings.put({
			id: '5_krv:1',
			packageId: '5_krv',
			verseNo: 1,
			startDifficulty: 7,
			fullDifficulty: -1,
			updatedAt: 1
		});

		const stats = await eventStats([range([1])]);
		expect(stats.start).toEqual([0, 0, 0, 0, 0, 0]);
		expect(stats.full).toEqual([0, 0, 0, 0, 0, 0]);
	});

	it('reports zeroes for an event nobody has touched', async () => {
		const stats = await eventStats([range([1, 2])]);
		expect(stats).toEqual({ total: 2, perfect: 0, start: [0, 0, 0, 0, 0, 0], full: [0, 0, 0, 0, 0, 0] });
	});

	// The counts only mean something against how many verses there are: five
	// at xHard is a hard week in a set of six and a rounding error in a set of
	// two hundred.
	it('reports how many verses the event covers', async () => {
		expect((await eventStats([range([1, 2, 3])])).total).toBe(3);
	});

	it('counts overlapping ranges once in the total', async () => {
		expect((await eventStats([range([1, 2]), range([2, 3])])).total).toBe(3);
	});

	it('adds up the totals of ranges from different packages', async () => {
		expect((await eventStats([range([1, 2]), range([1], '8_krv')])).total).toBe(3);
	});
});

describe('versesAtLevel', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		vi.restoreAllMocks();
		_resetEventsCache();
	});

	const range = (verseNos: number[], packageId = '5_krv'): RangeCardVM => ({
		label: 'r',
		done: 0,
		total: verseNos.length,
		href: '',
		packageId,
		verseNos
	});

	it('returns the verses rated at the level asked for', async () => {
		await setStartDifficulty('5_krv', 1, 2);
		await setStartDifficulty('5_krv', 2, 4);
		await setStartDifficulty('5_krv', 3, 2);

		const rows = await versesAtLevel([range([1, 2, 3])], 'start', 2);
		expect(rows).toEqual([
			{ packageId: '5_krv', verseNo: 1 },
			{ packageId: '5_krv', verseNo: 3 }
		]);
	});

	it('reads the dimension it was asked for, not the other one', async () => {
		await setStartDifficulty('5_krv', 1, 2);
		await setFullDifficulty('5_krv', 2, 2);

		expect(await versesAtLevel([range([1, 2])], 'full', 2)).toEqual([
			{ packageId: '5_krv', verseNo: 2 }
		]);
	});

	// null is the 미평가 query: verses the reader has not judged on this
	// dimension, including those they have judged on the other one.
	it('returns the unrated verses for a null level', async () => {
		await setStartDifficulty('5_krv', 1, 3);
		await setFullDifficulty('5_krv', 2, 3);

		expect(await versesAtLevel([range([1, 2, 3])], 'start', null)).toEqual([
			{ packageId: '5_krv', verseNo: 2 },
			{ packageId: '5_krv', verseNo: 3 }
		]);
	});

	it('spans the packages the event covers', async () => {
		await setStartDifficulty('5_krv', 1, 5);
		await setStartDifficulty('8_krv', 4, 5);

		expect(await versesAtLevel([range([1]), range([4], '8_krv')], 'start', 5)).toEqual([
			{ packageId: '5_krv', verseNo: 1 },
			{ packageId: '8_krv', verseNo: 4 }
		]);
	});

	it('returns a verse once when two ranges both cover it', async () => {
		await setStartDifficulty('5_krv', 1, 1);

		expect(await versesAtLevel([range([1, 2]), range([1, 3])], 'start', 1)).toEqual([
			{ packageId: '5_krv', verseNo: 1 }
		]);
	});

	it('ignores ratings on verses outside the event', async () => {
		await setStartDifficulty('5_krv', 9, 1);

		expect(await versesAtLevel([range([1])], 'start', 1)).toEqual([]);
	});

	// The bar prints a number and the link opens a list; if the two disagree
	// the reader has caught the app lying about its own arithmetic. They are
	// separate reads, so nothing but a test keeps them honest.
	it('returns exactly as many verses as the histogram counted', async () => {
		await setStartDifficulty('5_krv', 1, 3);
		await setStartDifficulty('5_krv', 2, 3);
		await setStartDifficulty('5_krv', 4, 1);
		await setFullDifficulty('8_krv', 1, 3);
		const ranges = [range([1, 2, 3, 4]), range([1, 2], '8_krv')];

		const stats = await eventStats(ranges);
		for (const level of [0, 1, 2, 3, 4, 5] as const) {
			expect((await versesAtLevel(ranges, 'start', level)).length).toBe(stats.start[level]);
			expect((await versesAtLevel(ranges, 'full', level)).length).toBe(stats.full[level]);
		}
		const ratedStart = stats.start.reduce((a, b) => a + b, 0);
		expect((await versesAtLevel(ranges, 'start', null)).length).toBe(stats.total - ratedStart);
	});
});

describe('statsVersesHref', () => {
	it('names the event, the dimension and the level', () => {
		expect(statsVersesHref('e1', 'start', 2)).toBe('/stats/verses?event=e1&dim=start&level=2');
	});

	// The unrated remainder is a query like any other, so it travels as a level
	// rather than as a second route with its own loader.
	it('names the unrated remainder as a level of its own', () => {
		expect(statsVersesHref('e1', 'full', null)).toBe('/stats/verses?event=e1&dim=full&level=none');
	});

	it('escapes an event id that would otherwise break the query', () => {
		expect(statsVersesHref('a b&c', 'start', 1)).toContain('event=a+b%26c');
	});
});

describe('hasEventStats', () => {
	const empty = { total: 12, perfect: 0, start: [0, 0, 0, 0, 0], full: [0, 0, 0, 0, 0] };

	// The rule lives here so the chart and the control that opens it cannot
	// disagree — a toggle that opens onto nothing is worse than no toggle.
	it('is false when nothing has been rated or recited', () => {
		expect(hasEventStats(empty)).toBe(false);
	});

	it('is true once a verse is rated', () => {
		expect(hasEventStats({ ...empty, start: [1, 0, 0, 0, 0] })).toBe(true);
		expect(hasEventStats({ ...empty, full: [0, 0, 0, 0, 1] })).toBe(true);
	});

	it('is true once a verse is recited flawlessly', () => {
		expect(hasEventStats({ ...empty, perfect: 1 })).toBe(true);
	});

	// A total on its own is just the size of the event, not progress in it.
	it('is false for an untouched event however many verses it has', () => {
		expect(hasEventStats({ ...empty, total: 900 })).toBe(false);
	});
});

describe('versesByPerfection', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		vi.restoreAllMocks();
		_resetEventsCache();
	});

	const range = (verseNos: number[], packageId = '5_krv'): RangeCardVM => ({
		label: 'r',
		done: 0,
		total: verseNos.length,
		href: '',
		packageId,
		verseNos
	});

	it('returns the verses whose last check was flawless', async () => {
		await recordCheck('5_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 10 }, 1000);
		await recordCheck('5_krv', 2, { start: 3, full: 3, accuracy: 0.8, elapsedMs: 10 }, 1000);

		expect(await versesByPerfection([range([1, 2])], true)).toEqual([
			{ packageId: '5_krv', verseNo: 1 }
		]);
	});

	// The remainder is everything else — the verse checked and missed and the
	// verse never opened both belong to it.
	it('returns everything else as the remainder', async () => {
		await recordCheck('5_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 10 }, 1000);
		await recordCheck('5_krv', 2, { start: 3, full: 3, accuracy: 0.8, elapsedMs: 10 }, 1000);

		expect(await versesByPerfection([range([1, 2, 3])], false)).toEqual([
			{ packageId: '5_krv', verseNo: 2 },
			{ packageId: '5_krv', verseNo: 3 }
		]);
	});

	it('follows the most recent check, not the best one', async () => {
		await recordCheck('5_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 10 }, 1000);
		await recordCheck('5_krv', 1, { start: 3, full: 3, accuracy: 0.6, elapsedMs: 10 }, 2000);

		expect(await versesByPerfection([range([1])], true)).toEqual([]);
		expect(await versesByPerfection([range([1])], false)).toEqual([
			{ packageId: '5_krv', verseNo: 1 }
		]);
	});

	it('spans the packages the event covers', async () => {
		await recordCheck('5_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 10 }, 1000);
		await recordCheck('8_krv', 4, { start: 5, full: 5, accuracy: 1, elapsedMs: 10 }, 1000);

		expect(await versesByPerfection([range([1]), range([4], '8_krv')], true)).toEqual([
			{ packageId: '5_krv', verseNo: 1 },
			{ packageId: '8_krv', verseNo: 4 }
		]);
	});

	it('returns a verse once when two ranges both cover it', async () => {
		await recordCheck('5_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 10 }, 1000);

		expect(await versesByPerfection([range([1, 2]), range([1, 3])], true)).toEqual([
			{ packageId: '5_krv', verseNo: 1 }
		]);
	});

	// The line prints a number and the link opens a list; nothing but a test
	// keeps two separate reads agreeing about it.
	it('returns exactly as many verses as the headline counted', async () => {
		await recordCheck('5_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 10 }, 1000);
		await recordCheck('5_krv', 2, { start: 3, full: 3, accuracy: 0.8, elapsedMs: 10 }, 1000);
		await recordCheck('8_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 10 }, 1000);
		const ranges = [range([1, 2, 3, 4]), range([1, 2], '8_krv')];

		const stats = await eventStats(ranges);
		expect((await versesByPerfection(ranges, true)).length).toBe(stats.perfect);
		expect((await versesByPerfection(ranges, false)).length).toBe(stats.total - stats.perfect);
	});
});

describe('statsPerfectHref', () => {
	it('names the flawless verses', () => {
		expect(statsPerfectHref('e1', true)).toBe('/stats/verses?event=e1&dim=perfect&level=yes');
	});

	it('names the remainder', () => {
		expect(statsPerfectHref('e1', false)).toBe('/stats/verses?event=e1&dim=perfect&level=no');
	});
});

describe('dimension labels', () => {
	it('spells out what each difficulty measures', () => {
		expect(DIMENSION_LABELS.start).toBe('암송 시작 난이도');
		expect(DIMENSION_LABELS.full).toBe('전체 일치 난이도');
	});
});

describe('statsListHeading', () => {
	it('names the level and its word', () => {
		expect(statsListHeading('start', 2, false)).toBe('암송 시작 난이도 2 · Hard');
	});

	it('names the unrated remainder', () => {
		expect(statsListHeading('full', null, false)).toBe('전체 일치 난이도 미평가');
	});

	it('names the flawless list and its remainder', () => {
		expect(statsListHeading('perfect', null, true)).toBe('완벽');
		expect(statsListHeading('perfect', null, false)).toBe('Not완벽');
	});

	// The labels carry the word 난이도 themselves now, so a heading that still
	// appends it reads "암송 시작 난이도 난이도 2".
	it('never doubles the word 난이도', () => {
		for (const dim of ['start', 'full'] as const) {
			for (const level of [1, 2, 3, 4, 5, null] as const) {
				expect(statsListHeading(dim, level, false)).not.toContain('난이도 난이도');
			}
		}
	});
});

describe('parseStatsLevel', () => {
	it('reads a level back out of the link that carried it', () => {
		expect(parseStatsLevel('2')).toBe(2);
	});

	// 0 joined the scale after this parser was written. The chart's 0 bar links
	// to level=0, and read as 미평가 it opened the unrated list instead — empty
	// on an event whose verses are all rated, so the bar said 5 and the list
	// said none.
	it('reads 0, which is a level like any other', () => {
		expect(parseStatsLevel('0')).toBe(0);
	});

	it('reads the unrated remainder', () => {
		expect(parseStatsLevel('none')).toBeNull();
	});

	// Number(null), Number('') and Number(' ') are all 0. A link with no level
	// is asking for the remainder, not for Impossible.
	it('does not turn a missing level into 0', () => {
		expect(parseStatsLevel(null)).toBeNull();
		expect(parseStatsLevel('')).toBeNull();
		expect(parseStatsLevel('   ')).toBeNull();
	});

	// A hand-edited URL should land somewhere honest rather than throw.
	it('sends anything off the scale to the remainder', () => {
		expect(parseStatsLevel('6')).toBeNull();
		expect(parseStatsLevel('-1')).toBeNull();
		expect(parseStatsLevel('2.5')).toBeNull();
		expect(parseStatsLevel('그냥글자')).toBeNull();
	});

	// The pairing that would have caught 0 the day it was added: the parser
	// lives beside the builder, and every level the chart can link to survives
	// the trip.
	it.each([...DIFFICULTY_LEVELS])('round-trips level %i through its own link', (level) => {
		const url = new URL(statsVersesHref('e1', 'start', level), 'https://example.com');
		expect(parseStatsLevel(url.searchParams.get('level'))).toBe(level);
	});

	it('round-trips the unrated remainder through its own link', () => {
		const url = new URL(statsVersesHref('e1', 'start', null), 'https://example.com');
		expect(parseStatsLevel(url.searchParams.get('level'))).toBeNull();
	});
});
