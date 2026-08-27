import { describe, expect, it } from 'vitest';
import {
	buildEventSheet,
	DIFFICULTY_FILLS,
	formatDueAt,
	type ExportVerse
} from '../../src/lib/export/eventWorkbook';

const EVENT = { title: '2026 여름 암송 DAY', dueAt: '2026-08-31' };

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

const BOTH_OFF = { includeDifficulty: false, sort: 'booklet' as const };
const DIFF_ON = { includeDifficulty: true, sort: 'booklet' as const };

describe('buildEventSheet columns', () => {
	it('leads with the two difficulty columns when they are on', () => {
		const s = buildEventSheet(EVENT, [verse()], DIFF_ON);
		expect(s.rows[1].map((c) => c.v)).toEqual([
			'암송 시작',
			'전체 일치',
			'구분',
			'번호',
			'제목',
			'장절',
			'본문'
		]);
		// Wide enough for the four-character headers and no wider — the values
		// under them are a single digit, and the full 난이도 phrasing the app
		// uses would add 16% to a 117-unit sheet to say what 1-5 already says.
		expect(s.cols.map((c) => c.width)).toEqual([7, 7, 10, 6, 14, 18, 60]);
	});

	it('omits them entirely when they are off', () => {
		const s = buildEventSheet({ ...EVENT, title: 't' }, [verse()], BOTH_OFF);
		expect(s.rows[1].map((c) => c.v)).toEqual(['구분', '번호', '제목', '장절', '본문']);
		expect(s.cols).toHaveLength(5);
	});

	it('freezes the caption and the header, and names the sheet after the event', () => {
		const s = buildEventSheet(EVENT, [verse()], BOTH_OFF);
		expect(s.freezeRows).toBe(2);
		expect(s.name).toBe('2026 여름 암송 DAY');
	});
});

