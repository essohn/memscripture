import type { DifficultyLevel } from '$lib/db/verseRatings';
import { PASS_GRACE_MS, SESSION_SIZE, priorityOf, type VerseSignal } from './priority';

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
	/** The arcade's own currency, totalled by the summary.
	 *
	 *  Deliberately separate from `passed` and `accuracy`, which are what the
	 *  check history reads: a round can be worth nothing and still be a pass,
	 *  and nothing about a score may reach the difficulty ratings. Absent from
	 *  a round that does not score. */
	points?: number;
	/** The round was answered inside its own clock. Feeds the chain and
	 *  nothing else — a late answer is graded exactly like a prompt one, and
	 *  a timer that could mark a verse wrong would put pressure into a record
	 *  the difficulty ratings read. */
	inTime?: boolean;
	/**
	 * This round is evidence the verse is harder than its rating says.
	 *
	 * Reported by the round rather than inferred from `passed`, because what
	 * counts as evidence differs by game. 시작 단어 맞추기 has no wrong answer
	 * to give — the reader produces the opening or gives up — so a slow one
	 * counts there and nowhere else.
	 */
	harder?: boolean;
}

/** The rating shape sortByDifficulty takes — the display-side VerseRating from
 *  verses/difficultySort, not the VerseRating row in db/local. */
export type ItemRating = { start: DifficultyLevel | null; full: DifficultyLevel | null };

/**
 * The scope narrowed to the chosen 난이도 그룹s, unranked and uncapped.
 *
 * Two independent filters, not one: 시작 난이도 and 전체 난이도 are rated
 * separately and a verse can be brutal to begin and easy once running. They
 * intersect — a verse has to clear both rows — which is what makes each row
 * mean its own dimension. Under a union, turning a chip *on* could only ever
 * widen the result, and the second row could never narrow the first.
 *
 * A row with every chip on therefore reads as "this dimension does not
 * constrain", and an empty row as "nothing qualifies" — which falls out of
 * `has` without a special case.
 *
 * The order is whatever the scope produced — for an 암송 DAY, the order its
 * ranges are written in. buildQueue replaces that order; this function does
 * not, because two callers want the unranked set: the picker counts it to
 * say how large the chosen scope is, and 자주 틀리는 곳 찾기 counts how much
 * of it it has a question for.
 */
export function filterByTier(
	items: QuizItem[],
	startTiers: Set<Tier>,
	fullTiers: Set<Tier>,
	ratings: Map<string, ItemRating>
): QuizItem[] {
	return items.filter((i) => {
		const r = ratings.get(i.id);
		return startTiers.has(r?.start ?? null) && fullTiers.has(r?.full ?? null);
	});
}

/** A verse nothing is known about — never asked, never failed. */
const UNPROVEN: VerseSignal = { fails: 0 };

/** How the session decides which of the scope's verses it asks about. */
export type QueueOrder = 'stale' | 'fails' | 'random';

/**
 * The 문항 수 chips, before a pool trims them.
 *
 * Round numbers rather than a slider's every integer: the difference between
 * 23 and 24 questions is not a decision anyone makes, and a strip of chips can
 * be read at a glance where a handle's position has to be measured.
 */
const SIZE_STEPS = [5, 10, 20, 30, 50, 100];

/**
 * What the 문항 수 strip offers for a scope of this size.
 *
 * Always ends on the pool itself — 전체 — and never offers a step the pool
 * cannot fill, because a chip that hands back the same session as the one
 * beside it is a chip the reader cannot tell they pressed.
 */
export function sessionSizeChoices(poolSize: number): number[] {
	if (poolSize <= 0) return [];
	return [...SIZE_STEPS.filter((n) => n < poolSize), poolSize];
}

