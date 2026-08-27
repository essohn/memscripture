import { describe, it, expect } from 'vitest';
import { columnName } from '../../src/lib/utils/columnName';

describe('columnName', () => {
	it('maps a zero-based index to a spreadsheet column letter', () => {
		expect(columnName(0)).toBe('A');
		expect(columnName(25)).toBe('Z');
		expect(columnName(26)).toBe('AA');
		expect(columnName(27)).toBe('AB');
	});

	it('keeps carrying past two letters', () => {
		expect(columnName(51)).toBe('AZ');
		expect(columnName(52)).toBe('BA');
		expect(columnName(701)).toBe('ZZ');
		expect(columnName(702)).toBe('AAA');
	});
});
