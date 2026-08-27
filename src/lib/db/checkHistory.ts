import { db, type CheckDeletion, type CheckRecord } from './local';
import type { DifficultyLevel } from './verseRatings';
import { touchDataModified } from './touchData';

/** Entries kept per verse. Older ones are pruned as new checks land — this is
 *  a "how has it been going" glance, not an audit trail, and 900 verses times
 *  an unbounded log is not worth carrying in every sync snapshot. */
export const HISTORY_LIMIT = 10;

/** Characters of the attempt kept. Generous next to any real verse, so an
 *  honest attempt is never clipped — it exists so that one pathological paste
 *  cannot inflate a table that rides along in every Drive snapshot. */
export const TYPED_LIMIT = 1000;

/** The key a check is filed under. Exported because the callers that hand a
 *  card its last-checked time hold a package id and a verse number, and five
 *  routes writing `${a}:${b}` by hand is five chances to write it differently. */
export function verseKeyOf(packageId: string, verseNo: number): string {
	return `${packageId}:${verseNo}`;
}

/**
 * Records one completed check.
 *
 * Only called once a result is actually written, so a cancelled attempt
 * leaves nothing behind — the history should read as "times I finished a
 * check", not "times I opened the panel".
 */
export async function recordCheck(
	packageId: string,
	verseNo: number,
	entry: {
		start: DifficultyLevel | null;
		full: DifficultyLevel | null;
		accuracy: number;
		elapsedMs: number;
		hints?: number;
		missed?: number[];
		source?: 'quiz' | 'quiz-opening' | 'quiz-spot';
		typed?: string;
	},
	checkedAt: number = Date.now()
): Promise<void> {
	const key = verseKeyOf(packageId, verseNo);
	await db.checkHistory.put({
		// Two checks of the same verse in the same millisecond would collide on
		// a timestamp alone; the counter keeps them distinct without needing a
		// random id that would differ across synced devices.
		id: `${key}:${checkedAt}:${await nextSuffix(key, checkedAt)}`,
		verseKey: key,
		packageId,
		verseNo,
		checkedAt,
		...entry,
		// Copied, not passed through. A caller may hand us a reactive array —
		// the quiz's round holds its verdict in $state — and IndexedDB's
		// structured clone cannot clone a Proxy, so the write rejects and the
		// round is lost silently. Spreading undefined must stay undefined:
		// absent means the record predates this field, which is not the same
		// as missing nothing.
		...(entry.missed ? { missed: [...entry.missed] } : {}),
		// Every attempt is kept, and the question of which ones are useful is
		// asked where they are read. This used to drop anything outside
		// isRecallableAttempt's near-miss band, which was right while 틀린 곳
		// 찾기 was the only consumer — but the history sheet shows the reader
		// any attempt back, and the two attempts it most wants are exactly the
		// two that rule discards: the flawless recital, and the one they gave
		// up on. A row dropped at write time is gone for both. loadAttempts
		// applies the game's rule when it picks questions.
		//
		// Tested for undefined rather than for truth: '' is a reader who saved
		// having typed nothing, which the sheet reports differently from a check
		// that predates this field. A truthiness guard would erase that.
		...(entry.typed !== undefined ? { typed: entry.typed.slice(0, TYPED_LIMIT) } : {})
	});
	await prune(key);
	await touchDataModified();
}

async function nextSuffix(key: string, checkedAt: number): Promise<number> {
	const clash = await db.checkHistory
		.where('verseKey')
		.equals(key)
		.filter((r) => r.checkedAt === checkedAt)
		.count();
	return clash;
}

/**
 * Keeps the table bounded without letting a non-recall row evict evidence
 * nothing can replace.
 *
 * Before quiz-opening and quiz-spot existed, every row in the budget counted
 * for something, so "keep the newest HISTORY_LIMIT" was the whole rule. Now
 * an opening or spot round can be replayed ten times over on a one-verse
 * scope (다시 하기 replays the same queue), and by recency alone those rounds
 * would push out the 점검 or quiz row that holds the 만점 배지, the `missed`
 * positions the underline suggestions read, and the `typed` sentence 틀린 곳
 * 찾기 exists to hand back — none of which a non-recall row can replace.
 *
 * So recall-bearing rows are kept first, up to the limit, and non-recall rows
 * fill only what is left over. A non-recall row can therefore never evict a
 * recall-bearing one; two recall rows can still evict each other by age, same
 * as before.
 */
