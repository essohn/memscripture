import { listAllBookmarks } from '$lib/db/bookmarks';
import { installPackage, listPackages, listVerses } from '$lib/db/verses';
import type { Bookmark, PackageMeta } from '$lib/types';
import type { StoredVerse } from '$lib/db/local';
import type { PageLoad } from './$types';

export const prerender = false;
export const ssr = false;

export interface BookmarkedRow {
	bookmark: Bookmark;
	verse: StoredVerse;
	packageName: string;
}

export interface BookmarksLoadData {
	rows: BookmarkedRow[];
}

export const load: PageLoad = async (): Promise<BookmarksLoadData> => {
	const bookmarks = await listAllBookmarks();
	if (bookmarks.length === 0) return { rows: [] };

	const uniquePkgIds = Array.from(new Set(bookmarks.map((b) => b.packageId)));

	// Ensure every referenced package is installed so verses are queryable.
	await Promise.all(uniquePkgIds.map((id) => installPackage(id).catch(() => {})));

	const [packages, versesPerPkg] = await Promise.all([
		listPackages(),
		Promise.all(uniquePkgIds.map((id) => listVerses(id)))
	]);

	const pkgNameById = new Map<string, string>(packages.map((p: PackageMeta) => [p.id, p.name]));
	const verseByKey = new Map<string, StoredVerse>();
	versesPerPkg.flat().forEach((v) => verseByKey.set(`${v.package_id}:${v.no}`, v));

	const rows: BookmarkedRow[] = [];
	for (const b of bookmarks) {
		const verse = verseByKey.get(`${b.packageId}:${b.verseNo}`);
		if (!verse) continue;
		rows.push({ bookmark: b, verse, packageName: pkgNameById.get(b.packageId) ?? b.packageId });
	}

	// Most-recently-added first
	rows.sort((a, b) => b.bookmark.createdAt - a.bookmark.createdAt);

	return { rows };
};
