import { db } from '$lib/db/local';
import { OYO_PACKAGE_ID } from '$lib/db/oyo';
import { getDataLastModified } from '$lib/db/touchData';
import type { Bookmark, DailyActivity, PackageMeta, VerseProgress } from '$lib/types';
import type { StoredSetting, StoredVerse } from '$lib/db/local';

const DEVICE_KEY = 'sync_device_id';

export interface SyncSnapshot {
	version: 1;
	exportedAt: string;
	lastModifiedAt: string;
	device: string;
	oyo: {
		package: PackageMeta | null;
		verses: StoredVerse[];
	};
	bookmarks: Bookmark[];
	progress: VerseProgress[];
	activity: DailyActivity[];
	settings: StoredSetting[];
}

/** Returns the device id stored in settings, creating one on first call.
 *  Used only for telemetry / toast strings — sync identity does not depend
 *  on this. */
async function getOrCreateDeviceId(): Promise<string> {
	const row = await db.settings.get(DEVICE_KEY);
	if (row && typeof row.value === 'string') return row.value;
	const id = (
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`
	);
	await db.settings.put({ key: DEVICE_KEY, value: id });
	return id;
}

export async function buildSyncSnapshot(): Promise<SyncSnapshot> {
	const device = await getOrCreateDeviceId();
	const [oyoPkg, allVerses, bookmarks, progress, activity, settings] = await Promise.all([
		db.packages.get(OYO_PACKAGE_ID),
		db.verses.where('package_id').equals(OYO_PACKAGE_ID).toArray(),
		db.bookmarks.toArray(),
		db.progress.toArray(),
		db.activity.toArray(),
		db.settings.toArray()
	]);

	return {
		version: 1,
		exportedAt: new Date().toISOString(),
		lastModifiedAt: (await getDataLastModified()) ?? '',
		device,
		oyo: {
			package: oyoPkg ?? null,
			verses: allVerses
		},
		bookmarks,
		progress,
		activity,
		settings
	};
}

// Signature is `unknown` because callers fan in JSON.parse output — pushing
// the runtime check inside keeps the type-cast at the boundary instead of
// scattered through call sites.
export async function applySyncSnapshot(input: unknown): Promise<void> {
	if (!input || typeof input !== 'object' || (input as { version?: unknown }).version !== 1) {
		throw new Error(
			`unsupported snapshot version: ${String((input as { version?: unknown } | null)?.version)}`
		);
	}
	const snap = input as SyncSnapshot;

	// Atomic clear + restore. Wrapping the sequence in a Dexie transaction
	// prevents the user from being stranded with a partially-wiped settings
	// table if the tab dies between the clear and the bulkPut.
	await db.transaction(
		'rw',
		[db.packages, db.verses, db.bookmarks, db.progress, db.activity, db.settings],
		async () => {
			// Clear in-scope rows. We intentionally leave built-in packages and
			// their verses alone; listPackages will repopulate them on first read.
			await db.bookmarks.clear();
			await db.progress.clear();
			await db.activity.clear();
			await db.settings.clear();
			await db.verses.where('package_id').equals(OYO_PACKAGE_ID).delete();

			// Restore. Order matters only for read paths that join — none here.
			if (snap.oyo.package) await db.packages.put(snap.oyo.package);
			if (snap.oyo.verses?.length) await db.verses.bulkPut(snap.oyo.verses);
			if (snap.bookmarks?.length) await db.bookmarks.bulkPut(snap.bookmarks);
			if (snap.progress?.length) await db.progress.bulkPut(snap.progress);
			if (snap.activity?.length) await db.activity.bulkPut(snap.activity);
			if (snap.settings?.length) await db.settings.bulkPut(snap.settings);
		}
	);
}
