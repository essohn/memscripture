import { db, type VerseRating } from './local';
import { touchDataModified } from './touchData';

export const DIFFICULTY_LEVELS = [0, 1, 2, 3, 4, 5] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

/** Human-readable label per level (0=hardest, 5=easiest), matching the
 *  user-facing picker copy. */
export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
	0: 'Impossible',
	1: 'xHard',
	2: 'Hard',
	3: 'Normal',
	4: 'Easy',
	5: 'xEasy'
};

/** Black, then a red → blue ramp of increasing easiness. Reuses the ribbon
 *  palette so the page only ships one set of color tokens. Shared by the
 *  interactive picker (DifficultyBadge) and the read-only list dot.
 *
 *  0 is the one colour outside the ramp, because it is outside the scale's
 *  ordinary range — and it carries a hairline ring wherever it is drawn: on
 *  the dark theme's card (#211d17) a black fill is barely 1.4:1 against its
 *  own background, so the shape has to come from the outline. The ring is
 *  --color-text-tertiary rather than --color-border, which is itself near
 *  black in dark mode and so drew an invisible line around an invisible
 *  bar. */
export const DIFFICULTY_COLORS: Record<DifficultyLevel, string> = {
	0: 'var(--color-ribbon-black)',
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
	return typeof v === 'number' && v >= 0 && v <= 5 && Number.isInteger(v);
}

export async function getVerseRating(
	packageId: string,
	verseNo: number
): Promise<VerseRating | null> {
	const row = await db.verseRatings.get(rowId(packageId, verseNo));
	return row ?? null;
}

// upsert is read-modify-write (get then put), so two calls fired back to
// back — as VerseCard does for start/full — can both read before either
// writes, and the second put clobbers the first. A module-level queue
// serializes every write so the second call always reads the first call's
// result. Same shape as viewOptions.ts's writeQueue, and for the same reason.
let writeQueue: Promise<unknown> = Promise.resolve();

async function upsert(
	packageId: string,
	verseNo: number,
	patch: Partial<Pick<VerseRating, 'startDifficulty' | 'fullDifficulty'>>
): Promise<void> {
	const id = rowId(packageId, verseNo);
	const next = writeQueue.then(async () => {
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
	});
	// Don't let a single failure poison the queue
	writeQueue = next.catch(() => {});
	return next;
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
