import { describe, expect, it, vi } from 'vitest';
import {
	buildQueue,
	filterByTier,
	sessionSizeChoices,
	summarize,
	type QuizItem,
	type Tier
} from '../../src/lib/quiz/session';
import type { DifficultyLevel } from '../../src/lib/db/verseRatings';
import { SESSION_SIZE, type VerseSignal } from '../../src/lib/quiz/priority';

const item = (packageId: string, verseNo: number): QuizItem => ({
	id: `${packageId}:${verseNo}`,
	packageId,
	verseNo,
	title: `제목 ${verseNo}`,
	cite: `창세기 1 : ${verseNo}`,
	w: `본문 ${verseNo}`
});

const rating = (start: DifficultyLevel | null, full: DifficultyLevel | null) => ({ start, full });
const ALL: Set<Tier> = new Set([0, 1, 2, 3, 4, 5, null]);

describe('filterByTier', () => {
	it('serves nothing from an empty scope', () => {
		expect(filterByTier([], ALL, ALL, new Map())).toEqual([]);
	});

	// No chip selected is a scope of nothing, not a scope of everything —
	// "all" and "none" must not be the same gesture. True of either row on its
	// own, because the rows intersect.
	it('serves nothing when a row has no tier selected', () => {
		const items = [item('a', 1)];
		const ratings = new Map([['a:1', rating(3, 3)]]);
		expect(filterByTier(items, new Set(), ALL, ratings)).toEqual([]);
		expect(filterByTier(items, ALL, new Set(), ratings)).toEqual([]);
	});

	it('keeps a verse in a selected tier and drops one outside it', () => {
		const items = [item('a', 1), item('a', 2)];
		const ratings = new Map([
			['a:1', rating(2, 2)],
			['a:2', rating(5, 5)]
		]);
		expect(filterByTier(items, new Set<Tier>([2]), ALL, ratings).map((i) => i.id)).toEqual(['a:1']);
	});

	// The whole point of splitting the row in two: 시작 난이도 and 전체 난이도
	// are rated separately, and this verse is hard to begin but easy once
	// running. Each row judges its own dimension and both have to agree — a
	// union would let the easy half carry the hard one, which is what the
	// single collapsed row used to do.
	it('requires both rows to accept the verse, not either one', () => {
		const items = [item('a', 1)];
		const ratings = new Map([['a:1', rating(2, 5)]]);
		expect(filterByTier(items, new Set<Tier>([2]), new Set<Tier>([5]), ratings)).toHaveLength(1);
		expect(filterByTier(items, new Set<Tier>([2]), new Set<Tier>([2]), ratings)).toHaveLength(0);
		expect(filterByTier(items, new Set<Tier>([5]), new Set<Tier>([5]), ratings)).toHaveLength(0);
	});

	// Which is what makes a row usable as a single-dimension filter: leave the
	// other one wide open and it stops having an opinion.
	it('lets a row with every chip on stop constraining', () => {
		const items = [item('a', 1), item('a', 2)];
		const ratings = new Map([
			['a:1', rating(0, 5)],
			['a:2', rating(4, 5)]
		]);
		expect(filterByTier(items, new Set<Tier>([0]), ALL, ratings).map((i) => i.id)).toEqual(['a:1']);
	});

	// An unrated verse is usually the one that has had the least attention, so
	// it gets a chip of its own rather than being silently dropped — per
	// dimension, since a verse can be rated for one and not the other.
	it('files an unrated dimension under 미평가', () => {
		const items = [item('a', 1)];
		expect(filterByTier(items, new Set<Tier>([null]), new Set<Tier>([null]), new Map())).toHaveLength(1);
		expect(filterByTier(items, new Set<Tier>([1, 2, 3, 4, 5]), ALL, new Map())).toHaveLength(0);

		const halfRated = new Map([['a:1', rating(2, null)]]);
		expect(
			filterByTier(items, new Set<Tier>([2]), new Set<Tier>([null]), halfRated)
		).toHaveLength(1);
		expect(filterByTier(items, new Set<Tier>([2]), new Set<Tier>([2]), halfRated)).toHaveLength(0);
	});

	// One 암송 DAY can span packages, so verse 1 of two packages can meet in
	// one session. Keying by verse number alone would let one decide the
	// other's fate.
	it('keeps two packages\' verse 1 apart', () => {
		const items = [item('a', 1), item('b', 1)];
		const ratings = new Map([
			['a:1', rating(1, 1)],
			['b:1', rating(5, 5)]
		]);
		expect(filterByTier(items, new Set<Tier>([1]), ALL, ratings).map((i) => i.id)).toEqual(['a:1']);
	});

	// The items arrive in the order the scope produced them — for an 암송 DAY,
	// the order its ranges are written in, which is how the reader knows the
	// day. Sorting by verse number would scramble a two-package day.
	it('does not reorder what it was given', () => {
		const items = [item('b', 9), item('a', 2), item('a', 1)];
		expect(filterByTier(items, ALL, ALL, new Map()).map((i) => i.id)).toEqual(['b:9', 'a:2', 'a:1']);
	});
});

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

