import { citationSortKey } from '$lib/bible/index';
import { sortByDifficulty } from '$lib/verses/difficultySort';
import type { DifficultyLevel } from '$lib/db/verseRatings';
import type { ConditionalFill, Sheet, SheetCell } from './xlsx';

export interface ExportVerse {
	packageAbbreviation: string;
	no: number;
	title: string;
	cite: string;
	body: string;
	startDifficulty: DifficultyLevel | null;
	fullDifficulty: DifficultyLevel | null;
}

/**
 * How the rows are ordered.
 *
 * A named mode rather than the boolean this used to be: there are three
 * answers now, and "sortByScripture: false" would have had to mean two
 * different things.
 */
export type ExportSort = 'booklet' | 'scripture' | 'difficulty';

export interface ExportOptions {
	includeDifficulty: boolean;
	sort: ExportSort;
}

export interface ExportEvent {
	title: string;
	/** The 암송 DAY itself, ISO yyyy-mm-dd, straight from events.json. */
	dueAt: string;
}

/**
 * The DAY as a Korean reader writes it. Falls back to the raw value rather
 * than dropping the caption: a date this function cannot parse is still
 * information, and inventing a blank line would hide it.
 */
export function formatDueAt(dueAt: string): string {
	const m = dueAt.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) return dueAt.trim();
	return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

/**
 * Print-tuned ramp, 1 (hardest) → 5 (easiest).
 *
 * Deliberately NOT DIFFICULTY_COLORS from db/verseRatings: that ramp
 * (red–amber–grey–green–blue) is tuned for small dots on a canvas that may
 * be dark. These are backgrounds for black text on paper, so every tier
 * stays light enough to read against. Neither should be derived from the
 * other.
 */
export const DIFFICULTY_FILLS: Record<DifficultyLevel, string> = {
	1: 'F4573F',
	2: 'F79A3E',
	3: 'F5D14E',
	4: 'A8CE5C',
	5: '5CB85C'
};

const HEADER_FILL = 'EFEFEF';

interface ColumnDef {
	header: string;
	width: number;
	// Explicit per column rather than inferred from width — a header must
	// not silently change alignment if a column is widened later.
	align?: 'center';
}

// Named for what they measure, like the app's chart — 시작 alone never said
// the start of what. Not the app's full 암송 시작 난이도 either: these cells
// hold one digit, and widening two columns to fit the phrase would add 16% to
// a 117-unit sheet to repeat what a 1-5 scale already says.
const DIFFICULTY_COLUMNS: ColumnDef[] = [
	{ header: '암송 시작', width: 7, align: 'center' },
	{ header: '전체 일치', width: 7, align: 'center' }
];

const BASE_COLUMNS: ColumnDef[] = [
	{ header: '구분', width: 10 },
	{ header: '번호', width: 6, align: 'center' },
	{ header: '제목', width: 14 },
	{ header: '장절', width: 18 },
	{ header: '본문', width: 60 }
];

/**
 * Canonical scripture order, stable within ties. Verses whose citation
 * yields no key are appended in input order rather than dropped — no
 * shipped verse hits that path today, but silently losing a row would be
 * far worse than an out-of-place one.
 */
function sortByScripture(verses: ExportVerse[]): ExportVerse[] {
	const keyed = verses.map((v, i) => ({ v, i, key: citationSortKey(v.cite) }));
	const readable = keyed.filter((k) => k.key !== null);
	const rest = keyed.filter((k) => k.key === null);
	readable.sort(
		(a, b) =>
			a.key!.bookId - b.key!.bookId ||
			a.key!.chapter - b.key!.chapter ||
			a.key!.verse - b.key!.verse ||
			a.i - b.i
	);
	return [...readable, ...rest].map((k) => k.v);
}

/**
 * A text cell with the corpus's stray padding removed.
 *
 * 241 of the shipped verses begin with a space, and a handful of bodies,
 * titles and citations end with one. On a card that padding is invisible —
 * the browser collapses it — but a spreadsheet keeps every character: the
 * column reads ragged, and an exact-match lookup or a sort on the cell
 * silently misses the row.
 *
 * Trimmed here rather than in static/data because this is the medium that
 * cares. The corpus is what the reader sees on the card and what the check
 * grades against; a spreadsheet cell is neither, and it should not take a
 * change to 1,495 shipped verses to make one column line up.
 */
