import { MAX_IMPORT_VERSES, normalizeCite } from './cite';
import { parsePassageRef } from '$lib/bible/index';

/**
 * Which column holds what, and what the rows become once that is settled.
 *
 * Every rule in this file is a guess. That is deliberate: the confirm screen
 * shows the guess to a person before anything is fetched or saved, which is
 * what lets the heuristics be opinionated instead of timid.
 */

export interface ColumnMapping {
	cite: number;
	/** null when the table has no such column — the reader may also say so. */
	title: number | null;
	/** null when the table has no such column; the fill supplies the body. */
	w: number | null;
}

export interface TableDraft {
	/**
	 * A stable 1-based number for this row within the parsed grid — enough to
	 * key a list by, and nothing more.
	 *
	 * Deliberately NOT the row number in the sheet the reader pasted.
	 * `parseDelimited` drops empty rows before this file ever sees the grid, so
	 * one spacer row shifts every number below it. Putting this on screen would
	 * be handing the reader a number that does not match their spreadsheet; the
	 * review screen identifies a row by its citation instead, which is the
	 * better handle for finding it again in any case.
	 */
	row: number;
	cite: string;
	title: string;
	w: string;
}

/**
 * Reads the grid through a mapping.
 *
 * A row with no citation is dropped, for the reason the deeplink parser drops
 * one: a verse with no reference cannot be found again. A row missing only its
 * body is kept — that is precisely the row the body fill exists for.
 *
 * `truncated` is returned rather than left to be inferred. Rows go missing for
 * two different reasons here, and comparing input and output lengths would
 * report a truncation that never happened.
 */
export function applyMapping(
	grid: string[][],
	hasHeader: boolean,
	mapping: ColumnMapping
): { drafts: TableDraft[]; truncated: boolean } {
	const body = hasHeader ? grid.slice(1) : grid;
	const offset = hasHeader ? 2 : 1;
	const drafts: TableDraft[] = [];
	let truncated = false;

	for (let i = 0; i < body.length; i++) {
		const cells = body[i];
		const cite = normalizeCite(cells[mapping.cite] ?? '');
		if (cite.length === 0) continue;
		if (drafts.length >= MAX_IMPORT_VERSES) {
			truncated = true;
			break;
		}
		drafts.push({
			row: i + offset,
			cite,
			title: mapping.title === null ? '' : (cells[mapping.title] ?? ''),
			w: mapping.w === null ? '' : (cells[mapping.w] ?? '')
		});
	}

	return { drafts, truncated };
}

export interface DetectedColumns {
	hasHeader: boolean;
	/** Header cells when hasHeader, else the first row's values — either way,
	 *  what the mapper shows next to each column letter. */
	labels: string[];
	/** Always present. The last rule below guarantees a citation column even
	 *  when every stronger signal is silent. */
	mapping: ColumnMapping;
}

type Role = 'cite' | 'title' | 'w';

/** Rule 1's vocabulary. Matched after stripping whitespace and lowercasing,
 *  so "Reference" and "성경 구절" both land. */
const SYNONYMS: Record<Role, string[]> = {
	cite: ['장절', '구절', '성구', '참조', '성경구절', '본문장절', 'reference', 'ref', 'cite', 'verse'],
	title: ['제목', '이름', '타이틀', 'title', 'name'],
	w: ['본문', '내용', '말씀', '구절내용', '텍스트', 'text', 'body', 'w']
};

/** How many data rows the content and length probes look at. */
const PROBE_ROWS = 10;

/** Share of a column's sampled cells that must parse as a reference before
 *  that column is called the citation column. */
const CITE_SHARE = 0.5;

/** Shortest mean cell length that can be a title. A column averaging one
 *  character is a marker column — O/X, ✓ — not a name for a verse. */
const MIN_TITLE_LENGTH = 2;

/** Mean cell length that separates a body from a title. Korean verses run
 *  well past this; titles are two or three words. */
const BODY_MEAN_LENGTH = 20;

function headerKey(cell: string): string {
	return cell.replace(/\s+/g, '').toLowerCase();
}

function headerRole(cell: string): Role | null {
	const key = headerKey(cell);
	if (key.length === 0) return null;
	for (const role of ['cite', 'title', 'w'] as const) {
		if (SYNONYMS[role].some((s) => headerKey(s) === key)) return role;
	}
	return null;
}

function meanLength(rows: string[][], column: number): number {
	if (rows.length === 0) return 0;
	let total = 0;
	for (const r of rows) total += (r[column] ?? '').length;
	return total / rows.length;
}

/** The column whose cells most often read as a passage reference. */
function probeCite(rows: string[][], width: number, taken: Set<number>): number | undefined {
	const sample = rows.slice(0, PROBE_ROWS);
	let best: number | undefined;
	let bestShare = 0;
	for (let i = 0; i < width; i++) {
		if (taken.has(i)) continue;
		const cells = sample.map((r) => r[i] ?? '').filter((c) => c.length > 0);
		if (cells.length === 0) continue;
		const share = cells.filter((c) => parsePassageRef(c) !== null).length / cells.length;
		if (share >= CITE_SHARE && share > bestShare) {
			best = i;
			bestShare = share;
		}
	}
	return best;
}

