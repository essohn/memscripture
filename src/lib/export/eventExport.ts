import { db } from '$lib/db/local';
import type { RangeCardVM } from '$lib/db/events';
import type { DifficultyLevel } from '$lib/db/verseRatings';
import type { ExportVerse } from './eventWorkbook';

function isLevel(v: unknown): v is DifficultyLevel {
	return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
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
		const abbreviation = pkg?.abbreviation ?? range.packageId;
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
