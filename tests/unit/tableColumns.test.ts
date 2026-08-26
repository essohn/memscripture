import { describe, it, expect } from 'vitest';
import { applyMapping, type ColumnMapping } from '../../src/lib/oyo/tableColumns';
import { MAX_IMPORT_VERSES } from '../../src/lib/oyo/cite';

const CITE_TITLE_BODY: ColumnMapping = { cite: 0, title: 1, w: 2 };

describe('applyMapping', () => {
	it('reads each data row through the mapping', () => {
		const grid = [
			['장절', '제목', '본문'],
			['요 3:16', '영생', '하나님이 세상을 이처럼 사랑하사']
		];
		const { drafts } = applyMapping(grid, true, CITE_TITLE_BODY);
		expect(drafts).toEqual([
			{ row: 2, cite: '요한복음 3 : 16', title: '영생', w: '하나님이 세상을 이처럼 사랑하사' }
		]);
	});

	it('numbers rows against the source table, header included', () => {
		const grid = [['장절'], ['요 3:16'], ['창 12:1']];
		const { drafts } = applyMapping(grid, true, { cite: 0, title: null, w: null });
		expect(drafts.map((d) => d.row)).toEqual([2, 3]);
	});

	it('numbers from one when there is no header', () => {
		const grid = [['요 3:16'], ['창 12:1']];
		const { drafts } = applyMapping(grid, false, { cite: 0, title: null, w: null });
		expect(drafts.map((d) => d.row)).toEqual([1, 2]);
	});

	it('keeps a row that has no body — the fill exists for exactly that row', () => {
		const grid = [['요 3:16', '영생', '']];
		const { drafts } = applyMapping(grid, false, CITE_TITLE_BODY);
		expect(drafts[0].w).toBe('');
		expect(drafts[0].cite).toBe('요한복음 3 : 16');
	});

	it('drops a row with no citation — it could never be found again', () => {
		const grid = [['요 3:16', '영생', '본문'], ['', '제목만', '본문만']];
		const { drafts } = applyMapping(grid, false, CITE_TITLE_BODY);
		expect(drafts).toHaveLength(1);
	});

	it('reads an unmapped column as empty rather than undefined', () => {
		const grid = [['요 3:16']];
		const { drafts } = applyMapping(grid, false, { cite: 0, title: null, w: null });
		expect(drafts[0].title).toBe('');
		expect(drafts[0].w).toBe('');
	});

	it('survives a ragged row that is shorter than the mapping', () => {
		const grid = [['요 3:16']];
		const { drafts } = applyMapping(grid, false, CITE_TITLE_BODY);
		expect(drafts[0]).toEqual({ row: 1, cite: '요한복음 3 : 16', title: '', w: '' });
	});

	it('cuts the list at the import bound and says that it did', () => {
		const grid = Array.from({ length: MAX_IMPORT_VERSES + 5 }, () => ['요 3:16']);
		const { drafts, truncated } = applyMapping(grid, false, { cite: 0, title: null, w: null });
		expect(drafts).toHaveLength(MAX_IMPORT_VERSES);
		expect(truncated).toBe(true);
	});

	it('reports no truncation when the table fits', () => {
		const grid = [['요 3:16']];
		expect(applyMapping(grid, false, { cite: 0, title: null, w: null }).truncated).toBe(false);
	});

	it('does not count dropped rows as truncation', () => {
		const grid = [['요 3:16'], [''], ['창 12:1']];
		const { drafts, truncated } = applyMapping(grid, false, { cite: 0, title: null, w: null });
		expect(drafts).toHaveLength(2);
		expect(truncated).toBe(false);
	});
});
