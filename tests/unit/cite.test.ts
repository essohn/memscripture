import { describe, it, expect } from 'vitest';
import { MAX_IMPORT_VERSES, normalizeCite, duplicateIndexes } from '../../src/lib/oyo/cite';

describe('normalizeCite', () => {
	it('rewrites an abbreviated reference into the standard shape', () => {
		expect(normalizeCite('창 12:1')).toBe('창세기 12 : 1');
		expect(normalizeCite('요3:16')).toBe('요한복음 3 : 16');
		expect(normalizeCite('창세기 12 : 1')).toBe('창세기 12 : 1');
	});

	it('keeps a reference it cannot parse rather than dropping it', () => {
		expect(normalizeCite('토비트 3 : 1')).toBe('토비트 3 : 1');
	});

	it('squeezes whitespace before parsing', () => {
		expect(normalizeCite('  요   3:16  ')).toBe('요한복음 3 : 16');
	});
});

describe('duplicateIndexes', () => {
	it('flags a row whose citation the reader already has', () => {
		const incoming = [{ cite: '창세기 12 : 1' }, { cite: '창세기 12 : 2' }];
		expect([...duplicateIndexes(incoming, ['창세기 12 : 1'])]).toEqual([0]);
	});

	it('normalises both sides before comparing', () => {
		const incoming = [{ cite: '창세기 12 : 1' }, { cite: '창세기 12 : 2' }];
		expect([...duplicateIndexes(incoming, ['창 12:2'])]).toEqual([1]);
	});

	it('ignores blank existing citations', () => {
		const incoming = [{ cite: '창세기 12 : 1' }];
		expect(duplicateIndexes(incoming, ['', '   ']).size).toBe(0);
	});

	it('accepts any object carrying a cite, not just an ImportVerse', () => {
		const drafts = [{ row: 1, cite: '요한복음 3 : 16', title: '', w: '' }];
		expect([...duplicateIndexes(drafts, ['요 3:16'])]).toEqual([0]);
	});

	it('bounds one import at 200 verses', () => {
		expect(MAX_IMPORT_VERSES).toBe(200);
	});
});
