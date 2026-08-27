import { db, type CheckRecord } from './local';
import type { DifficultyLevel } from './verseRatings';
import { touchDataModified } from './touchData';
import { isRecallableAttempt } from '$lib/quiz/games';

/** Entries kept per verse. Older ones are pruned as new checks land — this is
 *  a "how has it been going" glance, not an audit trail, and 900 verses times
 *  an unbounded log is not worth carrying in every sync snapshot. */
export const HISTORY_LIMIT = 10;

function verseKey(packageId: string, verseNo: number): string {
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
	const key = verseKey(packageId, verseNo);
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
		// Kept only for a near miss. Deciding here rather than at each call
		// site means the card's 점검 and the quiz's typing round cannot
		// disagree about which sentences are worth handing back later.
		// entry.typed already rode in on the ...entry spread above, so a
		// collapsed or perfect attempt needs an explicit undefined to push it
		// back out — an empty spread here would leave it in place.
		...(entry.typed !== undefined
			? { typed: isRecallableAttempt(entry.accuracy) ? entry.typed : undefined }
			: {})
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

/** Most recent first, capped at HISTORY_LIMIT. */
export async function listChecks(
	packageId: string,
	verseNo: number
): Promise<CheckRecord[]> {
	const rows = await db.checkHistory.where('verseKey').equals(verseKey(packageId, verseNo)).toArray();
	return rows.sort((a, b) => b.checkedAt - a.checkedAt).slice(0, HISTORY_LIMIT);
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
