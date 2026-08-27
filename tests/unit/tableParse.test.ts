import { describe, it, expect } from 'vitest';
import { detectDelimiter, parseDelimited } from '../../src/lib/oyo/tableParse';

describe('detectDelimiter', () => {
	it('picks comma for a CSV', () => {
		expect(detectDelimiter('장절,제목,본문\n요 3:16,영생,하나님이')).toBe(',');
	});

	it('picks tab for spreadsheet clipboard data', () => {
		expect(detectDelimiter('장절\t제목\t본문\n요 3:16\t영생\t하나님이')).toBe('\t');
	});

	it('ignores commas inside quotes when counting', () => {
		expect(detectDelimiter('a\t"x,y,z,w,v"\nb\t"p,q,r,s,t"')).toBe('\t');
	});

	it('defaults to comma when neither appears', () => {
		expect(detectDelimiter('요 3:16\n창 12:1')).toBe(',');
	});
});

describe('parseDelimited', () => {
	it('splits a plain CSV into rows and cells', () => {
		expect(parseDelimited('장절,제목\n요 3:16,영생')).toEqual([
			['장절', '제목'],
			['요 3:16', '영생']
		]);
	});

	it('keeps a comma that lives inside a quoted body', () => {
		const csv = '장절,본문\n요 3:16,"하나님이 세상을 이처럼 사랑하사, 독생자를 주셨으니"';
		expect(parseDelimited(csv)[1]).toEqual([
			'요 3:16',
			'하나님이 세상을 이처럼 사랑하사, 독생자를 주셨으니'
		]);
	});

	it('folds a newline inside a quoted field into a single line', () => {
		const csv = '장절,본문\n요 3:16,"하나님이 세상을\n이처럼 사랑하사"';
		expect(parseDelimited(csv)).toHaveLength(2);
		expect(parseDelimited(csv)[1][1]).toBe('하나님이 세상을 이처럼 사랑하사');
	});

	it('reads "" as a literal quote', () => {
		expect(parseDelimited('a,"그가 ""아멘"" 하니"')[0][1]).toBe('그가 "아멘" 하니');
	});

	it('accepts CRLF and bare CR as row breaks', () => {
		expect(parseDelimited('a,b\r\nc,d\re,f')).toEqual([
			['a', 'b'],
			['c', 'd'],
			['e', 'f']
		]);
	});

	it('drops rows that are entirely empty', () => {
		expect(parseDelimited('a,b\n\n,,\nc,d\n')).toEqual([
			['a', 'b'],
			['c', 'd']
		]);
	});

	it('squeezes whitespace inside every cell', () => {
		expect(parseDelimited('  요   3:16  ,  영생 ')).toEqual([['요 3:16', '영생']]);
	});

	it('parses a tab-separated paste', () => {
		expect(parseDelimited('요 3:16\t영생\n창 12:1\t부르심')).toEqual([
			['요 3:16', '영생'],
			['창 12:1', '부르심']
		]);
	});
});
