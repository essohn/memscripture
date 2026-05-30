import { db, type RecentVerse } from './local';

const RECENT_LIMIT = 12;
const RETAIN_LIMIT = 50;

function rowId(packageId: string, verseNo: number): string {
	return `${packageId}:${verseNo}`;
}

/** Upserts a `recent_verses` row for the verse the user just opened.
 *
 *  Side-effect intentionally NOT routed through touchDataModified: the
 *  recent-verses table is per-device telemetry, not user content. Bumping
 *  data_last_modified_at on every page-view would defeat the
 *  last-writer-wins sync semantics (the timestamp should reflect content
 *  edits, not navigation). The recentVerses table is also excluded from
 *  the sync envelope for the same reason — see buildSyncSnapshot.
 *
 *  Best-effort: throws from the underlying Dexie put are caught by the
 *  caller; the dashboard is a nice-to-have, never a blocker for verse
 *  reading.
 */
export async function recordRecentVerse(packageId: string, verseNo: number): Promise<void> {
	const id = rowId(packageId, verseNo);
	await db.recentVerses.put({ id, packageId, verseNo, viewedAt: Date.now() });

	// Cap the table size. We only need ~12 for the dashboard, but keep a
	// buffer to absorb churn without rewriting the index on every put.
	const total = await db.recentVerses.count();
	if (total <= RETAIN_LIMIT) return;

	// Drop the oldest rows. orderBy('viewedAt') sorts ascending — slice off
	// `total - RETAIN_LIMIT` from the head.
	const stale = await db.recentVerses.orderBy('viewedAt').limit(total - RETAIN_LIMIT).toArray();
	if (stale.length > 0) await db.recentVerses.bulkDelete(stale.map((r) => r.id));
}

/** Returns the most-recently-viewed verses (descending viewedAt). */
export async function listRecentVerses(limit: number = RECENT_LIMIT): Promise<RecentVerse[]> {
	return db.recentVerses.orderBy('viewedAt').reverse().limit(limit).toArray();
}
