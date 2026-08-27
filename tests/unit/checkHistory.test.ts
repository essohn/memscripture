import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	HISTORY_LIMIT,
	countsAsRecall,
	listChecks,
	listPerfectVerseNos,
	recordCheck
} from '../../src/lib/db/checkHistory';
import { suggestedMarks } from '../../src/lib/memorize/missStats';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

const entry = (over = {}) => ({ start: 4, full: 5, accuracy: 1, elapsedMs: 30_000, ...over }) as never;

describe('checkHistory', () => {
	it('records a check and reads it back', async () => {
		await recordCheck('900_krv', 1, entry(), 1000);
		const rows = await listChecks('900_krv', 1);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ verseNo: 1, start: 4, full: 5, checkedAt: 1000 });
	});

	it('lists newest first', async () => {
		await recordCheck('900_krv', 1, entry(), 1000);
		await recordCheck('900_krv', 1, entry(), 3000);
		await recordCheck('900_krv', 1, entry(), 2000);
		expect((await listChecks('900_krv', 1)).map((r) => r.checkedAt)).toEqual([3000, 2000, 1000]);
	});

	// A glance at recent form, not an audit trail — 900 verses times an
	// unbounded log would ride along in every sync snapshot.
	it('keeps only the most recent entries', async () => {
		for (let i = 1; i <= HISTORY_LIMIT + 5; i++) await recordCheck('900_krv', 1, entry(), i * 1000);
		const rows = await listChecks('900_krv', 1);
		expect(rows).toHaveLength(HISTORY_LIMIT);
		expect(rows[rows.length - 1].checkedAt).toBe(6000);
	});

	it('keeps verses and packages apart', async () => {
		await recordCheck('900_krv', 1, entry(), 1000);
		await recordCheck('900_krv', 2, entry(), 1000);
		await recordCheck('242_krv', 1, entry(), 1000);
		expect(await listChecks('900_krv', 1)).toHaveLength(1);
		expect(await listChecks('242_krv', 1)).toHaveLength(1);
	});

	// Same verse, same millisecond: the id must still be unique or the second
	// check would silently overwrite the first.
	it('survives two checks in the same millisecond', async () => {
		await recordCheck('900_krv', 1, entry(), 1000);
		await recordCheck('900_krv', 1, entry({ full: 2 }), 1000);
		expect(await listChecks('900_krv', 1)).toHaveLength(2);
	});

	it('returns nothing for a verse never checked', async () => {
		expect(await listChecks('900_krv', 99)).toEqual([]);
	});

	it('keeps the missed word positions', async () => {
		await recordCheck('900_krv', 1, entry({ accuracy: 0.9, missed: [2, 5] }), 1000);
		expect((await listChecks('900_krv', 1))[0].missed).toEqual([2, 5]);
	});

	// The quiz's round holds its verdict in $state, so `missed` can arrive as a
	// reactive Proxy. IndexedDB cannot structured-clone one, and the write
	// rejects — silently, because the caller is mid-quiz and swallows it.
	it('stores a missed list that arrives as a proxy', async () => {
		const proxied = new Proxy([2, 5], {});
		await recordCheck('900_krv', 7, entry({ accuracy: 0.9, missed: proxied }), 1000);
		expect((await listChecks('900_krv', 7))[0].missed).toEqual([2, 5]);
	});

	// [] is evidence, not the absence of it — a clean check is what pushes an
	// older miss out of the suggestion window. Absent means the check predates
	// the feature and measured nothing at all, so the two must not collapse.
	it('distinguishes a clean check from one that measured nothing', async () => {
		await recordCheck('900_krv', 1, entry({ missed: [] }), 1000);
		await recordCheck('900_krv', 2, entry(), 1000);
		expect((await listChecks('900_krv', 1))[0].missed).toEqual([]);
		expect((await listChecks('900_krv', 2))[0].missed).toBeUndefined();
	});

	it('remembers that a round came from the quiz', async () => {
		await recordCheck('900_krv', 1, entry({ source: 'quiz' }), 1000);
		expect((await listChecks('900_krv', 1))[0].source).toBe('quiz');
	});

	// Absent is the app's primary act, not a missing value. Every record
	// written before this field existed was a 점검, so defaulting it would
	// have meant rewriting all of them to say what they already said.
	it('leaves a 점검 record with no source at all', async () => {
		await recordCheck('900_krv', 2, entry(), 1000);
		expect((await listChecks('900_krv', 2))[0].source).toBeUndefined();
	});

	// The underline suggestions treat a quiz round as evidence like any other:
	// it is a 점검 without the rating, so the words it got wrong count.
	it('counts a quiz round toward the underline suggestions', async () => {
		await recordCheck('900_krv', 3, entry({ accuracy: 0.9, missed: [2], source: 'quiz' }), 1000);
		await recordCheck('900_krv', 3, entry({ accuracy: 0.9, missed: [2], source: 'quiz' }), 2000);
		expect(suggestedMarks(await listChecks('900_krv', 3), 11)).toEqual(new Set([2]));
	});

	// Near-misses become future 틀린 곳 찾기 questions. The rule lives in
	// recordCheck so the card's check and the quiz's round cannot disagree
	// about what is worth keeping.
	it('keeps the sentence behind a near miss', async () => {
		await recordCheck('900_krv', 10, entry({ accuracy: 0.95, typed: '거의 맞은 문장' }), 1000);
		expect((await listChecks('900_krv', 10))[0].typed).toBe('거의 맞은 문장');
	});

	it('drops the sentence behind a collapse', async () => {
		await recordCheck('900_krv', 11, entry({ accuracy: 0.3, typed: '두 단어' }), 1000);
		expect((await listChecks('900_krv', 11))[0].typed).toBeUndefined();
	});

	// A perfect attempt has nothing wrong in it to find.
	it('drops the sentence behind a perfect attempt', async () => {
		await recordCheck('900_krv', 12, entry({ accuracy: 1, typed: '완벽한 문장' }), 1000);
		expect((await listChecks('900_krv', 12))[0].typed).toBeUndefined();
	});

	it('records which game produced a round', async () => {
		await recordCheck('900_krv', 13, entry({ source: 'quiz-opening' }), 1000);
		await recordCheck('900_krv', 14, entry({ source: 'quiz-spot' }), 1000);
		expect((await listChecks('900_krv', 13))[0].source).toBe('quiz-opening');
		expect((await listChecks('900_krv', 14))[0].source).toBe('quiz-spot');
	});
});

