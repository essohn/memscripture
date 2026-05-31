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

	it('merges adjacent short clauses below minChunkChars', () => {
		// Each clause (6 and 7 chars) is below the default min (10),
		// merge into a single chunk.
		expect(splitVerseText('첫 부분이라 둘째 부분이다')).toEqual([
			'첫 부분이라 둘째 부분이다'
		]);
	});

	it('keeps short clauses separate when min is very low', () => {
		// With min=1, no merging happens
		expect(splitVerseText('첫 부분이라 둘째 부분이다', 40, 1)).toEqual([
			'첫 부분이라',
			'둘째 부분이다'
		]);
	});

	it('does not merge when result would exceed maxChunkChars', () => {
		// First clause is short (4 chars), but next clause is 30 chars.
		// Merging would yield 35 chars — within max=40, OK to merge.
		// Use max=20 to forbid merging.
		const text = '짧다 정말로 긴 두번째 문장이라';
		const result = splitVerseText(text, 20, 10);
		// max forbids merging "짧다" (3) + "정말로 긴 두번째 문장이라" (16) = 20+1 = 21 chars > 20
		expect(result.every((c) => c.length <= 20)).toBe(true);
	});

	it('merges trailing short chunk backward into previous', () => {
		// Three clauses: long, long, short. Last one is too short — merge with 2nd.
		const text =
			'첫번째 부분이고 둘째 더 긴 부분이라 마지막 짧다';
		const result = splitVerseText(text);
		// Expect "마지막 짧다" merged with "둘째 더 긴 부분이라"
		expect(result.length).toBeLessThanOrEqual(2);
		// All chunks meet the minimum length OR are the only chunk
		expect(result.every((c) => c.length >= 10 || result.length === 1)).toBe(
			true
		);
	});

	it('falls back to length-based when primary yields too few chunks', () => {
		// No clause endings; primary returns 1 chunk; if too long, fallback splits
		const longNoEndings =
			'단어 단어 단어 단어 단어 단어 단어 단어 단어 단어 단어 단어 단어 단어 단어';
		const result = splitVerseText(longNoEndings, 20, 1);
		expect(result.length).toBeGreaterThan(1);
		expect(result.every((c) => c.length <= 20)).toBe(true);
	});

	it('falls back when a primary chunk exceeds maxChunkChars', () => {
		// One clause is much longer than the limit — fallback grouping
		const text =
			'아주아주아주아주아주아주아주아주아주아주아주아주긴 단어 묶음이라 짧은 마무리';
		const result = splitVerseText(text, 15, 1);
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