function text(value: string): SheetCell {
	return { v: value.trim() };
}

/**
 * Applies the chosen order.
 *
 * `booklet` is the order the verses arrived in — the packages' own numbering,
 * which is what someone working through the printed 구절집 follows.
 */
function orderVerses(verses: ExportVerse[], sort: ExportSort): ExportVerse[] {
	if (sort === 'scripture') return sortByScripture(verses);
	if (sort === 'difficulty') {
		return sortByDifficulty(verses, (v) => ({ start: v.startDifficulty, full: v.fullDifficulty }));
	}
	return verses;
}

function difficultyCell(level: DifficultyLevel | null): SheetCell {
	// null, not an empty string: an unrated verse must produce no cell at
	// all, so nothing can imply a rating the user never gave. An empty cell
	// also matches no conditional rule, so it stays uncoloured.
	if (level === null) return { v: null };
	// No `fill` here on purpose — the colour comes from the conditional rules
	// below, so re-typing a level in the spreadsheet recolours the cell
	// instead of leaving a fill that now contradicts its own number.
	return { v: level, align: 'center' };
}

/** Rules covering both difficulty columns for the body rows. Returns nothing
 *  when the columns are absent or there is no data to paint — an empty sqref
 *  is not a legal range. */
function difficultyRules(bodyRowCount: number): ConditionalFill[] {
	if (bodyRowCount === 0) return [];
	// A and B are the two difficulty columns. Row 1 is the 암송 DAY caption and
	// row 2 the header, so the body starts at row 3.
	const range = `A3:B${bodyRowCount + 2}`;
	// Levels come from the local palette rather than DIFFICULTY_LEVELS in
	// db/verseRatings: that is a value export from a module which imports Dexie
	// as a value, and pulling it in would end this module's purity. The
	// Record<DifficultyLevel, string> type still forces the two to agree.
	const levels = Object.keys(DIFFICULTY_FILLS).map(Number) as DifficultyLevel[];
	return [
		{
			range,
			byValue: levels.map((level) => ({ value: level, fill: DIFFICULTY_FILLS[level] }))
		}
	];
}

export function buildEventSheet(
	event: ExportEvent,
	verses: ExportVerse[],
	options: ExportOptions
): Sheet {
	const columns = options.includeDifficulty
		? [...DIFFICULTY_COLUMNS, ...BASE_COLUMNS]
		: BASE_COLUMNS;

	// One cell, not one per column: a lone string spills across the empty
	// neighbours to its right in both Excel and Sheets, which is what a caption
	// should do. Padding the row out would instead leave blanks that a filter
	// or a copy-paste has to step over.
	const caption: SheetCell[] = [{ v: `암송 DAY · ${formatDueAt(event.dueAt)}`, bold: true }];

	const header: SheetCell[] = columns.map((c) => ({
		v: c.header,
		bold: true,
		fill: HEADER_FILL,
		align: c.align
	}));

	const ordered = orderVerses(verses, options.sort);

	const body = ordered.map((v) => {
		const base: SheetCell[] = [
			text(v.packageAbbreviation),
			{ v: v.no, align: 'center' },
			text(v.title),
			text(v.cite),
			text(v.body)
		];
		return options.includeDifficulty
			? [difficultyCell(v.startDifficulty), difficultyCell(v.fullDifficulty), ...base]
			: base;
	});

	return {
		name: event.title,
		cols: columns.map((c) => ({ width: c.width, align: c.align })),
		rows: [caption, header, ...body],
		// Both the caption and the header stay put while scrolling 900 verses —
		// a frozen pane that showed the caption but not the column names would
		// pin the least useful of the two.
		freezeRows: 2,
		conditionalFills: options.includeDifficulty ? difficultyRules(body.length) : []
	};
}
