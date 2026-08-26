import { MAX_IMPORT_VERSES, normalizeCite } from './cite';

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
	/** 1-based row number in the source table, header included. */
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