async function prune(key: string): Promise<void> {
	const rows = await db.checkHistory.where('verseKey').equals(key).toArray();
	if (rows.length <= HISTORY_LIMIT) return;

	const byRecency = (a: CheckRecord, b: CheckRecord) => b.checkedAt - a.checkedAt;
	const recall = rows.filter(countsAsRecall).sort(byRecency);
	const nonRecall = rows.filter((r) => !countsAsRecall(r)).sort(byRecency);

	const keptRecall = recall.slice(0, HISTORY_LIMIT);
	const keptNonRecall = nonRecall.slice(0, HISTORY_LIMIT - keptRecall.length);
	const kept = new Set([...keptRecall, ...keptNonRecall].map((r) => r.id));

	const doomed = rows.filter((r) => !kept.has(r.id)).map((r) => r.id);
	await db.checkHistory.bulkDelete(doomed);
}

/**
 * Removes one check at the reader's request.
 *
 * A record they did not mean to keep — a stray tap that opened the panel, a
 * run made to try something out — is theirs to drop, and nothing else about
 * the verse moves with it: the difficulty badges are rows they own separately.
 * What does move is everything derived from the history, which is the point —
 * the 만점 badge and 최근 점검 go back to saying what the remaining checks say.
 *
 * The tombstone is not bookkeeping. checkHistory merges by union, so a device
 * that still holds this row would hand it back on the next Drive sync; the
 * tombstone is what mergeSnapshots subtracts to stop that.
 *
 * Silent about an id that is already gone: undo, a second tap, and a sync that
 * removed it first all arrive here, and none of them is an error.
 */
export async function deleteCheck(id: string, deletedAt: number = Date.now()): Promise<void> {
	await db.checkHistory.delete(id);
	await db.checkDeletions.put({ id, deletedAt });
	await touchDataModified();
}

/**
 * Puts a deleted check back, tombstone and all.
 *
 * Lifting the tombstone is the half that is easy to forget: leaving it behind
 * would let the next sync delete the row the reader just restored, which is
 * the same bug the tombstone exists to fix, pointed the other way.
 */
export async function restoreCheck(record: CheckRecord): Promise<void> {
	// Copied, not passed through, for the reason recordCheck copies `missed`:
	// the undo hands back a row the card is holding in $state, and IndexedDB's
	// structured clone cannot clone a Proxy — the write rejects, the caller
	// swallows it the way every history write is swallowed, and the record the
	// reader asked for is quietly gone for good. The nested array needs its own
	// copy; spreading the row only unwraps the top level.
	await db.checkHistory.put({
		...record,
		...(record.missed ? { missed: [...record.missed] } : {})
	});
	await db.checkDeletions.delete(record.id);
	await touchDataModified();
}

/** Every tombstone, for the sync snapshot to carry. */
export async function listCheckDeletions(): Promise<CheckDeletion[]> {
	return db.checkDeletions.toArray();
}

/** Most recent first, capped at HISTORY_LIMIT. */
export async function listChecks(
	packageId: string,
	verseNo: number
): Promise<CheckRecord[]> {
	const rows = await db.checkHistory
		.where('verseKey')
		.equals(verseKeyOf(packageId, verseNo))
		.toArray();
	return rows.sort((a, b) => b.checkedAt - a.checkedAt).slice(0, HISTORY_LIMIT);
}

/**
 * Recent records for a whole set of packages at once, keyed by verseKey and
 * newest first.
 *
 * One range scan per package rather than a query per verse, the same shape
 * listLastCheckedAt and listPerfectVerseNos use: a 900-verse package would
 * otherwise issue 900 round-trips to rank a queue of ten.
 *
 * Capped per verse at HISTORY_LIMIT, matching listChecks — prune already
 * bounds what is stored, so this cap is a promise about the return type
 * rather than a filter that usually does anything.
 *
 * No judgement here beyond recency: which records count as evidence is the
 * priority rule's business, and mixing the two would put the definition of a
 * failure inside a database read.
 */
