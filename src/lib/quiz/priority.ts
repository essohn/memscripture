import type { CheckRecord } from '$lib/db/local';

/**
 * How many recent unassisted records the rule consults.
 *
 * The same number missStats.SUGGEST_WINDOW uses, and for the same reason:
 * five checks back is recent enough to still be true about this reader.
 */
export const PRIORITY_WINDOW = 5;

/** What one failure is worth, in days of neglect. */
export const FAIL_WEIGHT = 7;

/**
 * The most staleness alone may contribute.
 *
 * A month untouched and three months untouched are not different in any way
 * the reader would act on, and without a cap an ancient verse would outrank
 * one that fails every single time.
 */
export const STALE_CAP = 30;

/** How many verses one session asks about. */
export const SESSION_SIZE = 10;

const DAY_MS = 86_400_000;

/** What the rule needs to know about one verse. */
export interface VerseSignal {
	/** Failures among the recent unassisted records. */
	fails: number;
	/** When anything last asked about this verse. Absent if nothing ever has. */
	lastAskedAt?: number;
}

/**
 * Did this record pass?
 *
 * One test for all four sources, and deliberately a verdict rather than a
 * measurement. 점검 and 전체 타이핑 write a real proportion; 첫 단어 writes 1
 * for "started it" and 틀린 곳 찾기 writes 1 for "found it". Compared against
 * 1 each is exactly right — averaged together they are nonsense, because two
 * words typed correctly is not 98% of a verse.
 *
 * A 점검 at 0.98 is a failure here. That is the point: the reader got
 * something wrong, which is what 자주 틀린다 means.
 */
function passed(r: Pick<CheckRecord, 'accuracy'>): boolean {
	return r.accuracy >= 1;
}

/**
 * Did the reader lean on 힌트 for this one?
 *
 * Truthy, so both an absent field and a zero count as unassisted — the first
 * predates the hints feature and rejecting it would discard most of the
 * history, the second is a check where 힌트 was never pressed.
 */
function assisted(r: Pick<CheckRecord, 'hints'>): boolean {
	return Boolean(r.hints);
}

/**
 * Reduce one verse's records to the two numbers the score needs.
 *
 * Assisted records are dropped *before* the window is taken. Slicing first
 * would let a reader who checks a hard verse with hints five times flush
 * every real failure out of the window and watch their weakest verse sink to
 * the bottom — the same trap listPerfectVerseNos avoids by filtering before
 * it picks the latest.
 *
 * An assisted record is not evidence in either direction, so it neither
 * raises nor lowers the score. It does still set lastAskedAt: the reader put
 * the verse in front of themselves, whatever they leaned on to get through
 * it.
 *
 * Input order is not assumed. listRecentChecks hands these over newest-first,
 * but a caller that reads rows straight off an index gets them in index
 * order, and a rule that silently depends on the difference is a rule that
 * breaks when someone adds a second caller.
 */
export function signalOf(
	history: Pick<CheckRecord, 'accuracy' | 'hints' | 'checkedAt'>[]
): VerseSignal {
	let lastAskedAt: number | undefined;
	for (const r of history) {
		if (lastAskedAt === undefined || r.checkedAt > lastAskedAt) lastAskedAt = r.checkedAt;
	}

	const window = history
		.filter((r) => !assisted(r))
		.sort((a, b) => b.checkedAt - a.checkedAt)
		.slice(0, PRIORITY_WINDOW);

	return { fails: window.filter((r) => !passed(r)).length, lastAskedAt };
}

/**
 * How badly this verse wants to be asked about. Higher goes first.
 *
 * Two signals because the reader asked for two things. Failures answer
 * 자주 틀리는 구절의 우선순위를 높여서; staleness answers 계속 체크대상이
 * 되도록 — without it a verse passed twice would never come back at all.
 *
 * `now` is a parameter rather than a Date.now() inside, so that every verse
 * in one session is ranked against one instant and the tests are not
 * clock-dependent.
 */
export function priorityOf(signal: VerseSignal, now: number): number {
	const stale =
		signal.lastAskedAt === undefined
			? STALE_CAP
			: // Clamped at zero: a record stamped ahead of the clock — a device
				// whose time was wrong, a row that synced from one — must not
				// subtract from a score built on failures it knows nothing about.
				Math.min(Math.max(0, Math.floor((now - signal.lastAskedAt) / DAY_MS)), STALE_CAP);

	return signal.fails * FAIL_WEIGHT + stale;
}
