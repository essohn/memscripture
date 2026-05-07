import { db, type StoredVerse } from './local';
import type { IndexGroup, PackageMeta, Verse } from '$lib/types';

const PACKAGES_URL = '/data/packages.json';
const GROUPS_URL = '/data/packages_index.json';
let groupsCache: IndexGroup[] | null = null;

export async function listPackages(): Promise<PackageMeta[]> {
	const cached = await db.packages.toArray();
	if (cached.length) return cached;

	const res = await fetch(PACKAGES_URL);
	if (!res.ok) throw new Error(`Failed to load packages: ${res.status}`);
	const map = (await res.json()) as Record<string, Omit<PackageMeta, 'id'>>;
	const list: PackageMeta[] = Object.entries(map).map(([id, meta]) => ({ ...meta, id }));
	await db.packages.bulkPut(list);
	return list;
}

export async function isPackageInstalled(packageId: string): Promise<boolean> {
	const count = await db.verses.where('package_id').equals(packageId).count();
	return count > 0;
}

export async function installPackage(packageId: string): Promise<void> {
	if (await isPackageInstalled(packageId)) return;

	const pkg = await db.packages.get(packageId);
	if (!pkg) throw new Error(`Unknown package: ${packageId}`);

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