/** Every verse unproven, so ordering falls to the id tie-break. */
const noSignals = new Map<string, VerseSignal>();

describe('buildQueue', () => {
	it('returns everything when the pool is under the cap', () => {
		const pool = [item('a_krv', 1), item('a_krv', 2)];
		expect(buildQueue(pool, { signals: noSignals, now: NOW })).toHaveLength(2);
	});

	it('caps the session at SESSION_SIZE', () => {
		const pool = Array.from({ length: SESSION_SIZE + 5 }, (_, i) => item('a_krv', i + 1));
		expect(buildQueue(pool, { signals: noSignals, now: NOW })).toHaveLength(SESSION_SIZE);
	});

	// Only under 자주 틀린 순. The default is 오래된 순, where these two were
	// both checked today and the failures do not enter into it.
	it('puts the verse with recent failures first, when asked for that order', () => {
		const pool = [item('a_krv', 1), item('a_krv', 2)];
		const signals = new Map<string, VerseSignal>([
			['a_krv:1', { fails: 0, lastAskedAt: NOW }],
			['a_krv:2', { fails: 3, lastAskedAt: NOW }]
		]);
		expect(buildQueue(pool, { signals, now: NOW, order: 'fails' }).map((i) => i.id)).toEqual([
			'a_krv:2',
			'a_krv:1'
		]);
	});

	it('brings a long-untouched verse back ahead of one asked today', () => {
		const pool = [item('a_krv', 1), item('a_krv', 2)];
		const signals = new Map<string, VerseSignal>([
			['a_krv:1', { fails: 0, lastAskedAt: NOW }],
			['a_krv:2', { fails: 0, lastAskedAt: NOW - 20 * DAY }]
		]);
		expect(buildQueue(pool, { signals, now: NOW }).map((i) => i.id)).toEqual([
			'a_krv:2',
			'a_krv:1'
		]);
	});

	it('treats a verse with no signal as never asked about', () => {
		const pool = [item('a_krv', 1), item('a_krv', 2)];
		const signals = new Map<string, VerseSignal>([['a_krv:1', { fails: 0, lastAskedAt: NOW }]]);
		expect(buildQueue(pool, { signals, now: NOW })[0]?.id).toBe('a_krv:2');
	});

	it('breaks ties by id, so a fresh scope starts at the beginning', () => {
		const pool = [item('a_krv', 3), item('a_krv', 1), item('a_krv', 2)];
		expect(buildQueue(pool, { signals: noSignals, now: NOW }).map((i) => i.id)).toEqual([
			'a_krv:1',
			'a_krv:2',
			'a_krv:3'
		]);
	});

	// The two eligible verses are the lowest-priority in the pool: everything
	// else is unproven and scores STALE_CAP, while these two were passed
	// today and score zero. A queue that sliced to SESSION_SIZE before
	// applying eligibility would drop both and open a 틀린 곳 찾기 session
	// with no rounds at all — which is the whole reason the filter runs first.
	it('fills the session from eligible verses rather than dropping them after the cap', () => {
		const pool = Array.from({ length: SESSION_SIZE + 2 }, (_, i) => item('a_krv', i + 1));
		const eligible = new Set([`a_krv:${SESSION_SIZE + 1}`, `a_krv:${SESSION_SIZE + 2}`]);
		const signals = new Map<string, VerseSignal>(
			[...eligible].map((id) => [id, { fails: 0, lastAskedAt: NOW }])
		);
		expect(buildQueue(pool, { signals, now: NOW, eligible }).map((i) => i.id)).toEqual([
			'a_krv:11',
			'a_krv:12'
		]);
	});

	it('asks about everything when no eligibility is given', () => {
		const pool = [item('a_krv', 1), item('a_krv', 2)];
		expect(buildQueue(pool, { signals: noSignals, now: NOW })).toHaveLength(2);
	});

	it('returns nothing when nothing is eligible', () => {
		const pool = [item('a_krv', 1)];
		expect(buildQueue(pool, { signals: noSignals, now: NOW, eligible: new Set() })).toEqual([]);
	});

	it('does not reorder the pool it was given', () => {
		const pool = [item('a_krv', 3), item('a_krv', 1)];
		buildQueue(pool, { signals: noSignals, now: NOW });
		expect(pool.map((i) => i.id)).toEqual(['a_krv:3', 'a_krv:1']);
	});
});

