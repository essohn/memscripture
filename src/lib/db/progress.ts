import { db } from './local';
import type { VerseProgress } from '$lib/types';

const RATING_WINDOW = 10;

export function progressId(packageId: string, verseNo: number): string {
	return `${packageId}:${verseNo}`;
}

export async function getProgress(
	packageId: string,
	verseNo: number
): Promise<VerseProgress | undefined> {
	return db.progress.get(progressId(packageId, verseNo));
}

export async function upsertProgress(p: VerseProgress): Promise<void> {
	await db.progress.put(p);
}

export async function pushRating(
	packageId: string,
	verseNo: number,
	axis: 'cite' | 'recall',
	score: number
): Promise<void> {
	if (!Number.isInteger(score) || score < 1 || score > 4) {
		throw new Error(`pushRating: invalid score ${score} (expected integer 1-4)`);
	}
	const id = progressId(packageId, verseNo);
	await db.transaction('rw', db.progress, async () => {
		const existing = await db.progress.get(id);
		if (!existing) return;
		const key = axis === 'cite' ? 'citeRatings' : 'recallRatings';
		const next = [...existing[key], score].slice(-RATING_WINDOW);
		await db.progress.put({
			...existing,
			[key]: next,
			lastReviewedAt: Date.now()
		});
	});
}

export async function listProgressByPackage(packageId: string): Promise<VerseProgress[]> {
	return db.progress.where('packageId').equals(packageId).toArray();
}

export async function listProgressByBucket(
	bucket: VerseProgress['bucket']
): Promise<VerseProgress[]> {
	return db.progress.where('bucket').equals(bucket).toArray();
}
