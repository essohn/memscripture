import { db } from './local';

const KEY = 'recent_views';

type RecentViewMap = Record<string, number>;

async function readMap(): Promise<RecentViewMap> {
	const entry = await db.settings.get(KEY);
	const value = entry?.value;
	return value && typeof value === 'object' ? (value as RecentViewMap) : {};
}

/**
 * Record that the user just viewed the given package.
 * Stores a timestamp in Dexie so other pages can query the recency order.
 */
export async function recordPackageView(packageId: string): Promise<void> {
	const map = await readMap();
	map[packageId] = Date.now();
	await db.settings.put({ key: KEY, value: map });
}

/**
 * Returns the top-N most recently viewed package IDs, ordered most-recent first.
 * Returns an empty array if no history exists.
 */
export async function getRecentPackageIds(limit = 3): Promise<string[]> {
	const map = await readMap();
	return Object.entries(map)
		.sort(([, a], [, b]) => b - a)
		.slice(0, limit)
		.map(([id]) => id);
}
