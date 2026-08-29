import type { QuizItem } from './session';

/** One 최근 card's worth of verses, in the shape recordRecentBundle takes. */
export interface QuizBundle {
	packageId: string;
	verseNos: number[];
}

/**
 * The verses a run got wrong, split into the bundles 최근 can store.
 *
 * One bundle per package rather than one for the run, because
 * recordRecentBundle takes a single packageId and an 암송 DAY can span
 * several. Filed as one, b_krv's verse numbers would be looked up inside
 * a_krv and the home screen would resolve the wrong verses — or, more often,
 * none, and drop the card silently.
 *
 * Packages come back in the order the run first met them, and each keeps the
 * order the run asked in. Neither survives storage — recordRecentBundle sorts
 * and de-duplicates the numbers itself — but a function whose output depends
 * on Map iteration luck is a worse function than one that does not.
 */
export function bundlesFromItems(items: Pick<QuizItem, 'packageId' | 'verseNo'>[]): QuizBundle[] {
	const byPackage = new Map<string, number[]>();
	for (const { packageId, verseNo } of items) {
		const nos = byPackage.get(packageId);
		if (nos) nos.push(verseNo);
		else byPackage.set(packageId, [verseNo]);
	}
	return [...byPackage].map(([packageId, verseNos]) => ({ packageId, verseNos }));
}
