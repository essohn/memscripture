import { citationSortKey } from '$lib/bible/index';
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

export interface ExportOptions {
	includeDifficulty: boolean;
	sortByScripture: boolean;
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

const DIFFICULTY_COLUMNS: ColumnDef[] = [
	{ header: '시작', width: 4.5, align: 'center' },
	{ header: '전체', width: 4.5, align: 'center' }
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
	// A and B are the two difficulty columns; row 1 is the header, so the body
	// starts at row 2.
	const range = `A2:B${bodyRowCount + 1}`;
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
	eventTitle: string,
	verses: ExportVerse[],
	options: ExportOptions
): Sheet {
	const columns = options.includeDifficulty
		? [...DIFFICULTY_COLUMNS, ...BASE_COLUMNS]
		: BASE_COLUMNS;

	const header: SheetCell[] = columns.map((c) => ({
		v: c.header,
		bold: true,
		fill: HEADER_FILL,
		align: c.align
	}));

	const ordered = options.sortByScripture ? sortByScripture(verses) : verses;

	const body = ordered.map((v) => {
		const base: SheetCell[] = [
			{ v: v.packageAbbreviation },
			{ v: v.no, align: 'center' },
			{ v: v.title },
			{ v: v.cite },
			{ v: v.body }
		];
		return options.includeDifficulty
			? [difficultyCell(v.startDifficulty), difficultyCell(v.fullDifficulty), ...base]
			: base;
	});

	return {
		name: eventTitle,
		cols: columns.map((c) => ({ width: c.width, align: c.align })),
		rows: [header, ...body],
		freezeRows: 1,
		conditionalFills: options.includeDifficulty ? difficultyRules(body.length) : []
	};
}
