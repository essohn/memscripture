import { db, type StoredVerse } from './local';
import { seedOyoPackageIfMissing } from './oyo';
import { getPackageOrder } from './packageOrder';
import { getJoinedGroups } from './groups';
import { visiblePackages } from '$lib/groups/visibility';
import type { IndexGroup, PackageMeta, Verse } from '$lib/types';

const PACKAGES_URL = '/data/packages.json';
const GROUPS_URL = '/data/packages_index.json';
let groupsCache: IndexGroup[] | null = null;
let catalogCache: Record<string, { version?: number }> | null = null;

/** Test-only: clear the module-level catalog, groups, and package-data caches
 *  between tests. A fresh page load is the only thing that clears them in
 *  production, which is exactly the moment a new deploy's catalog is read. */
export function _resetPackageCaches(): void {
	groupsCache = null;
	catalogCache = null;
	packageDataCache.clear();
}

/** The content version the catalog currently offers for a package, or null
 *  when it cannot be read — offline, a 404, or a package the catalog has
 *  forgotten. Null is a deliberate "don't know", never a zero: it must never
 *  be mistaken for "older than what is installed". */
async function catalogVersion(packageId: string): Promise<number | null> {
	if (!catalogCache) {
		try {
			const res = await fetch(PACKAGES_URL);
			if (!res.ok) return null;
			catalogCache = (await res.json()) as Record<string, { version?: number }>;
		} catch {
			return null;
		}
	}
	const v = catalogCache[packageId]?.version;
	return typeof v === 'number' ? v : null;
}

/**
 * Packages the reader has actually worked in.
 *
 * One index scan of unique keys per table rather than a count per package —
 * the library list calls this on every render, and seven packages times four
 * tables would be twenty-eight queries for a question answered by four.
 *
 * checkHistory is not consulted: finishing a check always writes a rating, so
 * it would never add a package the ratings table has not already named.
 */
async function packagesWithUserData(): Promise<Set<string>> {
	const touched = new Set<string>();
	const tables = [db.verseRatings, db.progress, db.bookmarks, db.verseMarks];
	await Promise.all(
		tables.map((t) =>
			t
				.orderBy('packageId')
				.eachUniqueKey((k) => touched.add(String(k)))
				.catch(() => {})
		)
	);
	return touched;
}

export async function listPackages(): Promise<PackageMeta[]> {
	// Ordering rules, in priority order:
	//  1. The user's custom drag-order (rank = index in that list) — this now
	//     includes OYO, so the user can place it anywhere.
	//  2. Ranked packages always precede unranked ones (newly added packages).
	//  3. Among unranked packages — including the default state before the user
	//     ever reorders — OYO ("나의 구절(OYO)", the user-kind row) comes first, then
	//     curated packages in ascending verse-count order.
	const order = await getPackageOrder();
	const rank = new Map(order.map((id, i) => [id, i] as const));
	const byOrder = (a: PackageMeta, b: PackageMeta) => {
		const ra = rank.get(a.id);
		const rb = rank.get(b.id);
		if (ra !== undefined && rb !== undefined) return ra - rb;
		if (ra !== undefined) return -1;
		if (rb !== undefined) return 1;
		const aUser = (a.kind ?? 'builtin') === 'user';
		const bUser = (b.kind ?? 'builtin') === 'user';
		if (aUser !== bUser) return aUser ? -1 : 1;
		return a.verse_number - b.verse_number;
	};

	// Always make sure the OYO row exists before any read. listPackages is the
	// canonical entry point for the library list + recent-package widgets, so
	// this is the right chokepoint — avoids the layout-effect / page-effect
	// race where the library could render without the OYO card on a fresh IDB.
	await seedOyoPackageIfMissing();

	// Group-scoped packages are withheld from readers outside the group — but
	// never from one who has worked in them. Filtered on read rather than
	// deleted: joining later brings the package back with its rows intact.
	const [joined, touched] = await Promise.all([
		getJoinedGroups().catch(() => [] as string[]),
		packagesWithUserData().catch(() => new Set<string>())
	]);

	const cached = await db.packages.toArray();
	const hasCurated = cached.some((p) => (p.kind ?? 'builtin') === 'builtin');
	if (hasCurated) {
		return visiblePackages(
			cached.map((p) => ({ ...p, kind: p.kind ?? 'builtin' })),
			joined,
			touched
		).sort(byOrder);
	}

	// First time on this device: curated packages not yet installed. Fetch and
	// upsert them; OYO (the only user-kind row at this point) survives bulkPut.
	const res = await fetch(PACKAGES_URL);
	if (!res.ok) throw new Error(`Failed to load packages: ${res.status}`);
	const map = (await res.json()) as Record<string, Omit<PackageMeta, 'id'>>;
	const curated: PackageMeta[] = Object.entries(map).map(([id, meta]) => ({
		...meta,
		id,
		kind: meta.kind ?? 'builtin'
	}));
	await db.packages.bulkPut(curated);

	// Re-read so any user-kind rows (OYO seeded above) come along.
	const all = await db.packages.toArray();
	return visiblePackages(
		all.map((p) => ({ ...p, kind: p.kind ?? 'builtin' })),
		joined,
		touched
	).sort(byOrder);
}

