import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { dDay, activeEvents, isMemorized, rangeHref, serializeEventRange } from '../../src/lib/db/events';
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