// 다시 하기 replays the same queue, so ten rounds of 첫 단어 or 틀린 곳 찾기 on a
// one-verse scope is ten taps. Before prune knew about source, that alone
// could push the sole 점검 or quiz row for that verse out of the budget —
// taking the 만점 배지, the missed positions, and the typed sentence with it,
// none of which can be reconstructed.
describe('prune protects recall-bearing rows from non-recall churn', () => {
	it('keeps the 점검 row, and the badge it earned, through ten opening rounds', async () => {
		await recordCheck('900_krv', 30, entry({ accuracy: 1 }), 1000);
		for (let i = 1; i <= HISTORY_LIMIT; i++) {
			await recordCheck('900_krv', 30, entry({ accuracy: 1, source: 'quiz-opening' }), 1000 + i * 1000);
		}
		const rows = await listChecks('900_krv', 30);
		expect(rows.length).toBeLessThanOrEqual(HISTORY_LIMIT);
		expect(rows.some((r) => r.checkedAt === 1000)).toBe(true);
		expect(await listPerfectVerseNos('900_krv')).toEqual(new Set([30]));
	});

	it('keeps the typed sentence 틀린 곳 찾기 hands back, through ten opening rounds', async () => {
		await recordCheck('900_krv', 31, entry({ accuracy: 0.95, typed: '거의 맞은 문장' }), 1000);
		for (let i = 1; i <= HISTORY_LIMIT; i++) {
			await recordCheck('900_krv', 31, entry({ accuracy: 1, source: 'quiz-opening' }), 1000 + i * 1000);
		}
		expect((await listChecks('900_krv', 31)).find((r) => r.checkedAt === 1000)?.typed).toBe(
			'거의 맞은 문장'
		);
	});

	it('keeps the missed positions the underline suggestions read, through ten opening rounds', async () => {
		await recordCheck('900_krv', 32, entry({ accuracy: 0.9, missed: [2] }), 1000);
		await recordCheck('900_krv', 32, entry({ accuracy: 0.9, missed: [2], source: 'quiz' }), 2000);
		for (let i = 1; i <= HISTORY_LIMIT; i++) {
			await recordCheck('900_krv', 32, entry({ accuracy: 1, source: 'quiz-opening' }), 2000 + i * 1000);
		}
		const rows = await listChecks('900_krv', 32);
		expect(rows.length).toBeLessThanOrEqual(HISTORY_LIMIT);
		expect(suggestedMarks(rows.filter(countsAsRecall), 11)).toEqual(new Set([2]));
	});
});

