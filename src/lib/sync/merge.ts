import { OYO_PACKAGE_ID } from '$lib/db/oyo';
import type { StoredVerse } from '$lib/db/local';
import type { PackageMeta } from '$lib/types';
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

/**
 * Lines the older side's OYO verses up against the newer side's.
 *
 * A verse's number is handed out max+1 by whichever device wrote it, so two
 * devices that each added verses before syncing both hold a verse 1 — and they
 * are different verses. Keying the union on the number alone kept one and
 * silently dropped the other, on both devices once the result was uploaded.
 *
 * The newer side keeps its numbering. An older verse is the same verse as a
 * newer one when the text matches outright, or when it sits under the same
 * number with the same reference (an edit — the newer copy wins). Anything else
 * that lands on a taken number is a different verse and moves to a fresh one;
 * `renumber` says where, so the records pointing at it can follow.
 */
function reconcileOyoVerses(
	newer: StoredVerse[],
	older: StoredVerse[]
): { verses: StoredVerse[]; renumber: Map<number, number> } {
	const contentKey = (v: StoredVerse) => `${v.cite}\u0000${v.w}`;
	const byNo = new Map(newer.map((v) => [v.no, v]));
	const byContent = new Map(newer.map((v) => [contentKey(v), v.no]));
	const renumber = new Map<number, number>();
	const out = [...newer];
	let next = Math.max(0, ...newer.map((v) => v.no), ...older.map((v) => v.no)) + 1;

	for (const v of [...older].sort((a, b) => a.no - b.no)) {
		const twin = byContent.get(contentKey(v));
		if (twin !== undefined) {
			if (twin !== v.no) renumber.set(v.no, twin);
			continue;
		}
		const taken = byNo.get(v.no);
		if (taken && taken.cite === v.cite) continue;
		const placed = taken ? { ...v, no: next, i: next++ } : v;
		if (placed.no !== v.no) renumber.set(v.no, placed.no);
		out.push(placed);
		byNo.set(placed.no, placed);
		byContent.set(contentKey(placed), placed.no);
	}
	return { verses: out, renumber };
}

/** Points the older side's OYO records at the numbers their verses ended up
 *  under. Rows of every other package pass through untouched. */
function renumberOyo<T extends { packageId: string; verseNo: number }>(
	rows: T[] | undefined,
	renumber: Map<number, number>,
	rekey: (row: T, key: string) => T
): T[] | undefined {
	if (!rows || renumber.size === 0) return rows;
	return rows.map((row) => {
		const no = row.packageId === OYO_PACKAGE_ID ? renumber.get(row.verseNo) : undefined;
		return no === undefined ? row : rekey({ ...row, verseNo: no }, `${OYO_PACKAGE_ID}:${no}`);
	});
}

function followRenumber(snap: SyncSnapshot, renumber: Map<number, number>): SyncSnapshot {
	if (renumber.size === 0) return snap;
	const rekeyId = <T extends { id: string }>(row: T, key: string) => ({ ...row, id: key });
	return {
		...snap,
		bookmarks: renumberOyo(snap.bookmarks, renumber, rekeyId) ?? [],
		progress: renumberOyo(snap.progress, renumber, rekeyId) ?? [],
		verseRatings: renumberOyo(snap.verseRatings, renumber, rekeyId) ?? [],
		verseMarks: renumberOyo(snap.verseMarks, renumber, rekeyId),
		// A check keeps its own id — it names the check, not the verse — and
		// only the verse it points at moves.
		checkHistory: renumberOyo(snap.checkHistory, renumber, (c, key) => ({ ...c, verseKey: key }))
	};
}

function withVerseCount(pkg: PackageMeta | null, count: number): PackageMeta | null {
	return pkg && { ...pkg, verse_number: count };
}

/** ISO-8601 sorts correctly in plain lexicographic order. */
function laterOf(a: string, b: string): string {
	return a > b ? a : b;
}

export function mergeSnapshots(local: SyncSnapshot, remote: SyncSnapshot): SyncSnapshot {
	// Whichever snapshot was written later wins the few things that have no
	// per-record version of their own.
	const newer = (local.lastModifiedAt ?? '') >= (remote.lastModifiedAt ?? '') ? local : remote;
	const newerIsLocal = newer === local;

	// OYO numbers are reconciled before anything else is merged: a verse the
	// older side had to move takes its bookmark, progress and history with it,
	// and the per-record merges below must see those under the new number.
	const oyo = reconcileOyoVerses(
		newer.oyo?.verses ?? [],
		(newerIsLocal ? remote : local).oyo?.verses ?? []
	);
	const older = followRenumber(newerIsLocal ? remote : local, oyo.renumber);
	if (newerIsLocal) remote = older;
	else local = older;

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
			// snapshot's wins, falling back to whichever side has one at all —
			// except its count, which has to describe the merged verses rather
			// than either device's own.
			package: withVerseCount(newer.oyo?.package ?? older.oyo?.package ?? null, oyo.verses.length),
			verses: oyo.verses
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
		// The reader's own 암송 DAYs. Union by id, with the later snapshot's
		// copy winning a DAY both devices edited — the stamp on the row is
		// what makes that comparable at all.
		events: unionById(older.events, newer.events, (e) => e.id),

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
