import { db, type CheckRecord } from './local';
import type { DifficultyLevel } from './verseRatings';
import { touchDataModified } from './touchData';

/** Entries kept per verse. Older ones are pruned as new checks land — this is
 *  a "how has it been going" glance, not an audit trail, and 900 verses times
 *  an unbounded log is not worth carrying in every sync snapshot. */
export const HISTORY_LIMIT = 10;

/** Characters of the attempt kept. Generous next to any real verse, so an
 *  honest attempt is never clipped — it exists so that one pathological paste
 *  cannot inflate a table that rides along in every Drive snapshot. */
export const TYPED_LIMIT = 1000;

/** The key a check is filed under. Exported because the callers that hand a
 *  card its last-checked time hold a package id and a verse number, and five
 *  routes writing `${a}:${b}` by hand is five chances to write it differently. */
export function verseKeyOf(packageId: string, verseNo: number): string {
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
		missed?: number[];
		source?: 'quiz';
		typed?: string;
	},
	checkedAt: number = Date.now()
): Promise<void> {
	const key = verseKeyOf(packageId, verseNo);
	await db.checkHistory.put({
		// Two checks of the same verse in the same millisecond would collide on
		// a timestamp alone; the counter keeps them distinct without needing a
		// random id that would differ across synced devices.
		id: `${key}:${checkedAt}:${await nextSuffix(key, checkedAt)}`,
		verseKey: key,
		packageId,
		verseNo,
		checkedAt,
		...entry,
		// Copied, not passed through. A caller may hand us a reactive array —
		// the quiz's round holds its verdict in $state — and IndexedDB's
		// structured clone cannot clone a Proxy, so the write rejects and the
		// round is lost silently. Spreading undefined must stay undefined:
		// absent means the record predates this field, which is not the same
		// as missing nothing.
		...(entry.missed ? { missed: [...entry.missed] } : {}),
		// Tested for undefined rather than for truth: '' is a reader who saved
		// having typed nothing, which the sheet reports differently from a check
		// that predates this field. A truthiness guard would erase that.
		...(entry.typed !== undefined ? { typed: entry.typed.slice(0, TYPED_LIMIT) } : {})
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
	const rows = await db.checkHistory
		.where('verseKey')
		.equals(verseKeyOf(packageId, verseNo))
		.toArray();
	return rows.sort((a, b) => b.checkedAt - a.checkedAt).slice(0, HISTORY_LIMIT);
}

/**
 * When each verse was last 점검'd, keyed by verseKey.
 *
 * One scan for a whole list rather than a query per card: a 900-verse package
 * would otherwise issue 900 round-trips for a line most cards do not even
 * show. The same reason 점검 history itself loads lazily, and the same shape
 * listPerfectVerseNos uses.
 *
 * Quiz rounds are left out. The line this feeds says 최근 점검 and opens a
 * sheet of 점검 records — a quiz round carries no difficulty of its own, so
 * counting one would date the line by a session the sheet cannot show.
 *
 * `packageId` is optional because 북마크 and 통계 list verses from several
 * packages at once. Given one, the scan rides the verseKey index, which is
 * prefixed by the package id.
 */
export async function listLastCheckedAt(packageId?: string): Promise<Map<string, number>> {
	const rows = packageId
		? await db.checkHistory.where('verseKey').startsWith(`${packageId}:`).toArray()
		: await db.checkHistory.toArray();

	const latest = new Map<string, number>();
	for (const r of rows) {
		if (r.source) continue;
		// Rows arrive in index order, not chronological order, so the newest has
		// to be chosen by comparison rather than by whichever landed last.
		const seen = latest.get(r.verseKey);
		if (seen === undefined || r.checkedAt > seen) latest.set(r.verseKey, r.checkedAt);
	}
	return latest;
}

/**
 * Verse numbers in a package that have ever been recited flawlessly.
 *
 * Read from the history rather than stored as a flag on the verse: the record
 * of a perfect check already exists, and a second copy could disagree with it.
 * The most recent check decides, so a later slip does take the badge back —
 * it says "this verse is solid right now", not "I have ever done this".
 *
 * One range scan on the verseKey index, which is prefixed by the package id,
 * rather than a query per verse.
 */
export async function listPerfectVerseNos(packageId: string): Promise<Set<number>> {
	const rows = await db.checkHistory.where('verseKey').startsWith(`${packageId}:`).toArray();

	// The most recent check decides, not the best one ever recorded. The badge
	// says "this verse is solid right now"; a verse recited perfectly in May
	// and fumbled this morning is not, and leaving the popper on it would be
	// the card telling the reader something they just disproved.
	const latest = new Map<number, { checkedAt: number; accuracy: number }>();
	for (const r of rows) {
		const seen = latest.get(r.verseNo);
		if (!seen || r.checkedAt > seen.checkedAt) latest.set(r.verseNo, r);
	}

	const out = new Set<number>();
	for (const [verseNo, r] of latest) if (r.accuracy >= 1) out.add(verseNo);
	return out;
}
