import type { SyncSnapshot } from './snapshot';

/**
 * Merging two snapshots instead of choosing one.
 *
 * Sync used to compare a single timestamp and replace the whole snapshot with
 * the newer side. That is not a merge, it is a coin toss with the loser's data
 * deleted — and the toss was easy to lose by accident, because almost any
 * write stamps the clock. A freshly installed phone that had done nothing but
 * join a team was "newer" than a year of records, and the upload direction had
 * neither a confirmation nor a backup.
 *
 * Almost everything here is per-record and carries its own timestamp, so the
 * fix is to resolve per record rather than per snapshot. Two devices that have
 * both been used now keep both sets of work.
 *
 * The cost, stated plainly: this cannot distinguish "deleted here" from "never
 * seen here", so a bookmark cleared on one device reappears from the other
 * until the same clear syncs back. A returning bookmark is a smaller harm than
 * a lost year, and that is the trade being made.
 *
 * checkHistory is the one exception, because there the harm runs the other
 * way: a reader who deletes a check has said something deliberate, and a union
 * that quietly undoes it would make the delete button a lie. That table alone
 * carries tombstones. The others still do not — the trade above is still the
 * right one wherever a returning row is merely untidy rather than a reversed
 * decision.
 */

/** Keeps whichever copy of each id has the greater version, unioning the rest. */
function mergeById<T>(
	a: T[] | undefined,
	b: T[] | undefined,
	idOf: (x: T) => string,
	versionOf: (x: T) => number
): T[] {
	const out = new Map<string, T>();
	for (const item of [...(a ?? []), ...(b ?? [])]) {
		const id = idOf(item);
		const seen = out.get(id);
		if (!seen || versionOf(item) >= versionOf(seen)) out.set(id, item);
	}
	return [...out.values()];
}

/** Union by id with no version to compare — every record is kept. Right for
 *  append-only logs, where two devices simply hold different entries. */
function unionById<T>(a: T[] | undefined, b: T[] | undefined, idOf: (x: T) => string): T[] {
	const out = new Map<string, T>();
	for (const item of [...(a ?? []), ...(b ?? [])]) out.set(idOf(item), item);
	return [...out.values()];
}

/** ISO-8601 sorts correctly in plain lexicographic order. */
function laterOf(a: string, b: string): string {
	return a > b ? a : b;
}

export function mergeSnapshots(local: SyncSnapshot, remote: SyncSnapshot): SyncSnapshot {
	// Whichever snapshot was written later wins the few things that have no
	// per-record version of their own.
	const newer = (local.lastModifiedAt ?? '') >= (remote.lastModifiedAt ?? '') ? local : remote;
	const older = newer === local ? remote : local;

	// Computed before the snapshot rather than inside it: the merged history
	// has to be filtered by the merged tombstones, and reading a half-built
	// object literal to do that would be a puzzle for the next reader.
	const deletions = unionById(local.checkDeletions, remote.checkDeletions, (d) => d.id);
	const deleted = new Set(deletions.map((d) => d.id));

	return {
		version: 1,
		exportedAt: laterOf(local.exportedAt ?? '', remote.exportedAt ?? ''),
		lastModifiedAt: laterOf(local.lastModifiedAt ?? '', remote.lastModifiedAt ?? ''),
		device: newer.device,

		oyo: {
			// A user-authored package row: no timestamp to compare, so the later
			// snapshot's wins, falling back to whichever side has one at all.
			package: newer.oyo?.package ?? older.oyo?.package ?? null,
			// Verses the reader wrote themselves. Keyed by package and number;
			// union keeps what each device added.
			verses: unionById(
				local.oyo?.verses,
				remote.oyo?.verses,
				(v) => `${v.package_id}:${v.no}`
			)
		},

		// A bookmark is set or cleared as a whole; createdAt stamps the setting.
		bookmarks: mergeById(local.bookmarks, remote.bookmarks, (b) => b.id, (b) => b.createdAt),

		// Taken whole per verse rather than merged field by field — the rating
		// arrays inside are a history, and interleaving two of them would invent
		// a sequence neither device ever saw.
		progress: mergeById(
			local.progress,
			remote.progress,
			(p) => p.id,
			(p) => Math.max(p.lastReviewedAt ?? 0, p.enteredBucketAt ?? 0)
		),

		// One row per day, presence-only: the union is the union of days used.
		activity: unionById(local.activity, remote.activity, (a) => a.dateKey),

		verseRatings: mergeById(
			local.verseRatings,
			remote.verseRatings,
			(r) => r.id,
			(r) => r.updatedAt
		),

		// An append-only log with an id unique per check. Nothing to resolve:
		// two devices simply hold different entries, and both count — except
		// where the reader has said otherwise, which is what the tombstones are.
		checkHistory: unionById(local.checkHistory, remote.checkHistory, (c) => c.id).filter(
			(c) => !deleted.has(c.id)
		),

		// The one table that carries deletions, so the union above can be told
		// about them. Unioned rather than resolved: a tombstone is a fact that
		// happened, and two devices deleting different checks both happened.
		// They travel so that a device syncing later learns about a deletion it
		// never saw, instead of re-offering the row forever.
		checkDeletions: deletions,

		verseMarks: mergeById(
			local.verseMarks,
			remote.verseMarks,
			(m) => m.id,
			(m) => m.updatedAt
		),

		// No per-key timestamp exists, so the later snapshot's value wins per
		// key. Device-local keys never travel — buildSyncSnapshot omits them.
		settings: mergeById(
			older.settings?.map((s) => ({ ...s, __rank: 0 })),
			newer.settings?.map((s) => ({ ...s, __rank: 1 })),
			(s) => s.key,
			(s) => s.__rank
		).map(({ __rank, ...rest }) => rest)
	};
}
