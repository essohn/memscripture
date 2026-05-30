import Dexie, { type Table } from 'dexie';
import type { Bookmark, PackageMeta, Verse, VerseProgress, DailyActivity } from '$lib/types';

export type StoredVerse = Verse & { package_id: string; no: number };
export type StoredPackage = PackageMeta;
export type StoredSetting = { key: string; value: unknown };

/** Tracks the verses the user has recently opened so the dashboard can
 *  surface them as quick-resume entries. id = `${packageId}:${verseNo}` so
 *  re-visits upsert into the same row (the dashboard de-dupes via this key).
 *  Indexed on viewedAt for the descending sort the dashboard query needs. */
export interface RecentVerse {
	id: string;
	packageId: string;
	verseNo: number;
	viewedAt: number;
}

class LocalDB extends Dexie {
	packages!: Table<StoredPackage, string>;
	verses!: Table<StoredVerse, [string, number]>;
	settings!: Table<StoredSetting, string>;
	progress!: Table<VerseProgress, string>;
	activity!: Table<DailyActivity, string>;
	bookmarks!: Table<Bookmark, string>;
	recentVerses!: Table<RecentVerse, string>;

	constructor() {
		super('memscripture');
		this.version(1).stores({
			packages: '&id, name',
			verses: '[package_id+no], package_id',
			settings: '&key'
		});
		this.version(2).stores({
			packages: '&id, name',
			verses: '[package_id+no], package_id',
			settings: '&key',
			progress: '&id, packageId, bucket',
			activity: '&dateKey'
		});
		this.version(3).stores({
			packages: '&id, name',
			verses: '[package_id+no], package_id',
			settings: '&key',
			progress: '&id, packageId, bucket',
			activity: '&dateKey',
			bookmarks: '&id, packageId, color'
		});
		this.version(4).stores({
			packages: '&id, name',
			verses: '[package_id+no], package_id',
			settings: '&key',
			progress: '&id, packageId, bucket',
			activity: '&dateKey',
			bookmarks: '&id, packageId, color',
			recentVerses: '&id, viewedAt'
		});
	}
}

export const db = new LocalDB();
