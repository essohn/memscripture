import { db } from '$lib/db/local';
import type { RangeCardVM } from '$lib/db/events';
import type { DifficultyLevel } from '$lib/db/verseRatings';
import {
	buildEventSheet,
	type ExportEvent,
	type ExportOptions,
	type ExportVerse
} from './eventWorkbook';
import { writeXlsx } from './xlsx';

function isLevel(v: unknown): v is DifficultyLevel {
	return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 5;
}

/**
 * Resolves an event's ranges into flat export rows.
 *
 * Ranges arrive already filtered — buildEventCards drops uninstalled
 * packages before the card is rendered — so anything here is installed.
 * Verse numbers with no matching row are skipped rather than emitted blank;
 * that only happens if a package was renumbered under the user.
 */
export async function collectEventVerses(ranges: RangeCardVM[]): Promise<ExportVerse[]> {
	const out: ExportVerse[] = [];
	for (const range of ranges) {
		// One bulk read per table per package, not per verse — the library
		// page resolves its rows the same way.
		const [pkg, verses, ratings] = await Promise.all([
			db.packages.get(range.packageId),
			db.verses.where('package_id').equals(range.packageId).toArray(),
			db.verseRatings.where('packageId').equals(range.packageId).toArray()
		]);
		// A falsy check, not `??`: an installed package can carry
		// `abbreviation: ''`, which `??` lets through as-is, leaving 구분 blank.
		const abbreviation = pkg?.abbreviation || range.packageId;
		const byNo = new Map(verses.map((v) => [v.no, v]));
		const ratingByNo = new Map(ratings.map((r) => [r.verseNo, r]));

		for (const no of range.verseNos) {
			const v = byNo.get(no);
			if (!v) continue;
			const rating = ratingByNo.get(no);
			out.push({
				packageAbbreviation: abbreviation,
				no: v.no,
				title: v.title,
				cite: v.cite,
				body: v.w,
				startDifficulty: isLevel(rating?.startDifficulty) ? rating.startDifficulty : null,
				fullDifficulty: isLevel(rating?.fullDifficulty) ? rating.fullDifficulty : null
			});
		}
	}
	return out;
}

/** Filename-illegal characters differ from the sheet-name set: this also has
 *  to survive Windows, which rejects " < > | as well. */
export function exportFileName(eventTitle: string, dayKey: string): string {
	const safe = eventTitle
		.replace(/[/\\:*?"<>|]/g, '-')
		.replace(/-+/g, '-')
		.trim();
	return `${safe}-${dayKey}.xlsx`;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Turns bytes into a downloaded file via a throwaway anchor — the same
 * shape as the existing OYO backup download.
 *
 * revokeObjectURL is deferred to a macrotask rather than called right after
 * click(): WebKit is documented to be able to abort a download when the
 * object URL is revoked in the same task as the click, for an anchor (like
 * this one) that was never inserted into the DOM. Desktop Chrome and
 * Firefox tolerate the synchronous revoke, but this app is an iOS-first
 * PWA and this is its first blob download, so there is no earlier
 * in-house pattern that already proved the synchronous form safe.
 */
function downloadBlob(bytes: Uint8Array, filename: string): void {
	const url = URL.createObjectURL(
		// bytes.buffer, not bytes: zipStore's final .slice() always yields a
		// plain, exact-length ArrayBuffer, but TS's default Uint8Array<ArrayBufferLike>
		// widens too far for BlobPart, which wants Uint8Array<ArrayBuffer>.
		new Blob([bytes.buffer as ArrayBuffer], { type: XLSX_MIME })
	);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface ExportCallbacks {
	/** No verses resolved for the event — an empty workbook would look like
	 *  a successful export of nothing, so no file is produced instead. */
	onEmpty?: () => void;
	/** A read in `collectEventVerses` (or anything downstream of it) threw —
	 *  e.g. `db.packages.get` rejecting under iOS Safari private browsing,
	 *  or another tab holding an IndexedDB version-change lock. Without this
	 *  the caller has no way to tell the user the download did not happen. */
	onError?: () => void;
}

/**
 * Orchestrates the full export: resolve verses, build the sheet, trigger
 * the download. Pulled out of the component so the empty and error paths
 * are covered by a test instead of by inspection, leaving the component as
 * thin wiring around this function.
 *
 * Resolves to whether a file was produced, so the caller can decide
 * whether to dismiss its confirm UI.
 */
export async function exportEventXlsx(
	event: ExportEvent,
	ranges: RangeCardVM[],
	options: ExportOptions,
	dayKey: string,
	callbacks: ExportCallbacks = {}
): Promise<boolean> {
	try {
		const verses = await collectEventVerses(ranges);
		// An empty workbook would look like a successful export of nothing.
		if (verses.length === 0) {
			callbacks.onEmpty?.();
			return false;
		}
		const bytes = writeXlsx(buildEventSheet(event, verses, options));
		downloadBlob(bytes, exportFileName(event.title, dayKey));
		return true;
	} catch {
		callbacks.onError?.();
		return false;
	}
}
