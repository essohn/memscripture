import { db, type CheckRecord } from './local';
import type { DifficultyLevel } from './verseRatings';
import { touchDataModified } from './touchData';

/** Entries kept per verse. Older ones are pruned as new checks land — this is
 *  a "how has it been going" glance, not an audit trail, and 900 verses times
 *  an unbounded log is not worth carrying in every sync snapshot. */
export const HISTORY_LIMIT = 10;

function verseKey(packageId: string, verseNo: number): string {
	return `${packageId}:${verseNo}`;
}

/**
 * Records one completed check.
 *
 * Only called once a result is actually written, so a cancelled attempt
 * leaves nothing behind — the history should read as "times I finished a
 * check", not "times I opened the panel".
 */
export async function recordCheck(
	packageId: string,
	verseNo: number,
	entry: {
		start: DifficultyLevel | null;
		full: DifficultyLevel | null;
		accuracy: number;
		elapsedMs: number;
		hints?: number;
	},
	checkedAt: number = Date.now()
): Promise<void> {
	const key = verseKey(packageId, verseNo);
	await db.checkHistory.put({
		// Two checks of the same verse in the same millisecond would collide on
		// a timestamp alone; the counter keeps them distinct without needing a
		// random id that would differ across synced devices.
		id: `${key}:${checkedAt}:${await nextSuffix(key, checkedAt)}`,
		verseKey: key,
		packageId,
		verseNo,
		checkedAt,
		...entry
	});
	await prune(key);
	await touchDataModified();
}

async function nextSuffix(key: string, checkedAt: number): Promise<number> {
	const clash = await db.checkHistory
		.where('verseKey')
		.equals(key)
		.filter((r) => r.checkedAt === checkedAt)
		.count();
	return clash;
}

async function prune(key: string): Promise<void> {
	const rows = await db.checkHistory.where('verseKey').equals(key).toArray();
	if (rows.length <= HISTORY_LIMIT) return;
	const doomed = rows
		.sort((a, b) => b.checkedAt - a.checkedAt)
		.slice(HISTORY_LIMIT)
		.map((r) => r.id);
	await db.checkHistory.bulkDelete(doomed);
}

/** Most recent first, capped at HISTORY_LIMIT. */
export async function listChecks(
	packageId: string,
	verseNo: number
): Promise<CheckRecord[]> {
	const rows = await db.checkHistory.where('verseKey').equals(verseKey(packageId, verseNo)).toArray();
	return rows.sort((a, b) => b.checkedAt - a.checkedAt).slice(0, HISTORY_LIMIT);
}

/**
 * Verse numbers in a package that have ever been recited flawlessly.
 *
 * Read from the history rather than stored as a flag on the verse: the record
 * of a perfect check already exists, and a second copy could disagree with it.
 * Once earned it stays — a later slip does not take it back, because the badge
 * says "I have done this", not "I could do this today".
 *
 * One range scan on the verseKey index, which is prefixed by the package id,
 * rather than a query per verse.
 */
export async function listPerfectVerseNos(packageId: string): Promise<Set<number>> {
	const rows = await db.checkHistory.where('verseKey').startsWith(`${packageId}:`).toArray();
	const out = new Set<number>();
	for (const r of rows) if (r.accuracy >= 1) out.add(r.verseNo);
	return out;
}
