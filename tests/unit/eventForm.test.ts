import { describe, expect, it } from 'vitest';
import {
	draftProblems,
	draftToEvent,
	draftVerseCount,
	emptyDraft,
	eventToDraft,
	isDraftReady,
	rangeVerseNos,
	type EventDraft
} from '../../src/lib/events/form';

const draft = (over: Partial<EventDraft> = {}): EventDraft => ({
	id: 'my:x',
	title: '9월 암송 DAY',
	dueAt: '2026-09-30',
	ranges: [{ packageId: '242_krv', from: 1, to: 5 }],
	...over
});

describe('rangeVerseNos', () => {
	// "242구절 1~113" is how a DAY is written down. Making someone type a
	// hundred and thirteen numbers to say that would be the app's storage
	// leaking out into the form.
	it('fills in the numbers between', () => {
		expect(rangeVerseNos(3, 7)).toEqual([3, 4, 5, 6, 7]);
	});

	it('covers a single verse', () => {
		expect(rangeVerseNos(4, 4)).toEqual([4]);
	});

	// Typed the other way round is a range the reader meant, not an empty one.
	it('reads a reversed range as the one that was meant', () => {
		expect(rangeVerseNos(7, 3)).toEqual([3, 4, 5, 6, 7]);
	});

	// Verses are numbered from 1; there is no verse 0 to include.
	it('starts at the first verse however low it is asked to go', () => {
		expect(rangeVerseNos(-5, 2)).toEqual([1, 2]);
	});

	it('has nothing to say about a number that is not one', () => {
		expect(rangeVerseNos(Number.NaN, 3)).toEqual([]);
	});
});

describe('draftProblems', () => {
	it('is silent about a draft that is ready', () => {
		expect(draftProblems(draft())).toEqual([]);
		expect(isDraftReady(draft())).toBe(true);
	});

	// All of them at once: a form that reveals its objections one at a time
	// makes the reader submit three times to learn three things.
	it('names every problem at once', () => {
		const problems = draftProblems(
			draft({ title: '  ', dueAt: '', ranges: [{ packageId: '', from: 1, to: 3 }] })
		);
		expect(problems).toHaveLength(3);
	});

	it('wants a title', () => {
		expect(draftProblems(draft({ title: '   ' }))).toContain('제목을 입력해주세요.');
	});

	it('wants a real date', () => {
		expect(draftProblems(draft({ dueAt: '9월 30일' }))).toContain('마감일을 골라주세요.');
	});

	// A row the reader started and left is not a range.
	it('wants at least one range that covers something', () => {
		expect(draftProblems(draft({ ranges: [{ packageId: '', from: 1, to: 5 }] }))).toContain(
			'구절 범위를 하나 이상 정해주세요.'
		);
	});
});

describe('draftToEvent', () => {
	it('writes the range out as the verses it covers', () => {
		expect(draftToEvent(draft()).ranges).toEqual([
			{ packageId: '242_krv', verseNos: [1, 2, 3, 4, 5] }
		]);
	});

	it('trims the title', () => {
		expect(draftToEvent(draft({ title: '  9월  ' })).title).toBe('9월');
	});

	it('drops a row that was started and left', () => {
		const e = draftToEvent(
			draft({
				ranges: [
					{ packageId: '242_krv', from: 1, to: 2 },
					{ packageId: '', from: 1, to: 9 }
				]
			})
		);
		expect(e.ranges).toHaveLength(1);
	});
});

describe('draftVerseCount', () => {
	it('counts what the draft covers', () => {
		expect(draftVerseCount(draft())).toBe(5);
	});

	// Two ranges over the same verses are one DAY's worth of verses, not two.
	it('counts a verse once however many ranges name it', () => {
		expect(
			draftVerseCount(
				draft({
					ranges: [
						{ packageId: '242_krv', from: 1, to: 5 },
						{ packageId: '242_krv', from: 4, to: 8 }
					]
				})
			)
		).toBe(8);
	});

	// Two packages' verse 1 are different verses.
	it('keeps two packages apart', () => {
		expect(
			draftVerseCount(
				draft({
					ranges: [
						{ packageId: '242_krv', from: 1, to: 2 },
						{ packageId: '900_krv', from: 1, to: 2 }
					]
				})
			)
		).toBe(4);
	});
});

describe('eventToDraft', () => {
	// Every range this form writes is contiguous, so nothing is lost coming
	// back through it.
	it('round-trips a draft through an event', () => {
		const original = draft();
		expect(eventToDraft(draftToEvent(original))).toEqual(original);
	});

	it('survives a range with no verses at all', () => {
		expect(
			eventToDraft({ id: 'x', title: 't', dueAt: '2026-01-01', ranges: [{ packageId: 'a' }] })
				.ranges[0]
		).toEqual({ packageId: 'a', from: 1, to: 1 });
	});
});

describe('emptyDraft', () => {
	it('is not ready until it is filled in', () => {
		expect(isDraftReady(emptyDraft())).toBe(false);
	});

	// Two DAYs made in the same session must not share an id.
	it('gets its own id each time', () => {
		expect(emptyDraft().id).not.toBe(emptyDraft().id);
	});
});
