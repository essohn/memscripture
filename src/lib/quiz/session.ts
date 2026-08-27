import type { DifficultyLevel } from '$lib/db/verseRatings';
import { hardestLevel } from '$lib/verses/difficultySort';
import { SESSION_SIZE, priorityOf, type VerseSignal } from './priority';

/** A difficulty chip. 1–5 is a rated tier; null is 미평가. */
export type Tier = DifficultyLevel | null;

/** One verse as the quiz asks it. */
export interface QuizItem {
	/** `${packageId}:${verseNo}` — the composite key every table here uses,
	 *  because one 암송 DAY can span packages and verse numbers repeat. */
	id: string;
	packageId: string;
	verseNo: number;
	title: string;
	cite: string;
	/** The verse body, which is what the reader has to produce. */
	w: string;
}

/** What one round produced. */
export interface RoundResult {
	/** QuizItem.id, never a bare verse number. */
	id: string;
	passed: boolean;
	accuracy: number;
	missed: number[];
	elapsedMs: number;
	/** What the reader typed, when this game produced a sentence worth
	 *  keeping. Only the typing round sets it; recordCheck decides whether it
	 *  is kept, so no round needs to know the threshold. */
	typed?: string;
}

/** The rating shape hardestLevel takes — the display-side one from
 *  verses/difficultySort, not the VerseRating row in db/local. */
export type ItemRating = { start: DifficultyLevel | null; full: DifficultyLevel | null };

/**
 * The scope narrowed to the chosen 난이도 그룹, unranked and uncapped.
 *
 * The order is whatever the scope produced — for an 암송 DAY, the order its
 * ranges are written in. buildQueue replaces that order; this function does
 * not, because two callers want the unranked set: the picker counts it to
 * say how large the chosen scope is, and 틀린 곳 찾기 counts how much of it
 * it has a question for.
 */
export function filterByTier(
	items: QuizItem[],
	tiers: Set<Tier>,
	ratings: Map<string, ItemRating>
): QuizItem[] {
	if (tiers.size === 0) return [];
	return items.filter((i) => tiers.has(hardestLevel(ratings.get(i.id)) as Tier));
}

/** A verse nothing is known about — never asked, never failed. */
const UNPROVEN: VerseSignal = { fails: 0 };

/**
 * Today's session: the verses that most want asking, capped at SESSION_SIZE.
 *
 * `eligible`, when given, is applied before the sort rather than after the
 * slice. 틀린 곳 찾기 can only ask about verses it has a recorded attempt
 * for, and the highest-priority ten are quite likely to be ten the reader has
 * never quizzed — filtering afterwards would open a session with no rounds at
 * all.
 *
 * Ties break by id, which is what lets a fresh scope advance: every verse in
 * an untouched package scores the same, so the first session takes the first
 * ten — and having been asked, those ten drop to the bottom and the next
 * session takes the next ten. Being asked is itself the rotation, so no
 * shuffle or rotation hash is needed.
 */
export function buildQueue(
	pool: QuizItem[],
	opts: { signals: Map<string, VerseSignal>; now: number; eligible?: Set<string> }
): QuizItem[] {
	const { signals, now, eligible } = opts;
	return pool
		.filter((i) => eligible === undefined || eligible.has(i.id))
		.map((item) => ({ item, score: priorityOf(signals.get(item.id) ?? UNPROVEN, now) }))
		.sort((a, b) => b.score - a.score || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0))
		.slice(0, SESSION_SIZE)
		.map((x) => x.item);
}

/** What the end screen reports. */
export function summarize(results: RoundResult[]): {
	passed: number;
	total: number;
	failed: string[];
} {
	return {
		passed: results.filter((r) => r.passed).length,
		total: results.length,
		failed: results.filter((r) => !r.passed).map((r) => r.id)
	};
}
