import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	dDay, activeEvents, isMemorized, rangeHref, serializeEventRange,
	loadEvents, resolveRangeVerseNos, rangeProgress, buildEventCards, _resetEventsCache
} from '../../src/lib/db/events';
import { db } from '../../src/lib/db/local';
import { listPackages, installPackage, isPackageInstalled } from '../../src/lib/db/verses';
import { upsertProgress } from '../../src/lib/db/progress';
import { setStartDifficulty, setFullDifficulty } from '../../src/lib/db/verseRatings';
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

	// The home button has to speak straight from the tap, so the text is
	// resolved during the build rather than read from IndexedDB at tap time.
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
