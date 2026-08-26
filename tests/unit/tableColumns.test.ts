import { describe, it, expect } from 'vitest';
import { applyMapping, detectColumns, type ColumnMapping } from '../../src/lib/oyo/tableColumns';
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

describe('detectColumns — header rule 1, synonyms', () => {
	it('reads a header whose names are in the table', () => {
		const grid = [
			['장절', '제목', '본문'],
			['요 3:16', '영생', '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니']
		];
		const out = detectColumns(grid);
		expect(out.hasHeader).toBe(true);
		expect(out.mapping).toEqual({ cite: 0, title: 1, w: 2 });
	});

	it('accepts English and spaced spellings', () => {
		const grid = [
			['Reference', 'Title', 'Text'],
			['요 3:16', '영생', '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니']
		];
		expect(detectColumns(grid).mapping).toEqual({ cite: 0, title: 1, w: 2 });
	});

	it('takes columns in any order', () => {
		const grid = [
			['본문', '장절', '제목'],
			['하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니', '요 3:16', '영생']
		];
		expect(detectColumns(grid).mapping).toEqual({ cite: 1, title: 2, w: 0 });
	});
});

describe('detectColumns — header rule 2, a label row', () => {
	it('spots an invented header by its shape, not its words', () => {
		const grid = [
			['순번', '암송구절', '확인'],
			['1', '요 3:16', 'O'],
			['2', '창 12:1', 'O'],
			['3', '시 23:1', '']
		];
		const out = detectColumns(grid);
		expect(out.hasHeader).toBe(true);
		expect(out.mapping.cite).toBe(1);
	});

	it('leaves a headerless table alone', () => {
		const grid = [['요 3:16'], ['창 12:1'], ['시 23:1']];
		expect(detectColumns(grid).hasHeader).toBe(false);
	});

	it('does not call a single-row table a header', () => {
		const grid = [['요 3:16']];
		expect(detectColumns(grid).hasHeader).toBe(false);
	});
});

describe('detectColumns — choosing columns', () => {
	it('finds the citation column by content when no header names it', () => {
		const grid = [
			['1', '요 3:16', 'O'],
			['2', '창 12:1', 'O'],
			['3', '시 23:1', 'X']
		];
		expect(detectColumns(grid).mapping.cite).toBe(1);
	});

	it('gives the body to the longest remaining column', () => {
		const grid = [
			['요 3:16', '영생', '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니'],
			['창 12:1', '부르심', '여호와께서 아브람에게 이르시되 너는 너의 본토 친척 아비 집을 떠나']
		];
		expect(detectColumns(grid).mapping).toEqual({ cite: 0, title: 1, w: 2 });
	});

	it('two columns, a long second one: that is the body', () => {
		const grid = [
			['요 3:16', '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니'],
			['창 12:1', '여호와께서 아브람에게 이르시되 너는 너의 본토 친척 아비 집을 떠나']
		];
		expect(detectColumns(grid).mapping).toEqual({ cite: 0, title: null, w: 1 });
	});

	it('two columns, a short second one: that is the title, and the body is fetched', () => {
		const grid = [
			['요 3:16', '영생'],
			['창 12:1', '부르심']
		];
		expect(detectColumns(grid).mapping).toEqual({ cite: 0, title: 1, w: null });
	});

	it('one column of references maps to citations alone', () => {
		const grid = [['요 3:16'], ['창 12:1']];
		expect(detectColumns(grid).mapping).toEqual({ cite: 0, title: null, w: null });
	});

	it('falls back to the leftmost column when nothing else fires', () => {
		const grid = [['아무거나', '또 아무거나'], ['이것도', '저것도']];
		expect(detectColumns(grid).mapping.cite).toBe(0);
	});

	it('never leaves the citation column unset', () => {
		const grid = [['', ''], ['', '']];
		expect(typeof detectColumns(grid).mapping.cite).toBe('number');
	});

	it('does not hand a wholly empty column to the title', () => {
		const grid = [
			['요 3:16', ''],
			['창 12:1', '']
		];
		expect(detectColumns(grid).mapping.title).toBeNull();
	});
});

describe('detectColumns — labels', () => {
	it('labels columns with the header cells when there is a header', () => {
		const grid = [
			['장절', '제목'],
			['요 3:16', '영생']
		];
		expect(detectColumns(grid).labels).toEqual(['장절', '제목']);
	});

	it('labels columns with the first row when there is no header', () => {
		const grid = [['요 3:16', '영생'], ['창 12:1', '부르심']];
		expect(detectColumns(grid).labels).toEqual(['요 3:16', '영생']);
	});

	it('pads labels out to the widest row', () => {
		const grid = [['요 3:16'], ['창 12:1', '부르심', '길게 쓴 본문입니다 여기에']];
		expect(detectColumns(grid).labels).toHaveLength(3);
	});
});
