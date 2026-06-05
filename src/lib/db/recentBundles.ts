import { db, type RecentBundle } from './local';

const RECENT_LIMIT = 12;
const RETAIN_LIMIT = 50;

/** Stable id for a bundle: package + sorted verse numbers. Re-committing the
 *  same set of verses upserts the same row (bumping createdAt) instead of
 *  piling up duplicate cards. */
function bundleId(packageId: string, sortedNos: number[]): string {
	return `${packageId}:${sortedNos.join('-')}`;
}

/** Records a multi-select as one "최근" bundle. Verse numbers are stored sorted
 *  ascending so the first is the "front" verse the dashboard previews.
 *
 *  Best-effort, per-device telemetry: not routed through touchDataModified and
 *  excluded from the sync envelope (see buildSyncSnapshot), same as recentVerses. */
export async function recordRecentBundle(
	packageId: string,
	verseNos: number[],
	seriesIndex: number | null = null,
	groupIndices: number[] = []
): Promise<void> {
	if (verseNos.length === 0) return;
	const sorted = [...new Set(verseNos)].sort((a, b) => a - b);
	const id = bundleId(packageId, sorted);
	await db.recentBundles.put({
		id,
		packageId,
		verseNos: sorted,
		seriesIndex,
		groupIndices: [...groupIndices],
		createdAt: Date.now()
	});

	// Cap table growth, mirroring recentVerses.
	const total = await db.recentBundles.count();
	if (total <= RETAIN_LIMIT) return;
	const stale = await db.recentBundles
		.orderBy('createdAt')
		.limit(total - RETAIN_LIMIT)
		.toArray();
	if (stale.length > 0) await db.recentBundles.bulkDelete(stale.map((r) => r.id));
}

/** Returns the most-recently-committed bundles (descending createdAt). */
export async function listRecentBundles(limit: number = RECENT_LIMIT): Promise<RecentBundle[]> {
	return db.recentBundles.orderBy('createdAt').reverse().limit(limit).toArray();
}

/** Removes a single bundle by id. */
export async function deleteRecentBundle(id: string): Promise<void> {
	await db.recentBundles.delete(id);
}

/** Removes every bundle. */
export async function clearRecentBundles(): Promise<void> {
	await db.recentBundles.clear();
}

/** Re-inserts a bundle verbatim (preserving its original createdAt) — used to
 *  undo a delete without bumping it to the top of the list. */
export async function restoreRecentBundle(bundle: RecentBundle): Promise<void> {
	await db.recentBundles.put(bundle);
}