export async function listRecentChecks(
	packageIds: string[]
): Promise<Map<string, CheckRecord[]>> {
	const out = new Map<string, CheckRecord[]>();

	for (const packageId of new Set(packageIds)) {
		const rows = await db.checkHistory.where('verseKey').startsWith(`${packageId}:`).toArray();
		for (const r of rows) {
			const list = out.get(r.verseKey);
			if (list) list.push(r);
			else out.set(r.verseKey, [r]);
		}
	}

	for (const list of out.values()) {
		// Rows arrive in index order, not chronological order.
		list.sort((a, b) => b.checkedAt - a.checkedAt);
		if (list.length > HISTORY_LIMIT) list.length = HISTORY_LIMIT;
	}

	return out;
}

/**
 * Does this record say something about recall?
 *
 * 점검 and the quiz's full typing round do: the reader produced the verse
 * from memory. The opening game proves only that they can start it, and the
 * spot game proves they can recognise a mistake — neither is evidence that
 * the verse was recited, so neither may move the underline suggestions or the
 * 만점 badge.
 */
export function countsAsRecall(r: Pick<CheckRecord, 'source'>): boolean {
	return r.source === undefined || r.source === 'quiz';
}

/**
 * When each verse was last 점검'd, keyed by verseKey.
 *
 * One scan for a whole list rather than a query per card: a 900-verse package
 * would otherwise issue 900 round-trips for a line most cards do not even
 * show. The same reason 점검 history itself loads lazily, and the same shape
 * listPerfectVerseNos uses.
 *
 * Stricter than countsAsRecall, deliberately: that asks whether a row is
 * evidence of recall, and a full quiz round is. This asks what the card's line
 * may report, and the line says 최근 점검 and opens a sheet built around a
 * difficulty no quiz round carries — so any `source` at all disqualifies a row
 * here, including 'quiz'.
 *
 * `packageId` is optional because 북마크 and 통계 list verses from several
 * packages at once. Given one, the scan rides the verseKey index, which is
 * prefixed by the package id.
 */
export async function listLastCheckedAt(packageId?: string): Promise<Map<string, number>> {
	const rows = packageId
		? await db.checkHistory.where('verseKey').startsWith(`${packageId}:`).toArray()
		: await db.checkHistory.toArray();

	const latest = new Map<string, number>();
	for (const r of rows) {
		if (r.source) continue;
		// Rows arrive in index order, not chronological order, so the newest has
		// to be chosen by comparison rather than by whichever landed last.
		const seen = latest.get(r.verseKey);
		if (seen === undefined || r.checkedAt > seen) latest.set(r.verseKey, r.checkedAt);
	}
	return latest;
}

/**
 * Verse numbers in a package that have ever been recited flawlessly.
 *
 * Read from the history rather than stored as a flag on the verse: the record
 * of a perfect check already exists, and a second copy could disagree with it.
 * The most recent check decides, so a later slip does take the badge back —
 * it says "this verse is solid right now", not "I have ever done this".
 *
 * One range scan on the verseKey index, which is prefixed by the package id,
 * rather than a query per verse.
 */
export async function listPerfectVerseNos(packageId: string): Promise<Set<number>> {
	const rows = await db.checkHistory.where('verseKey').startsWith(`${packageId}:`).toArray();

	// The most recent check decides, not the best one ever recorded. The badge
	// says "this verse is solid right now"; a verse recited perfectly in May
	// and fumbled this morning is not, and leaving the popper on it would be
	// the card telling the reader something they just disproved.
	const latest = new Map<number, { checkedAt: number; accuracy: number }>();
	for (const r of rows) {
		if (!countsAsRecall(r)) continue;
		const seen = latest.get(r.verseNo);
		if (!seen || r.checkedAt > seen.checkedAt) latest.set(r.verseNo, r);
	}

	const out = new Set<number>();
	for (const [verseNo, r] of latest) if (r.accuracy >= 1) out.add(verseNo);
	return out;
}