// The suggestions and the 만점 badge speak about recall. An opening round
// proves the reader can start a verse; a spot round proves they can recognise
// a mistake. Neither is evidence that the verse was recited.
describe('countsAsRecall', () => {
	it('counts a 점검 and a full typing round', () => {
		expect(countsAsRecall({ source: undefined })).toBe(true);
		expect(countsAsRecall({ source: 'quiz' })).toBe(true);
	});

	it('does not count the opening or spot games', () => {
		expect(countsAsRecall({ source: 'quiz-opening' })).toBe(false);
		expect(countsAsRecall({ source: 'quiz-spot' })).toBe(false);
	});
});

describe('listPerfectVerseNos with games', () => {
	it('does not light the badge from an opening round', async () => {
		await recordCheck('900_krv', 20, entry({ accuracy: 1, source: 'quiz-opening' }), 1000);
		expect(await listPerfectVerseNos('900_krv')).toEqual(new Set());
	});

	it('still lights it from a 점검 and from a full typing round', async () => {
		await recordCheck('900_krv', 21, entry({ accuracy: 1 }), 1000);
		await recordCheck('900_krv', 22, entry({ accuracy: 1, source: 'quiz' }), 1000);
		expect(await listPerfectVerseNos('900_krv')).toEqual(new Set([21, 22]));
	});

	// The latest *counted* record decides. A spot round landing after a
	// flawed check must not revive a badge the check took away.
	it('lets a later spot round neither give nor take the badge', async () => {
		await recordCheck('900_krv', 23, entry({ accuracy: 1 }), 1000);
		await recordCheck('900_krv', 23, entry({ accuracy: 0.5 }), 2000);
		await recordCheck('900_krv', 23, entry({ accuracy: 1, source: 'quiz-spot' }), 3000);
		expect(await listPerfectVerseNos('900_krv')).toEqual(new Set());
	});

	// The most recent *counted* check decides, so a later spot round is
	// invisible rather than decisive. Filter the rows after choosing the
	// latest instead of before, and this badge disappears — taken away by a
	// round that says nothing about whether the verse can be recited.
	it('keeps a badge that a later spot round cannot speak to', async () => {
		await recordCheck('900_krv', 24, entry({ accuracy: 1 }), 1000);
		await recordCheck('900_krv', 24, entry({ accuracy: 0.4, source: 'quiz-spot' }), 2000);
		expect(await listPerfectVerseNos('900_krv')).toEqual(new Set([24]));
	});
});

describe('listPerfectVerseNos', () => {
	it('lists the verses recited flawlessly', async () => {
		await recordCheck('900_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 9000 });
		await recordCheck('900_krv', 2, { start: 2, full: 2, accuracy: 0.8, elapsedMs: 9000 });
		expect([...(await listPerfectVerseNos('900_krv'))]).toEqual([1]);
	});

	// The most recent check decides, not the best one ever recorded. The badge
	// says the verse is solid now; one recited perfectly last month and fumbled
	// this morning is not, and keeping the popper on it would be the card
	// contradicting what the reader just did.
	it('drops a verse whose latest check was flawed', async () => {
		await recordCheck('900_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 9000 }, 1000);
		await recordCheck('900_krv', 1, { start: 2, full: 2, accuracy: 0.6, elapsedMs: 9000 }, 2000);
		expect([...(await listPerfectVerseNos('900_krv'))]).toEqual([]);
	});

	it('earns it back when the next check is flawless again', async () => {
		await recordCheck('900_krv', 1, { start: 2, full: 2, accuracy: 0.6, elapsedMs: 9000 }, 1000);
		await recordCheck('900_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 9000 }, 2000);
		expect([...(await listPerfectVerseNos('900_krv'))]).toEqual([1]);
	});

	// Rows come back in index order, not chronological order, so "latest" has
	// to be decided by checkedAt rather than by whichever arrived last.
	it('uses the newest check even when it was recorded out of order', async () => {
		await recordCheck('900_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 9000 }, 5000);
		await recordCheck('900_krv', 1, { start: 2, full: 2, accuracy: 0.6, elapsedMs: 9000 }, 1000);
		expect([...(await listPerfectVerseNos('900_krv'))]).toEqual([1]);
	});

	// The verseKey index is prefixed by the package id, so a scan must not
	// spill across packages.
	it('does not leak across packages', async () => {
		await recordCheck('900_krv', 7, { start: 5, full: 5, accuracy: 1, elapsedMs: 1000 });
		await recordCheck('100_krv', 9, { start: 5, full: 5, accuracy: 1, elapsedMs: 1000 });
		expect([...(await listPerfectVerseNos('900_krv'))]).toEqual([7]);
		expect([...(await listPerfectVerseNos('100_krv'))]).toEqual([9]);
	});

	it('is empty for a package with no checks', async () => {
		expect((await listPerfectVerseNos('5_krv')).size).toBe(0);
	});
});