describe('summarize', () => {
	const result = (id: string, passed: boolean) => ({
		id,
		passed,
		accuracy: passed ? 1 : 0.8,
		missed: passed ? [] : [2],
		elapsedMs: 1000
	});

	it('reports nothing for a session with no rounds', () => {
		expect(summarize([])).toEqual({ passed: 0, total: 0, failed: [] });
	});

	it('counts passes and names only what failed', () => {
		expect(summarize([result('a:1', true), result('a:2', false), result('b:1', false)])).toEqual({
			passed: 1,
			total: 3,
			failed: ['a:2', 'b:1']
		});
	});
});

describe('sessionSizeChoices', () => {
	it('offers nothing to choose from for an empty pool', () => {
		expect(sessionSizeChoices(0)).toEqual([]);
	});

	// A pool of three has one honest answer — three. Offering 5 would be a
	// chip that cannot be told apart from 전체 once pressed.
	it('offers only the whole pool when the pool is under the first step', () => {
		expect(sessionSizeChoices(3)).toEqual([3]);
	});

	// 10 is both a step and the whole pool here, and two chips reading 10
	// would be one chip too many.
	it('does not repeat a step that already equals the whole pool', () => {
		expect(sessionSizeChoices(10)).toEqual([5, 10]);
	});

	it('drops the steps a pool cannot fill and ends on the pool itself', () => {
		expect(sessionSizeChoices(48)).toEqual([5, 10, 20, 30, 48]);
	});

	it('offers every step under a large pool', () => {
		expect(sessionSizeChoices(149)).toEqual([5, 10, 20, 30, 50, 100, 149]);
	});
});

