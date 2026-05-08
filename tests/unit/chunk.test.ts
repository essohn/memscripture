import { describe, it, expect } from 'vitest';
import { splitVerseText } from '../../src/lib/utils/chunk';

describe('splitVerseText', () => {
	it('returns [] for empty input', () => {
		expect(splitVerseText('')).toEqual([]);
	});

	it('returns [] for whitespace-only input', () => {
		expect(splitVerseText('   \n  ')).toEqual([]);
	});

	it('splits the canonical 잠언 3:5-6 into 4 clauses', () => {
		const text =
			'너는 마음을 다하여 여호와를 의뢰하고 네 명철을 의지하지 말라 너는 범사에 그를 인정하라 그리하면 네 길을 지도하시리라';
		expect(splitVerseText(text)).toEqual([
			'너는 마음을 다하여 여호와를 의뢰하고',
			'네 명철을 의지하지 말라',
			'너는 범사에 그를 인정하라',
			'그리하면 네 길을 지도하시리라'
		]);
	});

	it('returns one chunk when text has no terminal endings', () => {
		expect(splitVerseText('짧은 한 문장')).toEqual(['짧은 한 문장']);
	});

	it('returns one chunk when only one clause-ending split would occur', () => {
		// Single split point would yield 2 short chunks, but if either chunk's primary
		// split is the only one, accept it.
		expect(splitVerseText('첫 부분이라 둘째 부분이다')).toEqual([
			'첫 부분이라',
			'둘째 부분이다'
		]);
	});

	it('falls back to length-based when primary yields too few chunks', () => {
		// No clause endings; primary returns 1 chunk; if too long, fallback splits
		const longNoEndings =
			'단어 단어 단어 단어 단어 단어 단어 단어 단어 단어 단어 단어 단어 단어 단어';
		const result = splitVerseText(longNoEndings, 20);
		expect(result.length).toBeGreaterThan(1);
		expect(result.every((c) => c.length <= 20)).toBe(true);
	});

	it('falls back when a primary chunk exceeds maxChunkChars', () => {
		// One clause is much longer than the limit — fallback grouping
		const text =
			'아주아주아주아주아주아주아주아주아주아주아주아주긴 단어 묶음이라 짧은 마무리';
		const result = splitVerseText(text, 15);
		expect(result.every((c) => c.length <= 15)).toBe(true);
	});

	it('preserves all the original tokens (lossless join)', () => {
		const text =
			'너는 마음을 다하여 여호와를 의뢰하고 네 명철을 의지하지 말라 너는 범사에 그를 인정하라 그리하면 네 길을 지도하시리라';
		const chunks = splitVerseText(text);
		const joined = chunks.join(' ').replace(/\s+/g, ' ').trim();
		const original = text.replace(/\s+/g, ' ').trim();
		expect(joined).toBe(original);
	});

	it('handles trailing/leading whitespace by trimming', () => {
		expect(splitVerseText('  hello world  ')).toEqual(['hello world']);
	});
});