export async function isPackageInstalled(packageId: string): Promise<boolean> {
	const count = await db.verses.where('package_id').equals(packageId).count();
	return count > 0;
}

/**
 * Installs a package's verses, and re-installs them when the catalog has moved
 * past the copy on this device.
 *
 * The verse rows carry no user data — underlines, ratings, progress and check
 * history all live in their own tables, keyed by package and verse number — so
 * a refresh is a pure content replacement with nothing of the reader's to lose.
 * That is what makes correcting a typo in the corpus safe to do behind their
 * back.
 */
export async function installPackage(packageId: string): Promise<void> {
	const pkg = await db.packages.get(packageId);
	if (!pkg) throw new Error(`Unknown package: ${packageId}`);

	// User-owned packages have no JSON source — their data is created at runtime.
	if (pkg.kind === 'user') return;

	const installed = await isPackageInstalled(packageId);
	const target = await catalogVersion(packageId);
	// Every package shipped before this existed was version 1, so a row with no
	// recorded version is a version-1 install. An unreadable catalog leaves the
	// device with what it has: being offline must not cost the reader the verses.
	if (installed && (target === null || (pkg.installedVersion ?? 1) >= target)) return;

	const res = await fetch(`/${pkg.source}`);
	if (!res.ok) throw new Error(`Failed to load ${pkg.source}: ${res.status}`);
	const verses = (await res.json()) as Verse[];

	const rows: StoredVerse[] = verses.map((v) => ({
		...v,
		package_id: packageId,
		no: v.i
	}));
	await db.verses.bulkPut(rows);
	await db.packages.put({ ...pkg, installedVersion: target ?? pkg.version });
	// The table is only half the story — loadPackageData memoizes verses per
	// package, and a stale memo would keep the old text on screen regardless.
	packageDataCache.delete(packageId);
}

export async function readVerse(
	packageId: string,
	verseNo: number
): Promise<StoredVerse | undefined> {
	return db.verses.get([packageId, verseNo]);
}

export async function listVerses(packageId: string): Promise<StoredVerse[]> {
	return db.verses.where('package_id').equals(packageId).sortBy('no');
}

export async function listGroups(packageId: string): Promise<IndexGroup[]> {
	if (!groupsCache) {
		const res = await fetch(GROUPS_URL);
		if (!res.ok) throw new Error(`Failed to load groups: ${res.status}`);
		groupsCache = (await res.json()) as IndexGroup[];
	}
	return groupsCache.filter((g) => g.package_id === packageId);
}

// ─── Filter helpers ────────────────────────────────────────────────────────

export function level1Groups(groups: IndexGroup[]): IndexGroup[] {
	return groups.filter((g) => g.level === 1);
}

function isSubset(child: number[], parent: number[]): boolean {
	const set = new Set(parent);
	return child.every((n) => set.has(n));
}

export function level2GroupsInSeries(
	groups: IndexGroup[],
	seriesIndex: number | null
): IndexGroup[] {
	if (seriesIndex === null) return [];
	const l1s = level1Groups(groups);
	const series = l1s[seriesIndex];
	if (!series) return [];
	return groups.filter((g) => g.level === 2 && isSubset(g.index, series.index));
}

export type VerseTag =
	| { level: 1; group: IndexGroup; seriesIndex: number }
	| { level: 2; group: IndexGroup; seriesIndex: number; groupIndex: number };

export function tagsForVerse(groups: IndexGroup[], verseNo: number): VerseTag[] {
	const l1s = level1Groups(groups);
	const tags: VerseTag[] = [];

	// Level-1 tags first, in JSON order
	l1s.forEach((g, i) => {
		if (g.index.includes(verseNo)) {
			tags.push({ level: 1, group: g, seriesIndex: i });
		}
	});

	// Level-2 tags next: each l2 belongs to exactly one series; find its parent
	for (const g of groups) {
		if (g.level !== 2) continue;
		if (!g.index.includes(verseNo)) continue;

		const parentIdx = l1s.findIndex((l1) => isSubset(g.index, l1.index));
		if (parentIdx === -1) continue;

		const siblings = level2GroupsInSeries(groups, parentIdx);
		const groupIndex = siblings.findIndex((s) => s === g);
		if (groupIndex === -1) continue;

		tags.push({ level: 2, group: g, seriesIndex: parentIdx, groupIndex });
	}

	return tags;
}

