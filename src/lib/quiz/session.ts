import type { DifficultyLevel } from '$lib/db/verseRatings';
import { hardestLevel } from '$lib/verses/difficultySort';

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
}

/** The rating shape hardestLevel takes — the display-side one from
 *  verses/difficultySort, not the VerseRating row in db/local. */
export type ItemRating = { start: DifficultyLevel | null; full: DifficultyLevel | null };

/**
 * The verses a scope actually serves, in the order they will be asked.
 *
 * Phase A filters and nothing more. The order is whatever the scope produced —
 * for an 암송 DAY, the order its ranges are written in, which is the order the
 * reader knows the day by; imposing verse-number order would scramble a day
 * whose ranges span two packages.
 *
 * This function is the seam Phase C replaces: priority scheduling changes the
 * order here rather than spreading through the session, the picker and the
 * route.
 */
export function buildQueue(
	items: QuizItem[],
	tiers: Set<Tier>,
	ratings: Map<string, ItemRating>
): QuizItem[] {
	if (tiers.size === 0) return [];
	return items.filter((i) => tiers.has(hardestLevel(ratings.get(i.id)) as Tier));
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
