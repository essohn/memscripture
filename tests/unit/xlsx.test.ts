import { describe, expect, it } from 'vitest';
import { columnName, sanitizeSheetName, writeXlsx, type Sheet } from '../../src/lib/export/xlsx';

/** Reads back a STORE archive produced by zipStore — enough to assert on
 *  the XML we wrote without depending on an unzip binary. */
function readZip(z: Uint8Array): Map<string, string> {
	const dec = new TextDecoder();
	const u16 = (o: number) => z[o] | (z[o + 1] << 8);
	const u32 = (o: number) => (z[o] | (z[o + 1] << 8) | (z[o + 2] << 16) | (z[o + 3] << 24)) >>> 0;
	const eocd = z.length - 22;
	const out = new Map<string, string>();
	let p = u32(eocd + 16);
	for (let i = 0; i < u16(eocd + 10); i++) {
		const nameLen = u16(p + 28);
		const local = u32(p + 42);
		const size = u32(p + 24);
		const localNameLen = u16(local + 26);
		const start = local + 30 + localNameLen + u16(local + 28);
		out.set(
			dec.decode(z.subarray(local + 30, local + 30 + localNameLen)),
			dec.decode(z.subarray(start, start + size))
		);
		p += 46 + nameLen;
	}
	return out;
}

const sheet: Sheet = {
	name: 'Test',
	cols: [{ width: 4.5 }, { width: 20 }],
	rows: [
		[
			{ v: '시작', bold: true, fill: 'EFEFEF', align: 'center' },
			{ v: '장절', bold: true, fill: 'EFEFEF' }
		],
		[
			{ v: 3, fill: 'F5D14E', align: 'center' },
			{ v: '창세기 1 : 1 <&>' }
		],
		[{ v: null }, { v: '느헤미야 8 : 8' }]
	],
	freezeRows: 1
};

describe('columnName', () => {
	it('counts in spreadsheet base-26', () => {
		expect(columnName(0)).toBe('A');
		expect(columnName(25)).toBe('Z');
		expect(columnName(26)).toBe('AA');
		expect(columnName(27)).toBe('AB');
	});
});

describe('sanitizeSheetName', () => {
	it('keeps a normal title unchanged', () => {
		expect(sanitizeSheetName('2026 여름 암송 DAY')).toBe('2026 여름 암송 DAY');
	});

	it('strips the characters Excel rejects', () => {
		expect(sanitizeSheetName('a[b]c:d*e?f/g\\h')).toBe('a b c d e f g h');
	});

	it('truncates to 31 characters', () => {
		expect(sanitizeSheetName('x'.repeat(40))).toHaveLength(31);
	});

	it('falls back when nothing survives', () => {
		expect(sanitizeSheetName('///')).toBe('Sheet1');
	});

	it('strips a leading and trailing apostrophe', () => {
		expect(sanitizeSheetName("'2026'")).toBe('2026');
	});

	it('keeps an apostrophe that is not at either edge', () => {
		expect(sanitizeSheetName("O'Brien")).toBe("O'Brien");
	});

	it('falls back when only apostrophes survive', () => {
		expect(sanitizeSheetName("''")).toBe('Sheet1');
	});

	it('re-strips a trailing apostrophe exposed by truncation', () => {
		// The 31st character lands on an apostrophe once the rest is cut off.
		expect(sanitizeSheetName(`${'a'.repeat(30)}'more text`)).toBe('a'.repeat(30));
	});

	it('rejects the reserved sheet name History, case-insensitively', () => {
		expect(sanitizeSheetName('History')).toBe('Sheet1');
		expect(sanitizeSheetName('HISTORY')).toBe('Sheet1');
	});

	it('allows a title that merely contains "history"', () => {
		expect(sanitizeSheetName('My History')).toBe('My History');
	});
});

describe('writeXlsx', () => {
	const parts = readZip(writeXlsx(sheet));

	it('emits every part Excel requires', () => {
		expect([...parts.keys()].sort()).toEqual([
			'[Content_Types].xml',
			'_rels/.rels',
			'xl/_rels/workbook.xml.rels',
			'xl/styles.xml',
			'xl/workbook.xml',
			'xl/worksheets/sheet1.xml'
		]);
	});

	it('names the sheet', () => {
		expect(parts.get('xl/workbook.xml')).toContain('name="Test"');
	});

	it('writes column widths', () => {
		const xml = parts.get('xl/worksheets/sheet1.xml')!;
		expect(xml).toContain('<col min="1" max="1" width="4.5" customWidth="1"/>');
		expect(xml).toContain('<col min="2" max="2" width="20" customWidth="1"/>');
	});

	it('freezes the header row', () => {
		expect(parts.get('xl/worksheets/sheet1.xml')).toContain(
			'<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
		);
	});

	it('writes numbers as numbers and strings inline', () => {
		const xml = parts.get('xl/worksheets/sheet1.xml')!;
		expect(xml).toMatch(/<c r="A2"[^>]*><v>3<\/v><\/c>/);
		expect(xml).toContain('t="inlineStr"');
	});

	it('escapes XML metacharacters in cell text', () => {
		expect(parts.get('xl/worksheets/sheet1.xml')).toContain('창세기 1 : 1 &lt;&amp;&gt;');
	});

	// A null cell must be absent, not an empty <c> — an empty styled cell
	// would paint a fill on an unrated verse.
	it('omits null cells entirely', () => {
		expect(parts.get('xl/worksheets/sheet1.xml')).not.toContain('r="A3"');
		expect(parts.get('xl/worksheets/sheet1.xml')).toContain('r="B3"');
	});

	it('reserves Excel fill slots 0 and 1 before its own', () => {
		const xml = parts.get('xl/styles.xml')!;
		const fills = xml.slice(xml.indexOf('<fills'), xml.indexOf('</fills>'));
		expect(fills.indexOf('patternType="none"')).toBeLessThan(fills.indexOf('patternType="gray125"'));
		expect(fills.indexOf('patternType="gray125"')).toBeLessThan(fills.indexOf('FFEFEFEF'));
		expect(fills).toContain('<fgColor rgb="FFF5D14E"/>');
	});

	it('reuses one style record for identically styled cells', () => {
		const xml = parts.get('xl/styles.xml')!;
		const count = Number(/<cellXfs count="(\d+)"/.exec(xml)![1]);
		// Four distinct styles across six cells: the default (both plain
		// strings share it), bold+fill+centre, bold+fill, and fill+centre.
		expect(count).toBe(4);
		// Two user fills — the header grey and the level-3 yellow — on top of
		// the two reserved slots.
		expect(xml).toContain('<fills count="4">');
	});

	// CT_Cols requires at least one <col> child; an empty <cols></cols> is
	// schema-invalid and prompts Excel to offer a repair.
	it('omits <cols> entirely when the sheet has no columns', () => {
		const noCols: Sheet = { name: 'Empty', cols: [], rows: [[{ v: 'x' }]], freezeRows: 0 };
		const xml = readZip(writeXlsx(noCols)).get('xl/worksheets/sheet1.xml')!;
		expect(xml).not.toContain('<cols');
	});
});
