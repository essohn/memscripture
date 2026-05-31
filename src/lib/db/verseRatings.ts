import { db, type VerseRating } from './local';
import { touchDataModified } from './touchData';

export const DIFFICULTY_LEVELS = [1, 2, 3, 4, 5] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

/** Human-readable label per level (1=hardest, 5=easiest), matching the
 *  user-facing picker copy. */
export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
	1: 'xHard',
	2: 'Hard',
	3: 'Normal',
	4: 'Easy',
	5: 'xEasy'
};

/** Red → blue ramp, increasing easiness. Reuses the ribbon palette so the
 *  page only ships one set of color tokens. Shared by the interactive picker
 *  (DifficultyBadge) and the read-only list dot (DifficultyDot). */
export const DIFFICULTY_COLORS: Record<DifficultyLevel, string> = {
	1: 'var(--color-ribbon-red)',
	2: 'var(--color-ribbon-amber)',
	3: 'var(--color-text-tertiary)',
	4: 'var(--color-ribbon-green)',
	5: 'var(--color-ribbon-blue)'
};

function rowId(packageId: string, verseNo: number): string {
	return `${packageId}:${verseNo}`;
}

function isLevel(v: unknown): v is DifficultyLevel {
	return typeof v === 'number' && v >= 1 && v <= 5 && Number.isInteger(v);
}

export async function getVerseRating(
	packageId: string,
	verseNo: number
): Promise<VerseRating | null> {
	const row = await db.verseRatings.get(rowId(packageId, verseNo));
	return row ?? null;
}

async function upsert(
	packageId: string,
	verseNo: number,
	patch: Partial<Pick<VerseRating, 'startDifficulty' | 'fullDifficulty'>>
): Promise<void> {
	const id = rowId(packageId, verseNo);
	const existing = await db.verseRatings.get(id);
	const merged: VerseRating = {
		id,
		packageId,
		verseNo,
		startDifficulty: existing?.startDifficulty ?? null,
		fullDifficulty: existing?.fullDifficulty ?? null,
		...patch,
		updatedAt: Date.now()
	};
	await db.verseRatings.put(merged);
	await touchDataModified();
}

export async function setStartDifficulty(
	packageId: string,
	verseNo: number,
	level: DifficultyLevel | null
): Promise<void> {
	if (level !== null && !isLevel(level)) return;
	await upsert(packageId, verseNo, { startDifficulty: level });
}

export async function setFullDifficulty(
	packageId: string,
	verseNo: number,
	level: DifficultyLevel | null
): Promise<void> {
	if (level !== null && !isLevel(level)) return;
	await upsert(packageId, verseNo, { fullDifficulty: level });
}
