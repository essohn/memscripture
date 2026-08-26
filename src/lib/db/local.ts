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

/** A group of verses committed to "최근" together (one multi-select). Surfaced
 *  on the dashboard as a single bundle showing the front verse + count; tapping
 *  it re-opens the package list with those verses selected. id is derived from
 *  the package + sorted verse numbers so re-committing the same set upserts.
 *  Per-device telemetry — excluded from the sync envelope, like recentVerses. */
export interface RecentBundle {
	id: string;
	packageId: string;
	verseNos: number[];
	/** Package filter (series / group indices) active when the bundle was
	 *  committed, so tapping it can restore the same filtered view. Optional —
	 *  bundles saved before this existed simply restore with no filter. */
	seriesIndex?: number | null;
	groupIndices?: number[];
	createdAt: number;
}

/** User-assigned self-assessment for a single verse on a 1-5 scale.
 *  startDifficulty = how hard the *opening* is to recall (the cue).
 *  fullDifficulty = how hard the *whole verse* is to memorize end-to-end.
 *  null = not rated yet; the badge renders in an unset state. */
/** One completed memorize check. Written only when a result is saved, so a
 *  cancelled attempt leaves no trace. */
export interface CheckRecord {
	id: string;
	/** `${packageId}:${verseNo}` — the index the per-verse list queries on. */
	verseKey: string;
	packageId: string;
	verseNo: number;
	checkedAt: number;
	start: number | null;
	full: number | null;
	accuracy: number;
	elapsedMs: number;
	/** 힌트 presses spent during the check. Optional: rows written before hints
	 *  existed have none, and absent is not the same as zero. */
	hints?: number;
	/** Word positions the attempt got wrong, as markMismatchedWords saw them.
	 *  Optional for the same reason `hints` is: records written before this
	 *  existed have none, and absent is not the same as an empty array — one
	 *  means nothing was measured, the other means nothing was missed. */
	missed?: number[];
}

/** Words the reader underlined on one verse — the places they keep tripping
 *  over. Stored per verse rather than per word so the whole set reads and
 *  writes as a single row. */
export interface VerseMark {
	id: string;
	packageId: string;
	verseNo: number;
	words: { i: number; w: string }[];
	updatedAt: number;
}

export interface VerseRating {
	id: string;
	packageId: string;
	verseNo: number;
	startDifficulty: number | null;
	fullDifficulty: number | null;
	updatedAt: number;
}

class LocalDB extends Dexie {
	packages!: Table<StoredPackage, string>;
	verses!: Table<StoredVerse, [string, number]>;
	settings!: Table<StoredSetting, string>;
	progress!: Table<VerseProgress, string>;
	activity!: Table<DailyActivity, string>;
	bookmarks!: Table<Bookmark, string>;
	recentVerses!: Table<RecentVerse, string>;
	recentBundles!: Table<RecentBundle, string>;
	verseRatings!: Table<VerseRating, string>;
	checkHistory!: Table<CheckRecord, string>;
	verseMarks!: Table<VerseMark, string>;

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
		this.version(5).stores({
			packages: '&id, name',
			verses: '[package_id+no], package_id',
			settings: '&key',
			progress: '&id, packageId, bucket',
			activity: '&dateKey',
			bookmarks: '&id, packageId, color',
			recentVerses: '&id, viewedAt',
			verseRatings: '&id, packageId'
		});
		this.version(6).stores({
			packages: '&id, name',
			verses: '[package_id+no], package_id',
			settings: '&key',
			progress: '&id, packageId, bucket',
			activity: '&dateKey',
			bookmarks: '&id, packageId, color',
			recentVerses: '&id, viewedAt',
			recentBundles: '&id, createdAt',
			verseRatings: '&id, packageId'
		});
		// v7 adds checkHistory. Purely additive, so Dexie migrates existing
		// databases without a data callback.
		this.version(7).stores({
			packages: '&id, name',
			verses: '[package_id+no], package_id',
			settings: '&key',
			progress: '&id, packageId, bucket',
			activity: '&dateKey',
			bookmarks: '&id, packageId, color',
			recentVerses: '&id, viewedAt',
			recentBundles: '&id, createdAt',
			verseRatings: '&id, packageId',
			checkHistory: '&id, verseKey, checkedAt'
		});
		// v8 adds verseMarks. Additive again, so no data callback.
		this.version(8).stores({
			packages: '&id, name',
			verses: '[package_id+no], package_id',
			settings: '&key',
			progress: '&id, packageId, bucket',
			activity: '&dateKey',
			bookmarks: '&id, packageId, color',
			recentVerses: '&id, viewedAt',
			recentBundles: '&id, createdAt',
			verseRatings: '&id, packageId',
			checkHistory: '&id, verseKey, checkedAt',
			verseMarks: '&id, packageId'
		});
	}
}

export const db = new LocalDB();
