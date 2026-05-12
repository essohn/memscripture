import { describe, it, expect } from 'vitest';
import { extractFirstClause } from '../../src/lib/srs/firstClause';

describe('extractFirstClause', () => {
	it('returns empty for empty input', () => {
		expect(extractFirstClause('')).toBe('');
		expect(extractFirstClause('   ')).toBe('');
	});

	it('returns the whole text for very short verses (fewer than 3 words)', () => {
		expect(extractFirstClause('한 단어')).toBe('한 단어');
		expect(extractFirstClause('하나')).toBe('하나');
	});

	it('returns at least 3 words for verses with 3-8 words', () => {
		expect(extractFirstClause('내가 산을 향하여 눈을 들리라')).toBe('내가 산을 향하여');
		// 7 words → ceil(7/3) = 3
		expect(extractFirstClause('여호와는 나의 목자시니 내가 부족함이 없으리로다 영원히')).toBe(
			'여호와는 나의 목자시니'
		);
	});

	it('returns roughly first 33% of words for medium-length verses', () => {
		// 15 words → ceil(15/3) = 5
		const text = '그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라 이전 것은 지나갔으니 보라 새 것이 되었도다 아멘';
		expect(extractFirstClause(text)).toBe('그런즉 누구든지 그리스도 안에 있으면');
	});

	it('caps at 8 words for long verses', () => {
		// 30 words → ceil(30/3) = 10, capped to 8
		const tokens = Array.from({ length: 30 }, (_, i) => `w${i}`);
		const text = tokens.join(' ');
		const result = extractFirstClause(text);
		expect(result.split(/\s+/)).toHaveLength(8);
		expect(result).toBe(tokens.slice(0, 8).join(' '));
	});

	it('returns override verbatim regardless of source text', () => {
		expect(extractFirstClause('the actual text', 'a custom clause')).toBe('a custom clause');
		expect(extractFirstClause('', 'still works')).toBe('still works');
	});

	it('collapses runs of whitespace when splitting', () => {
		expect(extractFirstClause('  하나   둘   셋   넷   ')).toBe('하나 둘 셋');
	});
});
