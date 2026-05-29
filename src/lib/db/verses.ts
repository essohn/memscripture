import { db, type StoredVerse } from './local';
import type { IndexGroup, PackageMeta, Verse } from '$lib/types';

const PACKAGES_URL = '/data/packages.json';
const GROUPS_URL = '/data/packages_index.json';
let groupsCache: IndexGroup[] | null = null;

export async function listPackages(): Promise<PackageMeta[]> {
	const byVerseNumber = (a: PackageMeta, b: PackageMeta) => a.verse_number - b.verse_number;

	const cached = await db.packages.toArray();
	if (cached.length) {
		return cached.map((p) => ({ ...p, kind: p.kind ?? 'builtin' })).sort(byVerseNumber);
	}

	const res = await fetch(PACKAGES_URL);
	if (!res.ok) throw new Error(`Failed to load packages: ${res.status}`);
	const map = (await res.json()) as Record<string, Omit<PackageMeta, 'id'>>;
	const list: PackageMeta[] = Object.entries(map).map(([id, meta]) => ({
		...meta,
		id,
		kind: meta.kind ?? 'builtin'
	}));
	await db.packages.bulkPut(list);
	return list.sort(byVerseNumber);
}

export async function isPackageInstalled(packageId: string): Promise<boolean> {
	const count = await db.verses.where('package_id').equals(packageId).count();
	return count > 0;
}

export async function installPackage(packageId: string): Promise<void> {
	if (await isPackageInstalled(packageId)) return;

	const pkg = await db.packages.get(packageId);
	if (!pkg) throw new Error(`Unknown package: ${packageId}`);

	// User-owned packages have no JSON source — their data is created at runtime.
	if (pkg.kind === 'user') return;

	const res = await fetch(`/${pkg.source}`);
	if (!res.ok) throw new Error(`Failed to load ${pkg.source}: ${res.status}`);
	const verses = (await res.json()) as Verse[];

	const rows: StoredVerse[] = verses.map((v) => ({
		...v,
		package_id: packageId,
		no: v.i
	}));
	await db.verses.bulkPut(rows);
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
 * Subsequent calls for the same packageId return cached data instantly —
 * survives back-navigation across the SPA without hitting Dexie or recomputing tags.
 */
export async function loadPackageData(packageId: string): Promise<PackageData> {
	const cached = packageDataCache.get(packageId);
	if (cached) return cached;

	await installPackage(packageId);
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
