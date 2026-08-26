import { db } from '$lib/db/local';
import { buildEventCards } from '$lib/db/events';
import { isPackageInstalled, listPackages, listVerses } from '$lib/db/verses';
import type { ItemRating, QuizItem } from './session';
import type { DifficultyLevel } from '$lib/db/verseRatings';

/** Something the reader can quiz themselves on. */
export type Target =
	| {
			kind: 'event';
			id: string;
			label: string;
			ranges: { packageId: string; verseNos: number[] }[];
	  }
	| { kind: 'package'; id: string; label: string };

/** The 대상 the picker offers: active 암송 DAYs first, then installed packages. */
export async function listTargets(today: string): Promise<Target[]> {
	const cards = await buildEventCards(today).catch(() => []);
	const events: Target[] = cards.map((c) => ({
		kind: 'event',
		id: c.eventId,
		label: c.eventTitle,
		ranges: c.ranges.map((r) => ({ packageId: r.packageId, verseNos: r.verseNos }))
	}));
	const packages = await listPackages().catch(() => []);
	return [...events, ...packages.map((p) => ({ kind: 'package' as const, id: p.id, label: p.name }))];
}

function toItem(v: { package_id: string; no: number; title: string; cite: string; w: string }): QuizItem {
	return {
		id: `${v.package_id}:${v.no}`,
		packageId: v.package_id,
		verseNo: v.no,
		title: v.title,
		cite: v.cite,
		w: v.w
	};
}

/**
 * A 대상's verses and their ratings, both keyed by `${packageId}:${verseNo}`.
 *
 * Reads verses with listVerses rather than loadPackageData: the latter calls
 * installPackage on a miss, and installing a package as a side effect of
 * listing quiz scopes is the fault the home screen was already fixed for. A
 * range whose package is absent is skipped, the way buildEventCards skips it.
 */
export async function resolveTarget(
	target: Target
): Promise<{ items: QuizItem[]; ratings: Map<string, ItemRating> }> {
	const items: QuizItem[] = [];
	const packageIds = new Set<string>();

	if (target.kind === 'package') {
		if (await isPackageInstalled(target.id)) {
			packageIds.add(target.id);
			for (const v of await listVerses(target.id)) items.push(toItem(v));
		}
	} else {
		for (const range of target.ranges) {
			if (!(await isPackageInstalled(range.packageId))) continue;
			packageIds.add(range.packageId);
			const verses = await listVerses(range.packageId);
			const byNo = new Map(verses.map((v) => [v.no, v]));
			// The range's own order, not the package's — an 암송 DAY is known by
			// the order it was written in.
			for (const no of range.verseNos) {
				const v = byNo.get(no);
				if (v) items.push(toItem(v));
			}
		}
	}

	const ratings = new Map<string, ItemRating>();
	for (const packageId of packageIds) {
		const rows = await db.verseRatings.where('packageId').equals(packageId).toArray();
		for (const r of rows) {
			ratings.set(`${r.packageId}:${r.verseNo}`, {
				start: (r.startDifficulty ?? null) as DifficultyLevel | null,
				full: (r.fullDifficulty ?? null) as DifficultyLevel | null
			});
		}
	}

	return { items, ratings };
}
