import type { EventRange, MemEvent } from '$lib/types';
import { newUserEventId } from '$lib/db/userEvents';

/**
 * The shape the 암송 DAY form works in, and the rules for turning it into an
 * event.
 *
 * A range is stored as an explicit list of verse numbers, because that is what
 * the rest of the app reads. The form asks for two numbers instead: a DAY is
 * written down as "242구절 1~113", and making someone type a hundred and
 * thirteen numbers to say that would be the app's problem leaking out.
 */

export interface RangeDraft {
	packageId: string;
	from: number;
	to: number;
}

export interface EventDraft {
	id: string;
	title: string;
	/** 'YYYY-MM-DD', as the date input gives it. */
	dueAt: string;
	ranges: RangeDraft[];
}

/** A blank one, ready to be filled in. */
export function emptyDraft(packageId = '', today = ''): EventDraft {
	return {
		id: newUserEventId(),
		title: '',
		dueAt: today,
		ranges: [{ packageId, from: 1, to: 1 }]
	};
}

/** The verse numbers a from–to range covers, inclusive. Reversed input is
 *  read as the range the reader meant rather than as an empty one. */
export function rangeVerseNos(from: number, to: number): number[] {
	const lo = Math.max(1, Math.floor(Math.min(from, to)));
	const hi = Math.floor(Math.max(from, to));
	if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return [];
	return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/**
 * What is wrong with this draft, in the reader's words.
 *
 * A list rather than the first problem: a form that reveals its objections one
 * at a time makes the reader submit three times to learn three things.
 */
export function draftProblems(draft: EventDraft): string[] {
	const problems: string[] = [];
	if (draft.title.trim().length === 0) problems.push('제목을 입력해주세요.');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dueAt)) problems.push('마감일을 골라주세요.');
	const usable = draft.ranges.filter((r) => r.packageId && rangeVerseNos(r.from, r.to).length > 0);
	if (usable.length === 0) problems.push('구절 범위를 하나 이상 정해주세요.');
	return problems;
}

/** Whether the draft is ready to save. */
export function isDraftReady(draft: EventDraft): boolean {
	return draftProblems(draft).length === 0;
}

/** How many verses the draft covers, counting a verse once however many
 *  ranges name it. */
export function draftVerseCount(draft: EventDraft): number {
	const seen = new Set<string>();
	for (const r of draft.ranges) {
		if (!r.packageId) continue;
		for (const no of rangeVerseNos(r.from, r.to)) seen.add(`${r.packageId}:${no}`);
	}
	return seen.size;
}

/** The event this draft describes. Ranges with no package or no verses are
 *  dropped rather than saved empty — an empty range is a row the reader
 *  started and left, not a thing they meant. */
export function draftToEvent(draft: EventDraft): MemEvent {
	const ranges: EventRange[] = [];
	for (const r of draft.ranges) {
		const verseNos = rangeVerseNos(r.from, r.to);
		if (!r.packageId || verseNos.length === 0) continue;
		ranges.push({ packageId: r.packageId, verseNos });
	}
	return { id: draft.id, title: draft.title.trim(), dueAt: draft.dueAt, ranges };
}

/**
 * The draft behind an event, for editing it.
 *
 * A range comes back as its lowest and highest number. Every range this form
 * writes is contiguous, so nothing is lost coming back through — a range with
 * gaps could only have come from the published events.json, and those are not
 * editable here.
 */
export function eventToDraft(event: MemEvent): EventDraft {
	return {
		id: event.id,
		title: event.title,
		dueAt: event.dueAt,
		ranges: event.ranges.map((r) => {
			const nos = r.verseNos ?? [];
			return {
				packageId: r.packageId,
				from: nos.length > 0 ? Math.min(...nos) : 1,
				to: nos.length > 0 ? Math.max(...nos) : 1
			};
		})
	};
}
