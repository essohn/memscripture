import { db } from '$lib/db/local';
import { OYO_PACKAGE_ID } from '$lib/db/oyo';
import { getDataLastModified } from '$lib/db/touchData';
import type { Bookmark, DailyActivity, PackageMeta, VerseProgress } from '$lib/types';
import type { StoredSetting, StoredVerse, VerseRating } from '$lib/db/local';

const DEVICE_KEY = 'sync_device_id';

/** Settings rows that are per-device by design and must not travel between
 *  installs nor be wiped when applying a remote snapshot:
 *  - sync_device_id: the local device's UUID
 *  - google_drive_auth: the local OAuth token + email
 *  - pre_sync_backup: the local "undo last sync" snapshot, written by
 *    savePreSyncBackup immediately before applySyncSnapshot is called.
 *
 *  buildSyncSnapshot filters these out so they're never serialized;
 *  applySyncSnapshot preserves the local rows across the clear/restore so
 *  the user's auth state, device id, and just-saved undo backup all survive
 *  a remote-newer import. */
const DEVICE_LOCAL_KEYS = ['sync_device_id', 'google_drive_auth', 'pre_sync_backup'] as const;

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
	verseRatings: VerseRating[];
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
	const [oyoPkg, allVerses, bookmarks, progress, activity, settings, verseRatings] =
		await Promise.all([
			db.packages.get(OYO_PACKAGE_ID),
			db.verses.where('package_id').equals(OYO_PACKAGE_ID).toArray(),
			db.bookmarks.toArray(),
			db.progress.toArray(),
			db.activity.toArray(),
			db.settings.toArray(),
			db.verseRatings.toArray()
		]);

	const localKeySet = new Set<string>(DEVICE_LOCAL_KEYS);
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
		// Strip device-local rows so they never leak to other installs.
		settings: settings.filter((row) => !localKeySet.has(row.key)),
		verseRatings
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
		[
			db.packages,
			db.verses,
			db.bookmarks,
			db.progress,
			db.activity,
			db.settings,
			db.verseRatings
		],
		async () => {
			// Preserve device-local settings (auth, device id, pre-sync backup)
			// so they survive the settings.clear() below — otherwise the user
			// loses their OAuth token AND the just-saved undo backup, neither
			// of which should be replaced by the source device's values.
			const preserved = (
				await Promise.all(DEVICE_LOCAL_KEYS.map((k) => db.settings.get(k)))
			).filter((row): row is StoredSetting => Boolean(row));

			// Clear in-scope rows. We intentionally leave built-in packages and
			// their verses alone; listPackages will repopulate them on first read.
			await db.bookmarks.clear();
			await db.progress.clear();
			await db.activity.clear();
			await db.settings.clear();
			await db.verses.where('package_id').equals(OYO_PACKAGE_ID).delete();
			await db.verseRatings.clear();

			// Restore. Order matters only for read paths that join — none here.
			if (snap.oyo.package) await db.packages.put(snap.oyo.package);
			if (snap.oyo.verses?.length) await db.verses.bulkPut(snap.oyo.verses);
			if (snap.bookmarks?.length) await db.bookmarks.bulkPut(snap.bookmarks);
			if (snap.progress?.length) await db.progress.bulkPut(snap.progress);
			if (snap.activity?.length) await db.activity.bulkPut(snap.activity);
			if (snap.settings?.length) await db.settings.bulkPut(snap.settings);
			if (snap.verseRatings?.length) await db.verseRatings.bulkPut(snap.verseRatings);

			// Re-put device-local rows last so they override any same-key entries
			// from the snapshot's settings array (defensive; build-time filter
			// already removes them, but this guards against malformed envelopes).
			if (preserved.length) await db.settings.bulkPut(preserved);
		}
	);
}
