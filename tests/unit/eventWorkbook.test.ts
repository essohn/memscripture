import { describe, expect, it } from 'vitest';
import {
	buildEventSheet,
	DIFFICULTY_FILLS,
	type ExportVerse
} from '../../src/lib/export/eventWorkbook';

function verse(over: Partial<ExportVerse> = {}): ExportVerse {
	return {
		packageAbbreviation: '900구절',
		no: 127,
		title: '양  육',
		cite: '출애굽기 18 : 20',
		body: '그들에게 율례와 법도를 가르쳐서',
		startDifficulty: null,
		fullDifficulty: null,
		...over
	};
}

const BOTH_OFF = { includeDifficulty: false, sortByScripture: false };
const DIFF_ON = { includeDifficulty: true, sortByScripture: false };

describe('buildEventSheet columns', () => {
	it('leads with the two difficulty columns when they are on', () => {
		const s = buildEventSheet('2026 여름 암송 DAY', [verse()], DIFF_ON);
		expect(s.rows[0].map((c) => c.v)).toEqual([
			'시작',
			'전체',
			'구분',
			'번호',
			'제목',
			'장절',
			'본문'
		]);
		expect(s.cols.map((c) => c.width)).toEqual([4.5, 4.5, 10, 6, 14, 18, 60]);
	});

	it('omits them entirely when they are off', () => {
		const s = buildEventSheet('t', [verse()], BOTH_OFF);
		expect(s.rows[0].map((c) => c.v)).toEqual(['구분', '번호', '제목', '장절', '본문']);
		expect(s.cols).toHaveLength(5);
	});

	it('freezes the header row and names the sheet after the event', () => {
		const s = buildEventSheet('2026 여름 암송 DAY', [verse()], BOTH_OFF);
		expect(s.freezeRows).toBe(1);
		expect(s.name).toBe('2026 여름 암송 DAY');
	});
});

describe('header alignment', () => {
	// Alignment must be an explicit per-column property, not inferred from
	// width — otherwise widening a column (e.g. 번호) would silently
	// left-align its header while the body cells stayed centred.
	it('centers 시작/전체/번호 headers and leaves the rest unset', () => {
		const s = buildEventSheet('t', [verse()], DIFF_ON);
		expect(s.rows[0].map((c) => c.align)).toEqual([
			'center',
			'center',
			undefined,
			'center',
			undefined,
			undefined,
			undefined
		]);
	});
});

describe('difficulty cells', () => {
	// The colour is a conditional rule, not cell formatting, so that retyping a
	// level in the spreadsheet recolours the cell instead of leaving a fill
	// that contradicts its own number.
	it('writes the level as a bare number, with no cell fill', () => {
		const s = buildEventSheet('t', [verse({ startDifficulty: 1, fullDifficulty: 5 })], DIFF_ON);
		expect(s.rows[1][0]).toEqual({ v: 1, align: 'center' });
		expect(s.rows[1][1]).toEqual({ v: 5, align: 'center' });
	});

	it('covers both difficulty columns and every body row with rules', () => {
		const s = buildEventSheet('t', [verse(), verse({ no: 128 }), verse({ no: 129 })], DIFF_ON);
		expect(s.conditionalFills).toHaveLength(1);
		// Row 1 is the header, so the body is rows 2..4.
		expect(s.conditionalFills![0].range).toBe('A2:B4');
		expect(s.conditionalFills![0].byValue).toEqual([
			{ value: 1, fill: DIFFICULTY_FILLS[1] },
			{ value: 2, fill: DIFFICULTY_FILLS[2] },
			{ value: 3, fill: DIFFICULTY_FILLS[3] },
			{ value: 4, fill: DIFFICULTY_FILLS[4] },
			{ value: 5, fill: DIFFICULTY_FILLS[5] }
		]);
	});

	it('emits no rules when the difficulty columns are off', () => {
		const s = buildEventSheet('t', [verse()], BOTH_OFF);
		expect(s.conditionalFills).toEqual([]);
	});

	// An unrated verse must be a truly empty cell. It also matches no rule, so
	// it stays uncoloured without any special handling.
	it('leaves an unrated cell null and unfilled', () => {
		const s = buildEventSheet('t', [verse()], DIFF_ON);
		expect(s.rows[1][0].v).toBeNull();
		expect(s.rows[1][0].fill).toBeUndefined();
	});

	it('runs red at 1 through green at 5', () => {
		expect(DIFFICULTY_FILLS).toEqual({
			1: 'F4573F',
			2: 'F79A3E',
			3: 'F5D14E',
			4: 'A8CE5C',
			5: '5CB85C'
		});
	});
});

describe('sorting', () => {
	const rows = [
		verse({ no: 1, packageAbbreviation: '242구절', cite: '요한복음 3 : 16' }),
		verse({ no: 2, packageAbbreviation: '242구절', cite: '창세기 1 : 1' }),
		verse({ no: 3, packageAbbreviation: '900구절', cite: '창세기 1 : 27' }),
		verse({ no: 4, packageAbbreviation: '900구절', cite: '알수없는책 2 : 2' })
	];

	it('keeps input order by default', () => {
		const s = buildEventSheet('t', rows, BOTH_OFF);
		expect(s.rows.slice(1).map((r) => r[1].v)).toEqual([1, 2, 3, 4]);
	});

	it('orders by book, chapter, then verse when asked', () => {
		const s = buildEventSheet('t', rows, { includeDifficulty: false, sortByScripture: true });
		// 창세기 1:1, 창세기 1:27, 요한복음 3:16, then the unreadable one.
		expect(s.rows.slice(1).map((r) => r[1].v)).toEqual([2, 3, 1, 4]);
	});

	it('appends citations it cannot read rather than dropping them', () => {
		const s = buildEventSheet('t', rows, { includeDifficulty: false, sortByScripture: true });
		expect(s.rows).toHaveLength(5);
		expect(s.rows.at(-1)![3].v).toBe('알수없는책 2 : 2');
	});
});

describe('body rows', () => {
	it('writes the verse fields in column order', () => {
		const s = buildEventSheet('t', [verse()], BOTH_OFF);
		expect(s.rows[1].map((c) => c.v)).toEqual([
			'900구절',
			127,
			'양  육',
			'출애굽기 18 : 20',
			'그들에게 율례와 법도를 가르쳐서'
		]);
	});
});