describe('buildQueue — 오래된 순', () => {
	const stale = { order: 'stale' as const, signals: noSignals, now: NOW };

	it('asks about the least recently checked verse first', () => {
		const pool = [item('a_krv', 1), item('a_krv', 2), item('a_krv', 3)];
		const signals = new Map<string, VerseSignal>([
			['a_krv:1', { fails: 0, lastAskedAt: NOW - 2 * DAY }],
			['a_krv:2', { fails: 0, lastAskedAt: NOW - 9 * DAY }],
			['a_krv:3', { fails: 0, lastAskedAt: NOW }]
		]);
		expect(buildQueue(pool, { ...stale, signals }).map((i) => i.id)).toEqual([
			'a_krv:2',
			'a_krv:1',
			'a_krv:3'
		]);
	});

	// Never checked is the oldest thing there is: the reader has no evidence
	// about it at all, which is exactly what 오래된 순 exists to surface.
	it('puts a never-checked verse ahead of every checked one', () => {
		const pool = [item('a_krv', 1), item('a_krv', 2)];
		const signals = new Map<string, VerseSignal>([
			['a_krv:1', { fails: 0, lastAskedAt: NOW - 400 * DAY }]
		]);
		expect(buildQueue(pool, { ...stale, signals }).map((i) => i.id)).toEqual([
			'a_krv:2',
			'a_krv:1'
		]);
	});

	// STALE_CAP flattens everything past 30 days into one score, which is fine
	// for a weighted total and fatal for an ordering: under the cap these two
	// tie and fall to the id tie-break, putting the *newer* one first.
	it('still tells 120일 전 from 45일 전, past the staleness cap', () => {
		const pool = [item('a_krv', 1), item('a_krv', 2)];
		const signals = new Map<string, VerseSignal>([
			['a_krv:1', { fails: 0, lastAskedAt: NOW - 45 * DAY }],
			['a_krv:2', { fails: 0, lastAskedAt: NOW - 120 * DAY }]
		]);
		expect(buildQueue(pool, { ...stale, signals }).map((i) => i.id)).toEqual([
			'a_krv:2',
			'a_krv:1'
		]);
	});

	it('ignores how often a verse has been failed', () => {
		const pool = [item('a_krv', 1), item('a_krv', 2)];
		const signals = new Map<string, VerseSignal>([
			['a_krv:1', { fails: 0, lastAskedAt: NOW - 9 * DAY }],
			['a_krv:2', { fails: 5, lastAskedAt: NOW }]
		]);
		expect(buildQueue(pool, { ...stale, signals }).map((i) => i.id)).toEqual([
			'a_krv:1',
			'a_krv:2'
		]);
	});

	it('breaks a same-day tie by id', () => {
		const pool = [item('a_krv', 3), item('a_krv', 1), item('a_krv', 2)];
		const signals = new Map<string, VerseSignal>(
			[1, 2, 3].map((n) => [`a_krv:${n}`, { fails: 0, lastAskedAt: NOW }])
		);
		expect(buildQueue(pool, { ...stale, signals }).map((i) => i.id)).toEqual([
			'a_krv:1',
			'a_krv:2',
			'a_krv:3'
		]);
	});
});

describe('buildQueue — 무작위', () => {
	/** Always picks index 0, which is deterministic and still a real shuffle. */
	const zero = () => 0;
	const many = (n: number) => Array.from({ length: n }, (_, i) => item('a_krv', i + 1));

	it('does not hand back the scope in its own order', () => {
		const pool = many(6);
		const ids = buildQueue(pool, {
			signals: noSignals,
			now: NOW,
			order: 'random',
			rng: zero
		}).map((i) => i.id);
		expect(ids).not.toEqual(pool.map((i) => i.id));
	});

	it('loses and duplicates nothing', () => {
		const pool = many(6);
		const ids = buildQueue(pool, {
			signals: noSignals,
			now: NOW,
			order: 'random',
			rng: zero
		}).map((i) => i.id);
		expect([...ids].sort()).toEqual(pool.map((i) => i.id).sort());
	});

	it('draws through the rng it was given rather than its own', () => {
		const rng = vi.fn(() => 0);
		buildQueue(many(6), { signals: noSignals, now: NOW, order: 'random', rng });
		expect(rng).toHaveBeenCalled();
	});

	// The eligibility filter is not an ordering, it is what the game can ask
	// about at all — a shuffle that reached past it would open 자주 틀리는 곳
	// 찾기 on verses with no recorded attempt.
	it('still draws only from the eligible verses', () => {
		const eligible = new Set(['a_krv:4', 'a_krv:9']);
		const ids = buildQueue(many(12), {
			signals: noSignals,
			now: NOW,
			order: 'random',
			eligible,
			rng: zero
		}).map((i) => i.id);
		expect([...ids].sort()).toEqual(['a_krv:4', 'a_krv:9']);
	});
});

describe('buildQueue — 문항 수', () => {
	const many = (n: number) => Array.from({ length: n }, (_, i) => item('a_krv', i + 1));

	it('takes the size it was asked for instead of SESSION_SIZE', () => {
		expect(buildQueue(many(40), { signals: noSignals, now: NOW, size: 20 })).toHaveLength(20);
	});

	it('serves the whole pool when the size covers it', () => {
		expect(buildQueue(many(7), { signals: noSignals, now: NOW, size: 7 })).toHaveLength(7);
	});

	it('caps a random draw the same way', () => {
		expect(
			buildQueue(many(40), { signals: noSignals, now: NOW, size: 5, order: 'random', rng: () => 0 })
		).toHaveLength(5);
	});
});
