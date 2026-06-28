import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	dDay, activeEvents, isMemorized, rangeHref, serializeEventRange,
	loadEvents, resolveRangeVerseNos, rangeProgress, buildEventCards, _resetEventsCache
} from '../../src/lib/db/events';
import { db } from '../../src/lib/db/local';
import { listPackages } from '../../src/lib/db/verses';
import { upsertProgress } from '../../src/lib/db/progress';
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
	const p = (bucket: VerseProgress['bucket']): VerseProgress => ({
		id: '5_krv:1', packageId: '5_krv', verseNo: 1, bucket,
		enteredBucketAt: 0, daysActiveInBucket: 0, lastReviewedAt: 0, citeRatings: [], recallRatings: []
	});
	it('is true only for mastered', () => {
		expect(isMemorized(p('mastered'))).toBe(true);
		expect(isMemorized(p('current'))).toBe(false);
		expect(isMemorized(p('new'))).toBe(false);
	});
});

describe('rangeHref', () => {
	it('builds a sel-only link for verseNos ranges', () => {
		expect(rangeHref({ packageId: '8_krv', verseNos: [1] }, [1])).toBe('/library/8_krv?sel=1');
	});
	it('includes s and g for series/group ranges', () => {
		const href = rangeHref({ packageId: '60_krv', seriesIndex: 0, groupIndices: [2] }, [1, 2]);
		expect(href).toBe('/library/60_krv?sel=1%2C2&s=0&g=2');
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
		const nos = await resolveRangeVerseNos({ packageId: '5_krv', seriesIndex: 0, groupIndices: [] });
		expect(nos).toEqual([1, 2]);
	});

	it('rangeProgress counts mastered verses within the range', async () => {
		await upsertProgress({
			id: '5_krv:1', packageId: '5_krv', verseNo: 1, bucket: 'mastered',
			enteredBucketAt: 0, daysActiveInBucket: 0, lastReviewedAt: 0, citeRatings: [], recallRatings: []
		});
		await upsertProgress({
			id: '5_krv:2', packageId: '5_krv', verseNo: 2, bucket: 'current',
			enteredBucketAt: 0, daysActiveInBucket: 0, lastReviewedAt: 0, citeRatings: [], recallRatings: []
		});
		expect(await rangeProgress('5_krv', [1, 2])).toEqual({ done: 1, total: 2 });
		expect(await rangeProgress('5_krv', [])).toEqual({ done: 0, total: 0 });
	});

	it('buildEventCards assembles a card per active event range', async () => {
		mockFetch({ 'data/events.json': sampleEvents });
		await upsertProgress({
			id: '5_krv:1', packageId: '5_krv', verseNo: 1, bucket: 'mastered',
			enteredBucketAt: 0, daysActiveInBucket: 0, lastReviewedAt: 0, citeRatings: [], recallRatings: []
		});
		const cards = await buildEventCards('2099-12-30');
		expect(cards).toHaveLength(1);
		expect(cards[0].eventTitle).toBe('11월 암송 데이');
		expect(cards[0].dDay).toBe(1);
		expect(cards[0].ranges[0]).toEqual({
			label: '시편 23편', done: 1, total: 2, href: '/library/5_krv?sel=1%2C2'
		});
	});
});