export function filterVerses(
	verses: StoredVerse[],
	groups: IndexGroup[],
	seriesIndex: number | null,
	groupIndices: number[]
): StoredVerse[] {
	const l1s = level1Groups(groups);
	const series = seriesIndex !== null ? l1s[seriesIndex] : undefined;
	if (!series) return verses; // pass-through (null or out of range)

	const seriesSet = new Set(series.index);
	let kept = verses.filter((v) => seriesSet.has(v.no));

	if (groupIndices.length > 0) {
		const l2s = level2GroupsInSeries(groups, seriesIndex);
		const validGroups = groupIndices.map((i) => l2s[i]).filter((g): g is IndexGroup => Boolean(g));
		if (validGroups.length === 0) return kept; // all indices out of range → no further filter

		const allowed = new Set<number>();
		for (const g of validGroups) for (const n of g.index) allowed.add(n);
		kept = kept.filter((v) => allowed.has(v.no));
	}

	return kept;
}

// ─── Package-level caching for hot path optimization ───────────────────────

interface PackageData {
	verses: StoredVerse[];
	groups: IndexGroup[];
	tagsByVerseNo: Map<number, VerseTag[]>;
}

const packageDataCache = new Map<string, PackageData>();

/**
 * Optimized batch computation of tags-per-verse for a single package.
 * Pre-builds index Sets and a parent-series map so the per-verse work is O(L1+L2)
 * instead of O(L1+L2) × O(level2GroupsInSeries) per level-2 hit.
 */
function buildTagsByVerseNo(verses: StoredVerse[], groups: IndexGroup[]): Map<number, VerseTag[]> {
	const map = new Map<number, VerseTag[]>();
	const l1s = level1Groups(groups);
	if (l1s.length <= 1) return map; // suppress for flat packages

	// Pre-compute Sets for O(1) membership
	const indexSet = new Map<IndexGroup, Set<number>>();
	for (const g of groups) indexSet.set(g, new Set(g.index));

	const l1Sets = l1s.map((g) => indexSet.get(g)!);

	// Group level-2s by parent series, in JSON order
	const l2Groups = groups.filter((g) => g.level === 2);
	const parentByL2 = new Map<IndexGroup, number>();
	for (const g of l2Groups) {
		const parentIdx = l1Sets.findIndex((set) => g.index.every((n) => set.has(n)));
		if (parentIdx >= 0) parentByL2.set(g, parentIdx);
	}

	const siblingsBySeries = new Map<number, IndexGroup[]>();
	for (const g of l2Groups) {
		const parentIdx = parentByL2.get(g);
		if (parentIdx === undefined) continue;
		let arr = siblingsBySeries.get(parentIdx);
		if (!arr) {
			arr = [];
			siblingsBySeries.set(parentIdx, arr);
		}
		arr.push(g);
	}

	for (const v of verses) {
		const tags: VerseTag[] = [];

		// Level-1
		l1s.forEach((g, i) => {
			if (l1Sets[i].has(v.no)) tags.push({ level: 1, group: g, seriesIndex: i });
		});

		// Level-2
		for (const g of l2Groups) {
			if (!indexSet.get(g)!.has(v.no)) continue;
			const parentIdx = parentByL2.get(g);
			if (parentIdx === undefined) continue;
			const siblings = siblingsBySeries.get(parentIdx)!;
			const groupIndex = siblings.indexOf(g);
			if (groupIndex >= 0) {
				tags.push({ level: 2, group: g, seriesIndex: parentIdx, groupIndex });
			}
		}

		if (tags.length > 0) map.set(v.no, tags);
	}

	return map;
}

/**
 * Loads (and caches) all data needed by the package detail page.
 * Subsequent calls for the same packageId skip the verse read and the tag
 * build — back-navigation across the SPA costs only the version check below.
 */
export async function loadPackageData(packageId: string): Promise<PackageData> {
	// Ahead of the memo read, not after it: installPackage is what notices a
	// newer catalog and drops the memo, and a warm memo consulted first would
	// keep serving corrected-away text for the rest of the session. The two
	// indexed lookups it costs are not what the memo is here to save — that is
	// listVerses plus the tag build below, which still only run once.
	await installPackage(packageId);

	const cached = packageDataCache.get(packageId);
	if (cached) return cached;

	const [verses, groups] = await Promise.all([listVerses(packageId), listGroups(packageId)]);
	const tagsByVerseNo = buildTagsByVerseNo(verses, groups);

	const data: PackageData = { verses, groups, tagsByVerseNo };
	packageDataCache.set(packageId, data);
	return data;
}

/**
 * Synchronous accessor — returns cached data if loaded, else null.
 * Useful for subsequent paths (verse detail) that need groups without awaiting.
 */
export function getCachedPackageData(packageId: string): PackageData | null {
	return packageDataCache.get(packageId) ?? null;
}
