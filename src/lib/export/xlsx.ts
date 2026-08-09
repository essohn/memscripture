import { zipStore, type ZipEntry } from './zip';

/** `fill` is RRGGBB without '#'. A null `v` emits no cell at all. */
export interface SheetCell {
	v: string | number | null;
	fill?: string;
	bold?: boolean;
	align?: 'center';
}

export interface Sheet {
	name: string;
	cols: { width: number }[];
	rows: SheetCell[][];
	/** Rows held on screen while scrolling. 0 disables the frozen pane. */
	freezeRows: number;
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function xmlEscape(s: string): string {
	return s.replace(/[&<>"']/g, (c) =>
		c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&apos;'
	);
}

/** 0 → A, 25 → Z, 26 → AA. Spreadsheet columns are bijective base-26, so
 *  this is not a plain radix conversion. */
export function columnName(index0: number): string {
	let n = index0 + 1;
	let s = '';
	while (n > 0) {
		const r = (n - 1) % 26;
		s = String.fromCharCode(65 + r) + s;
		n = Math.floor((n - 1) / 26);
	}
	return s;
}

/** Excel rejects sheet names longer than 31 characters, containing any of
 *  []:*?/\, starting or ending with an apostrophe, or equal to the reserved
 *  name "History" — it refuses to open the file rather than sanitizing for
 *  you. */
export function sanitizeSheetName(raw: string): string {
	let cleaned = raw
		.replace(/[[\]:*?/\\]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^'+|'+$/g, '')
		.trim()
		.slice(0, 31)
		// Truncation to 31 chars can re-expose a trailing apostrophe that had
		// more text after it before the cut.
		.replace(/'+$/, '');
	if (cleaned.toLowerCase() === 'history') cleaned = '';
	return cleaned || 'Sheet1';
}

/** One <xf> per distinct (bold, fill, align) combination in the sheet. */
function styleKey(c: SheetCell): string {
	return `${c.bold ? 'b' : ''}|${c.fill ?? ''}|${c.align ?? ''}`;
}

const PLAIN = '||';

function buildStyles(rows: SheetCell[][]) {
	const userFills: string[] = [];
	const xfs: { bold: boolean; fillId: number; align?: 'center' }[] = [];
	const index = new Map<string, number>([[PLAIN, 0]]);

	for (const row of rows) {
		for (const c of row) {
			if (c.v === null) continue;
			const key = styleKey(c);
			if (index.has(key)) continue;
			let fillId = 0;
			if (c.fill) {
				let at = userFills.indexOf(c.fill);
				if (at === -1) at = userFills.push(c.fill) - 1;
				// Slots 0 and 1 are reserved by the format for 'none' and
				// 'gray125'; Excel misreads the table if they are displaced.
				fillId = at + 2;
			}
			index.set(key, xfs.length + 1);
			xfs.push({ bold: !!c.bold, fillId, align: c.align });
		}
	}

	const fillsXml = [
		'<fill><patternFill patternType="none"/></fill>',
		'<fill><patternFill patternType="gray125"/></fill>',
		...userFills.map(
			(f) =>
				`<fill><patternFill patternType="solid"><fgColor rgb="FF${f}"/><bgColor indexed="64"/></patternFill></fill>`
		)
	].join('');

	const xfsXml = [
		'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
		...xfs.map((x) => {
			const applyFill = x.fillId ? ' applyFill="1"' : '';
			const applyFont = x.bold ? ' applyFont="1"' : '';
			return x.align
				? `<xf numFmtId="0" fontId="${x.bold ? 1 : 0}" fillId="${x.fillId}" borderId="0" xfId="0"${applyFont}${applyFill} applyAlignment="1"><alignment horizontal="center"/></xf>`
				: `<xf numFmtId="0" fontId="${x.bold ? 1 : 0}" fillId="${x.fillId}" borderId="0" xfId="0"${applyFont}${applyFill}/>`;
		})
	].join('');

	const xml =
		`${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
		'<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
		'<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
		`<fills count="${userFills.length + 2}">${fillsXml}</fills>` +
		'<borders count="1"><border/></borders>' +
		'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
		`<cellXfs count="${xfs.length + 1}">${xfsXml}</cellXfs></styleSheet>`;

	return { xml, indexOf: (c: SheetCell) => index.get(styleKey(c)) ?? 0 };
}

function buildSheetXml(sheet: Sheet, styleIndex: (c: SheetCell) => number): string {
	// CT_Cols requires at least one <col> child; an empty <cols></cols> is
	// schema-invalid and makes Excel offer to repair the file.
	const cols = sheet.cols.length
		? `<cols>${sheet.cols
				.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`)
				.join('')}</cols>`
		: '';

	const pane =
		sheet.freezeRows > 0
			? `<pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`
			: '';

	const rows = sheet.rows
		.map((row, r) => {
			const cells = row
				.map((c, i) => {
					if (c.v === null) return '';
					const ref = `${columnName(i)}${r + 1}`;
					const s = styleIndex(c);
					const sAttr = s === 0 ? '' : ` s="${s}"`;
					// Inline strings rather than a shared-string table: at this
					// row count the dedup would not pay for a seventh part.
					return typeof c.v === 'number'
						? `<c r="${ref}"${sAttr}><v>${c.v}</v></c>`
						: `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(c.v)}</t></is></c>`;
				})
				.join('');
			return `<row r="${r + 1}">${cells}</row>`;
		})
		.join('');

	return (
		`${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
		`<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
		`${cols}<sheetData>${rows}</sheetData></worksheet>`
	);
}

export function writeXlsx(sheet: Sheet): Uint8Array {
	const styles = buildStyles(sheet.rows);
	const enc = new TextEncoder();
	const part = (name: string, xml: string): ZipEntry => ({ name, bytes: enc.encode(xml) });

	return zipStore([
		part(
			'[Content_Types].xml',
			`${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
				'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
				'<Default Extension="xml" ContentType="application/xml"/>' +
				'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
				'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
				'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
				'</Types>'
		),
		part(
			'_rels/.rels',
			`${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
				'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
				'</Relationships>'
		),
		part(
			'xl/workbook.xml',
			`${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
				'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
				`<sheets><sheet name="${xmlEscape(sanitizeSheetName(sheet.name))}" sheetId="1" r:id="rId1"/></sheets></workbook>`
		),
		part(
			'xl/_rels/workbook.xml.rels',
			`${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
				'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
				'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
				'</Relationships>'
		),
		part('xl/styles.xml', styles.xml),
		part('xl/worksheets/sheet1.xml', buildSheetXml(sheet, styles.indexOf))
	]);
}
