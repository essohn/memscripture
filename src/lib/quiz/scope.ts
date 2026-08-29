import { db } from '$lib/db/local';
import { buildEventCards } from '$lib/db/events';
import { isPackageInstalled, listPackages, listVerses } from '$lib/db/verses';
import type { ItemRating, QuizItem } from './session';
import type { DifficultyLevel } from '$lib/db/verseRatings';
import { isRecallableAttempt } from './games';
import { listRecentChecks } from '$lib/db/checkHistory';
import { signalOf, type VerseSignal } from './priority';
import type { CheckRecord } from '$lib/db/local';

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
	// Installed means "has verses", which is what isPackageInstalled asks and
	// what resolveTarget will require anyway. listPackages returns the
	// registry, so without this the picker offers 대상 that resolve to nothing
	// — and preselects one.
	const installed: Target[] = [];
	for (const p of packages) {
		if (await isPackageInstalled(p.id)) installed.push({ kind: 'package', id: p.id, label: p.name });
	}
	return [...events, ...installed];
}

/**
 * What the picker should offer, given everything that resolved.
 *
 * Everything, with the 암송 DAYs first.
 *
 * They used to be the only thing offered whenever there was one, on the
 * grounds that a reader arriving from a DAY has already chosen their scope.
 * That is true of the reader who arrives that way and false of the library:
 * an active DAY covers a hundred and fifty verses out of eleven hundred, and
 * hiding the rest meant the quiz could only ever ask about this month's — with
 * every check recorded against the other nine hundred sitting there unusable.
 *
 * The DAY still leads, which is the part of the old reasoning that holds: it
 * is what the reader is most likely to want, and it is the first thing the
 * picker preselects.
 */
export function offerableTargets(targets: Target[]): Target[] {
	const events = targets.filter((t) => t.kind === 'event');
	const packages = targets.filter((t) => t.kind !== 'event');
	return [...events, ...packages];
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
 * A 대상's verses, their ratings, their priority signals, and their recorded
 * near-miss attempts — all keyed by `${packageId}:${verseNo}`.
 *
 * Reads verses with listVerses rather than loadPackageData: the latter calls
 * installPackage on a miss, and installing a package as a side effect of
 * listing quiz scopes is the fault the home screen was already fixed for. A
 * range whose package is absent is skipped, the way buildEventCards skips it.
 */
export async function resolveTarget(target: Target): Promise<{
	items: QuizItem[];
	ratings: Map<string, ItemRating>;
	signals: Map<string, VerseSignal>;
	attempts: Map<string, string>;
}> {
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

	// One scan serves both the ranking and 틀린 곳 찾기's questions. They used
	// to be two reads at two different times, each behind its own
	// stale-result guard, and the guard was where Phase B's critical defect
	// lived. Reading here also means the picker holds everything it needs as
	// plain props and does no I/O of its own.
	//
	// Caught rather than propagated: a failed verse read empties the scope
	// and the picker says so, but a failed history read must not — the verses
	// are fine and the reader can still quiz them, unranked. Left undefined
	// rather than defaulted to an empty Map: the loop below only has
	// something true to say about a verse's signal once the read actually
	// succeeded, so a failure must skip it rather than report every verse as
	// clean.
	const history = await listRecentChecks([...packageIds]).catch((e) => {
		console.warn('[quiz] history read failed; ranking falls back to id order', e);
		return undefined;
	});

	const signals = new Map<string, VerseSignal>();
	const attempts = new Map<string, string>();
	if (history) {
		for (const item of items) {
			// QuizItem.id and CheckRecord.verseKey are the same string by
			// construction — both are `${packageId}:${verseNo}`.
			const rows = history.get(item.id) ?? [];
			signals.set(item.id, signalOf(rows));
			const attempt = newestAttempt(rows);
			if (attempt !== undefined) attempts.set(item.id, attempt);
		}
	}

	return { items, ratings, signals, attempts };
}

/**
 * The sentence behind this verse's most recent near-miss attempt, if it has
 * one. `rows` is newest-first, as listRecentChecks returns it.
 *
 * Not simply the newest record's `typed` — that may well be a later clean
 * check, whose sentence is no question at all. A verse whose near miss was
 * recorded weeks ago is still worth asking about; the point is to hand back
 * the sentence the reader actually wrote, whenever they wrote it.
 *
 * The near-miss rule runs here rather than in recordCheck, which keeps every
 * attempt. Two consumers want different subsets of the same field — the
 * history sheet shows the reader any attempt back, including the flawless
 * recital and the one they gave up on — and a row dropped at write time is
 * gone for both.
 */
export function newestAttempt(
	rows: Pick<CheckRecord, 'typed' | 'accuracy'>[]
): string | undefined {
	for (const r of rows) {
		// Blank as well as absent: a reader who pressed 포기 without typing
		// leaves an empty string, and an empty sentence is not something to ask
		// what is wrong with.
		if (r.typed === undefined || r.typed.trim().length === 0) continue;
		if (!isRecallableAttempt(r.accuracy)) continue;
		return r.typed;
	}
	return undefined;
}