describe('header alignment', () => {
	// Alignment must be an explicit per-column property, not inferred from
	// width — otherwise widening a column (e.g. 번호) would silently
	// left-align its header while the body cells stayed centred.
	it('centers 시작/전체/번호 headers and leaves the rest unset', () => {
		const s = buildEventSheet({ ...EVENT, title: 't' }, [verse()], DIFF_ON);
		expect(s.rows[1].map((c) => c.align)).toEqual([
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
		const s = buildEventSheet({ ...EVENT, title: 't' }, [verse({ startDifficulty: 1, fullDifficulty: 5 })], DIFF_ON);
		expect(s.rows[2][0]).toEqual({ v: 1, align: 'center' });
		expect(s.rows[2][1]).toEqual({ v: 5, align: 'center' });
	});

	it('covers both difficulty columns and every body row with rules', () => {
		const s = buildEventSheet({ ...EVENT, title: 't' }, [verse(), verse({ no: 128 }), verse({ no: 129 })], DIFF_ON);
		expect(s.conditionalFills).toHaveLength(1);
		// Row 1 is the caption and row 2 the header, so the body is rows 3..5.
		expect(s.conditionalFills![0].range).toBe('A3:B5');
		expect(s.conditionalFills![0].byValue).toEqual([
			{ value: 1, fill: DIFFICULTY_FILLS[1] },
			{ value: 2, fill: DIFFICULTY_FILLS[2] },
			{ value: 3, fill: DIFFICULTY_FILLS[3] },
			{ value: 4, fill: DIFFICULTY_FILLS[4] },
			{ value: 5, fill: DIFFICULTY_FILLS[5] }
		]);
	});

	it('emits no rules when the difficulty columns are off', () => {
		const s = buildEventSheet({ ...EVENT, title: 't' }, [verse()], BOTH_OFF);
		expect(s.conditionalFills).toEqual([]);
	});

	// An unrated verse must be a truly empty cell. It also matches no rule, so
	// it stays uncoloured without any special handling.
	it('leaves an unrated cell null and unfilled', () => {
		const s = buildEventSheet({ ...EVENT, title: 't' }, [verse()], DIFF_ON);
		expect(s.rows[2][0].v).toBeNull();
		expect(s.rows[2][0].fill).toBeUndefined();
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
		const s = buildEventSheet({ ...EVENT, title: 't' }, rows, BOTH_OFF);
		expect(s.rows.slice(2).map((r) => r[1].v)).toEqual([1, 2, 3, 4]);
	});

	it('orders by book, chapter, then verse when asked', () => {
		const s = buildEventSheet({ ...EVENT, title: 't' }, rows, { includeDifficulty: false, sort: 'scripture' as const });
		// 창세기 1:1, 창세기 1:27, 요한복음 3:16, then the unreadable one.
		expect(s.rows.slice(2).map((r) => r[1].v)).toEqual([2, 3, 1, 4]);
	});

	it('appends citations it cannot read rather than dropping them', () => {
		const s = buildEventSheet({ ...EVENT, title: 't' }, rows, { includeDifficulty: false, sort: 'scripture' as const });
		expect(s.rows).toHaveLength(6);
		expect(s.rows.at(-1)![3].v).toBe('알수없는책 2 : 2');
	});
});

describe('difficulty order', () => {
	// The export exists to show which verses are hard, so ordering by that is
	// the same question the difficulty columns answer, asked of the whole list.
	const rows = [
		verse({ no: 1, startDifficulty: 5, fullDifficulty: 5 }),
		verse({ no: 2, startDifficulty: 1, fullDifficulty: 4 }),
		verse({ no: 3, startDifficulty: null, fullDifficulty: null }),
		verse({ no: 4, startDifficulty: 3, fullDifficulty: 3 })
	];
	const nos = (o: 'booklet' | 'scripture' | 'difficulty') =>
		buildEventSheet(EVENT, rows, { includeDifficulty: true, sort: o })
			.rows.slice(2)
			.map((r) => r[3].v);

	it('puts the hardest verse at the top', () => {
		expect(nos('difficulty')).toEqual([2, 4, 1, 3]);
	});

	it('leaves the unrated one last rather than assuming it is hard', () => {
		expect(nos('difficulty').at(-1)).toBe(3);
	});

	it('is not what the other orders do', () => {
		expect(nos('booklet')).toEqual([1, 2, 3, 4]);
	});
});

describe('body rows', () => {
	it('writes the verse fields in column order', () => {
		const s = buildEventSheet({ ...EVENT, title: 't' }, [verse()], BOTH_OFF);
		expect(s.rows[2].map((c) => c.v)).toEqual([
			'900구절',
			127,
			'양  육',
			'출애굽기 18 : 20',
			'그들에게 율례와 법도를 가르쳐서'
		]);
	});
});

describe('the 암송 DAY caption', () => {
	// The export is a document someone keeps and passes around; "D-11" is only
	// true on the day it was made, so the row states the date itself.
	it('heads the sheet with the date', () => {
		const s = buildEventSheet(EVENT, [verse()], BOTH_OFF);
		expect(s.rows[0][0].v).toBe('암송 DAY · 2026년 8월 31일');
		expect(s.rows[0][0].bold).toBe(true);
	});

	// A single cell, so the text spills across its empty neighbours instead of
	// leaving blanks a filter or a copy-paste has to step over.
	it('occupies one cell, not one per column', () => {
		expect(buildEventSheet(EVENT, [verse()], DIFF_ON).rows[0]).toHaveLength(1);
	});

	it('sits above the header, which still leads the table', () => {
		const s = buildEventSheet(EVENT, [verse()], BOTH_OFF);
		expect(s.rows[1].map((c) => c.v)).toEqual(['구분', '번호', '제목', '장절', '본문']);
	});
});

describe('formatDueAt', () => {
	it('reads as a Korean date', () => {
		expect(formatDueAt('2026-08-31')).toBe('2026년 8월 31일');
	});

	it('drops the leading zeros a reader would not say', () => {
		expect(formatDueAt('2026-01-05')).toBe('2026년 1월 5일');
	});

	// Losing the date entirely would be worse than showing it raw.
	it.each(['', '미정', '2026/08/31'])('passes %o through when it cannot parse it', (raw) => {
		expect(formatDueAt(raw)).toBe(raw);
	});
});

describe('stray whitespace', () => {
	// 241 shipped verses begin with a space. Invisible on a card, kept by a
	// spreadsheet — the column reads ragged and an exact-match lookup misses.
	it('trims the body', () => {
		const s = buildEventSheet(EVENT, [verse({ body: ' 그들에게 율례와 ' })], BOTH_OFF);
		expect(s.rows[2][4].v).toBe('그들에게 율례와');
	});

	it('trims the title, the citation and the package name', () => {
		const s = buildEventSheet(
			EVENT,
			[verse({ title: ' 양  육 ', cite: '출애굽기 18 : 20 ', packageAbbreviation: ' 900구절' })],
			BOTH_OFF
		);
		expect(s.rows[2][0].v).toBe('900구절');
		expect(s.rows[2][2].v).toBe('양  육');
		expect(s.rows[2][3].v).toBe('출애굽기 18 : 20');
	});

	// Only the ends. The double space in 양  육 is how the title is laid out,
	// and rewriting the inside of a verse is not whitespace cleanup.
	it('leaves the inside of the text alone', () => {
		const s = buildEventSheet(EVENT, [verse({ body: '갈  길과\n할 일을' })], BOTH_OFF);
		expect(s.rows[2][4].v).toBe('갈  길과\n할 일을');
	});
});