/**
 * One draw per verse, used to break ties.
 *
 * Ties used to break by id, on the reasoning that a fresh scope would then
 * take its first ten, sink them, and take the next ten next time — the walk
 * being its own rotation. The walk works; the order it walks in was the
 * problem. On a library nothing has been checked in *every* verse ties, so
 * the id tie-break was the entire ranking, and the reader got the same
 * alphabetical ten opening on the same verse every single session.
 *
 * Drawing instead keeps the rotation — a verse still sinks the moment it is
 * asked about, so the pool of never-asked verses still empties — and takes
 * the alphabet out of it. Ranked *after* the real key, so this only ever
 * decides between verses the rule itself cannot separate.
 */
function drawFor(items: QuizItem[], rng: () => number): Map<string, number> {
	return new Map(items.map((i) => [i.id, rng()]));
}

/**
 * When this verse should be treated as last seen.
 *
 * Not simply lastAskedAt: a pass buys the verse PASS_GRACE_MS of quiet, so a
 * verse the reader keeps getting right reads as more recently checked than it
 * was and sinks accordingly. Undefined stays undefined — never checked is the
 * front of the queue, and a pass cannot be subtracted from evidence that does
 * not exist.
 */
function seenAt(signal: VerseSignal | undefined): number {
	if (signal?.lastAskedAt === undefined) return -Infinity;
	return signal.lastAskedAt + (signal.passes ?? 0) * PASS_GRACE_MS;
}

/**
 * Fisher–Yates, through an injected rng.
 *
 * `rng` is a parameter for the same reason `now` is: a shuffle that reached
 * for Math.random itself could only be tested by running it many times and
 * asserting about the distribution, which is a slow test that fails
 * occasionally for no reason.
 */
function shuffled(items: QuizItem[], rng: () => number): QuizItem[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/**
 * Today's session: `size` verses drawn from the scope in the chosen order.
 *
 * Three orders, because the reader is not always asking the same question.
 *
 * - `stale` — least recently checked first, never-checked ahead of everything.
 *   The default, and the one that walks a library end to end: a verse sinks
 *   the moment it is asked about, so the next session takes the next ones.
 *   Sorted on the real timestamp rather than through priorityOf, whose
 *   STALE_CAP flattens everything past a month into one score — under the cap
 *   a verse untouched for four months ties with one untouched for six weeks
 *   and the id tie-break decides, which is not an ordering by age at all.
 * - `fails` — the weighted score: failures first, staleness second. What this
 *   screen used to do unconditionally.
 * - `random` — a straight draw from the scope, ignoring both signals.
 *
 * `eligible`, when given, is applied before the ordering rather than after the
 * slice. 틀린 곳 찾기 can only ask about verses it has a recorded attempt
 * for, and the highest-priority ten are quite likely to be ten the reader has
 * never quizzed — filtering afterwards would open a session with no rounds at
 * all.
 */
export function buildQueue(
	pool: QuizItem[],
	opts: {
		signals: Map<string, VerseSignal>;
		now: number;
		eligible?: Set<string>;
		order?: QueueOrder;
		size?: number;
		rng?: () => number;
	}
): QuizItem[] {
	const {
		signals,
		now,
		eligible,
		order = 'stale',
		size = SESSION_SIZE,
		rng = Math.random
	} = opts;

	const asked = pool.filter((i) => eligible === undefined || eligible.has(i.id));

	if (order === 'random') return shuffled(asked, rng).slice(0, size);

	const draw = drawFor(asked, rng);
	const tie = (a: QuizItem, b: QuizItem) => (draw.get(a.id) ?? 0) - (draw.get(b.id) ?? 0);

	if (order === 'fails') {
		return asked
			.map((item) => ({ item, score: priorityOf(signals.get(item.id) ?? UNPROVEN, now) }))
			.sort((a, b) => b.score - a.score || tie(a.item, b.item))
			.slice(0, size)
			.map((x) => x.item);
	}

	// Never checked sorts as infinitely old: the reader has no evidence about
	// it at all, which is the thing 오래된 순 exists to surface.
	return asked
		.map((item) => ({ item, at: seenAt(signals.get(item.id)) }))
		.sort((a, b) => a.at - b.at || tie(a.item, b.item))
		.slice(0, size)
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
