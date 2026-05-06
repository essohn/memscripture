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
