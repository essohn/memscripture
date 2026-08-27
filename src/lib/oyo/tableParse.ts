import { cleanText } from '$lib/utils/cleanText';

/**
 * Turns a CSV file or a pasted block of spreadsheet cells into a grid.
 *
 * Hand-rolled rather than pulled from npm for the same reason `export/zip.ts`
 * is: the whole job is one state machine over one string, and RFC 4180 is
 * four rules long.
 */

/** How many leading rows the delimiter vote looks at. Enough to be decisive,
 *  few enough that a large paste costs nothing to sniff. */
const SNIFF_ROWS = 5;

/**
 * Comma or tab, decided by counting rather than asking.
 *
 * Anything copied out of Excel or Google Sheets arrives tab-separated, so a
 * paste resolves correctly without a control on screen. Quoted spans are
 * skipped, because a body full of commas would otherwise outvote the tabs
 * actually separating the columns.
 */
export function detectDelimiter(text: string): ',' | '\t' {
	let tabs = 0;
	let commas = 0;
	let rows = 0;
	let quoted = false;
	for (let i = 0; i < text.length && rows < SNIFF_ROWS; i++) {
		const c = text[i];
		if (c === '"') {
			if (quoted && text[i + 1] === '"') {
				i++;
				continue;
			}
			quoted = !quoted;
			continue;
		}
		if (quoted) continue;
		if (c === '\t') tabs++;
		else if (c === ',') commas++;
		else if (c === '\n') rows++;
	}
	return tabs > commas ? '\t' : ',';
}

/**
 * RFC 4180 quoting, because scripture is full of commas: `"…"` wraps a
 * field, `""` is a literal quote inside one, and a quoted field may span
 * newlines.
 *
 * Every cell goes through `cleanText`, which is also what flattens a quoted
 * multi-line body into the single line a verse is stored as. Rows that end
 * up entirely empty are dropped — a trailing newline, a spacer row between
 * sections, a run of empty cells left behind by a deletion.
 */
export function parseDelimited(text: string): string[][] {
	const delimiter = detectDelimiter(text);
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;

	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
					continue;
				}
				quoted = false;
				continue;
			}
			field += c;
			continue;
		}
		if (c === '"') {
			quoted = true;
			continue;
		}
		if (c === delimiter) {
			row.push(field);
			field = '';
			continue;
		}
		if (c === '\n' || c === '\r') {
			row.push(field);
			field = '';
			rows.push(row);
			row = [];
			// CRLF is one break, not two.
			if (c === '\r' && text[i + 1] === '\n') i++;
			continue;
		}
		field += c;
	}
	row.push(field);
	rows.push(row);

	return rows
		.map((r) => r.map((cell) => cleanText(cell)))
		.filter((r) => r.some((cell) => cell.length > 0));
}
