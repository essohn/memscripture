import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	formatStandardRef,
	getBookFullName,
	getBookOrdinal,
	parsePassageRef
} from '../../src/lib/bible/index';
import {
	__clearChapterCacheForTest,
	__setChapterCacheForTest,
	fetchPassageText
} from '../../src/lib/bible/fetch';

describe('getBookOrdinal', () => {
	it('resolves abbreviations to 1..66', () => {
		expect(getBookOrdinal('창')).toBe(1);
		expect(getBookOrdinal('계')).toBe(66);
		expect(getBookOrdinal('요')).toBe(43);
	});

	it('resolves full names', () => {
		expect(getBookOrdinal('창세기')).toBe(1);
		expect(getBookOrdinal('요한복음')).toBe(43);
		expect(getBookOrdinal('요한일서')).toBe(62);
	});

	it('returns null for unknown names', () => {
		expect(getBookOrdinal('알수없음')).toBeNull();
		expect(getBookOrdinal('')).toBeNull();
	});

	it('trims whitespace', () => {
		expect(getBookOrdinal('  창세기  ')).toBe(1);
	});
});

describe('parsePassageRef', () => {
	it('parses 창12:1-3', () => {
		expect(parsePassageRef('창12:1-3')).toEqual({
			bookId: 1,
			chapter: 12,
			startVerse: 1,
			endVerse: 3
		});
	});

	it('parses spaced 요 3:16 to single verse', () => {
		expect(parsePassageRef('요 3:16')).toEqual({
			bookId: 43,
			chapter: 3,
			startVerse: 16,
			endVerse: 16
		});
	});

	it('parses full name 요한일서 5:11-12', () => {
		expect(parsePassageRef('요한일서 5:11-12')).toEqual({
			bookId: 62,
			chapter: 5,
			startVerse: 11,
			endVerse: 12
		});
	});

	it('parses chapter-only 창12', () => {
		expect(parsePassageRef('창12')).toEqual({
			bookId: 1,
			chapter: 12,
			startVerse: null,
			endVerse: null
		});
	});

	it('tolerates spaces around the colon and hyphen', () => {
		expect(parsePassageRef('창세기 12 : 1 - 3')).toEqual({
			bookId: 1,
			chapter: 12,
			startVerse: 1,
			endVerse: 3
		});
	});

	it('returns null for unknown book', () => {
		expect(parsePassageRef('xx 3:16')).toBeNull();
	});

	it('returns null for empty input', () => {
		expect(parsePassageRef('')).toBeNull();
		expect(parsePassageRef('   ')).toBeNull();
	});
});

describe('formatStandardRef', () => {
	it('formats a verse range with spaces around the colon', () => {
		expect(
			formatStandardRef({ bookId: 1, chapter: 12, startVerse: 1, endVerse: 3 })
		).toBe('창세기 12 : 1-3');
	});

	it('collapses single-verse ranges to one number', () => {
		expect(
			formatStandardRef({ bookId: 43, chapter: 3, startVerse: 16, endVerse: 16 })
		).toBe('요한복음 3 : 16');
	});

	it('omits the verse part for chapter-only refs', () => {
		expect(
			formatStandardRef({ bookId: 1, chapter: 12, startVerse: null, endVerse: null })
		).toBe('창세기 12');
	});

	it('round-trips with parsePassageRef', () => {
		const parsed = parsePassageRef('창12:1-3')!;
		expect(formatStandardRef(parsed)).toBe('창세기 12 : 1-3');
	});

	it('matches getBookFullName for the book portion', () => {
		expect(getBookFullName('요')).toBe('요한복음');
	});
});

describe('fetchPassageText', () => {
	beforeEach(() => {
		__clearChapterCacheForTest();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('joins requested verses with single spaces', async () => {
		__setChapterCacheForTest(43, 3, [
			{ verse: 14, text: '본문 14' },
			{ verse: 15, text: '본문 15' },
			{ verse: 16, text: '하나님이 세상을 이처럼 사랑하사' },
			{ verse: 17, text: '본문 17' }
		]);
		const text = await fetchPassageText({
			bookId: 43,
			chapter: 3,
			startVerse: 16,
			endVerse: 16
		});
		expect(text).toBe('하나님이 세상을 이처럼 사랑하사');
	});

	it('returns the whole chapter when startVerse is null', async () => {
		__setChapterCacheForTest(43, 3, [
			{ verse: 1, text: 'a' },
			{ verse: 2, text: 'b' }
		]);
		const text = await fetchPassageText({
			bookId: 43,
			chapter: 3,
			startVerse: null,
			endVerse: null
		});
		expect(text).toBe('a b');
	});

	it('joins multi-verse ranges and strips HTML', async () => {
		__setChapterCacheForTest(1, 12, [
			{ verse: 1, text: '여호와께서 <S>0853</S>아브람에게 이르시되' },
			{ verse: 2, text: '내가 너로 큰 민족을 이루고' },
			{ verse: 3, text: '너를 축복하는 자에게는' },
			{ verse: 4, text: '이에 아브람이 떠났더라' }
		]);
		const text = await fetchPassageText({
			bookId: 1,
			chapter: 12,
			startVerse: 1,
			endVerse: 3
		});
		expect(text).toBe(
			'여호와께서 아브람에게 이르시되 내가 너로 큰 민족을 이루고 너를 축복하는 자에게는'
		);
	});

	it('hits the cache on the second call (no network)', async () => {
		__setChapterCacheForTest(43, 3, [{ verse: 16, text: 'cached' }]);
		const spy = vi.spyOn(globalThis, 'fetch');
		await fetchPassageText({ bookId: 43, chapter: 3, startVerse: 16, endVerse: 16 });
		await fetchPassageText({ bookId: 43, chapter: 3, startVerse: 16, endVerse: 16 });
		expect(spy).not.toHaveBeenCalled();
	});

	it('hits the network on a cache miss and caches the response', async () => {
		const payload = [{ verse: 1, text: 'fetched' }];
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => payload
		});
		vi.stubGlobal('fetch', fetchMock);

		const text = await fetchPassageText({
			bookId: 19,
			chapter: 23,
			startVerse: 1,
			endVerse: 1
		});
		expect(text).toBe('fetched');
		expect(fetchMock).toHaveBeenCalledTimes(1);

		// Second call same chapter → cache, no extra fetch
		await fetchPassageText({
			bookId: 19,
			chapter: 23,
			startVerse: 1,
			endVerse: 1
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('throws on a non-OK response', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
		vi.stubGlobal('fetch', fetchMock);
		await expect(
			fetchPassageText({ bookId: 1, chapter: 999, startVerse: 1, endVerse: 1 })
		).rejects.toThrow(/HTTP 404/);
	});
});