/** The longest remaining column, if it is long enough to be scripture. */
function probeBody(rows: string[][], width: number, taken: Set<number>): number | undefined {
	const sample = rows.slice(0, PROBE_ROWS);
	let best: number | undefined;
	let bestMean = 0;
	for (let i = 0; i < width; i++) {
		if (taken.has(i)) continue;
		const mean = meanLength(sample, i);
		if (mean >= BODY_MEAN_LENGTH && mean > bestMean) {
			best = i;
			bestMean = mean;
		}
	}
	return best;
}

/** The first remaining column short enough to be a title — and not empty,
 *  not a column of row numbers, and not a column of one-character marks.
 *  An empty column would give every verse a blank title it never asked for;
 *  a 순번 column would give it a number; a 확인 column would give it "O". */
function probeTitle(rows: string[][], width: number, taken: Set<number>): number | undefined {
	const sample = rows.slice(0, PROBE_ROWS);
	for (let i = 0; i < width; i++) {
		if (taken.has(i)) continue;
		const cells = sample.map((r) => r[i] ?? '').filter((c) => c.length > 0);
		if (cells.length === 0) continue;
		if (cells.every((c) => /^\d+$/.test(c))) continue;
		const mean = meanLength(sample, i);
		if (mean >= MIN_TITLE_LENGTH && mean < BODY_MEAN_LENGTH) return i;
	}
	return undefined;
}

/**
 * Guesses which column holds what, and whether the first row is a header.
 *
 * Header detection has two rules, either sufficient. Rule 1 is vocabulary:
 * a synonym in the top row. Rule 2 is shape, and it runs after the citation
 * column is known: if the first row's cell there fails to parse while the
 * rows beneath it succeed, the first row is a label row.
 *
 * Rule 2 is the one that earns its keep. `normalizeCite` deliberately keeps
 * text it cannot parse — that is what carries 토비트 3 : 1 through — so a
 * header cell survives as a citation rather than being dropped. Without rule
 * 2, a sheet headed 순번 / 암송구절 / 확인 would import its own header as a
 * verse.
 *
 * The columns are then settled in a fixed order, each role taking the first
 * rule that fires and never a column already claimed:
 *
 *   1. a header synonym
 *   2. cite only — the column whose cells read as references
 *   3. w and title — the longest remaining column, then a short one
 *   4. cite only — the leftmost unclaimed column, else column 0
 */
export function detectColumns(grid: string[][]): DetectedColumns {
	const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
	const first = grid[0] ?? [];
	const labels = Array.from({ length: width }, (_, i) => first[i] ?? '');

	const synonymHeader = first.some((c) => headerRole(c) !== null);

	const byHeader: Partial<Record<Role, number>> = {};
	if (synonymHeader) {
		for (let i = 0; i < width; i++) {
			const role = headerRole(first[i] ?? '');
			if (role && byHeader[role] === undefined) byHeader[role] = i;
		}
	}
	const taken = new Set<number>(Object.values(byHeader));

	// The citation column is settled first, because header rule 2 needs to know
	// which cell of the first row to look at — a chicken and egg. It is broken by
	// asking twice.
	//
	// The header-free sample goes first: row 0 may be a label row nobody
	// recognised, and one such row among a handful can pull a column's share
	// below the threshold and cost it the match. But it does not get the only
	// vote. On a two-row paste whose second reference will not parse, row 0 is
	// the only evidence there is, and dropping it would demote a real citation
	// column and import the titles in its place.
	const headerless = grid.length > 1 ? grid.slice(1) : grid;
	let cite =
		byHeader.cite ?? probeCite(headerless, width, taken) ?? probeCite(grid, width, taken);
	if (cite === undefined) {
		// Nothing unclaimed reads as a reference anywhere. Before falling back on
		// position, ask the same question of the columns a header word already
		// claimed: content is stronger evidence than vocabulary, so a column
		// headed 본문 whose cells are all references is the citation column, and
		// the header's claim on it yields.
		cite = probeCite(headerless, width, new Set()) ?? probeCite(grid, width, new Set());
	}
	if (cite === undefined) {
		cite = 0;
		for (let i = 0; i < width; i++) {
			if (!taken.has(i)) {
				cite = i;
				break;
			}
		}
	}
	// The citation column outranks whatever a header word claimed. Without this,
	// a table whose every column is claimed for 제목 and 본문 leaves cite aliased
	// onto one of them and a single column fills two roles.
	if (byHeader.title === cite) delete byHeader.title;
	if (byHeader.w === cite) delete byHeader.w;
	taken.add(cite);

	const labelRow =
		!synonymHeader &&
		grid.length > 1 &&
		parsePassageRef(first[cite] ?? '') === null &&
		grid.slice(1, PROBE_ROWS + 1).some((r) => parsePassageRef(r[cite] ?? '') !== null);

	const hasHeader = synonymHeader || labelRow;
	const body = hasHeader ? grid.slice(1) : grid;

	const w = byHeader.w ?? probeBody(body, width, taken);
	if (w !== undefined) taken.add(w);

	const title = byHeader.title ?? probeTitle(body, width, taken);
	if (title !== undefined) taken.add(title);

	return {
		hasHeader,
		labels,
		mapping: { cite, title: title ?? null, w: w ?? null }
	};
}
