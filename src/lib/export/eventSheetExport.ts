import type { RangeCardVM } from '$lib/db/events';
import { getFreshAuth } from '$lib/cloud/session';
import { spreadsheetName, spreadsheetUrl, uploadSpreadsheet } from '$lib/cloud/sheets';
import { buildEventSheet, type ExportOptions } from './eventWorkbook';
import { writeXlsx } from './xlsx';
import { collectEventVerses } from './eventExport';
import { getEventSheetId, setEventSheetId } from './sheetRegistry';

export type SheetExportResult =
	| { kind: 'ok'; url: string; created: boolean }
	/** No verses resolved — the same guard the download path has, for the same
	 *  reason: a blank document looks like a successful export of nothing. */
	| { kind: 'empty' }
	| { kind: 'not-connected' }
	| { kind: 'expired' }
	| { kind: 'error' };

/**
 * Writes the event's verses to the reader's own Google Sheet and returns
 * where to open it.
 *
 * Creates the document on the first export and updates that same document on
 * every later one, so a sheet the reader has shared with their group, sorted
 * or added notes to keeps its link and its sharing rather than becoming a
 * fresh untitled copy in Drive every week.
 *
 * The auth check comes before the database read: it is the likeliest failure
 * by far, and there is no point resolving 900 verses to then discover nobody
 * is signed in.
 */
export async function exportEventToSheets(
	eventId: string,
	eventTitle: string,
	ranges: RangeCardVM[],
	options: ExportOptions,
	clientId: string | null
): Promise<SheetExportResult> {
	const fresh = await getFreshAuth(clientId);
	if (fresh.kind !== 'ok') return { kind: fresh.kind };
	const { email, accessToken } = fresh.auth;

	try {
		const verses = await collectEventVerses(ranges);
		if (verses.length === 0) return { kind: 'empty' };

		const bytes = writeXlsx(buildEventSheet(eventTitle, verses, options));
		const existing = await getEventSheetId(email, eventId);
		const { id, created } = await uploadSpreadsheet(
			accessToken,
			existing,
			spreadsheetName(eventTitle),
			bytes
		);
		// Written back even when the id is unchanged: it is also how a
		// replacement id (the old document was deleted) gets remembered.
		await setEventSheetId(email, eventId, id);
		return { kind: 'ok', url: spreadsheetUrl(id), created };
	} catch {
		return { kind: 'error' };
	}
}
