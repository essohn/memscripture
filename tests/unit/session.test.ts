import { describe, expect, it } from 'vitest';
import {
	buildQueue,
	filterByTier,
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

	it('puts the verse with recent failures first', () => {
		const pool = [item('a_krv', 1), item('a_krv', 2)];
		const signals = new Map<string, VerseSignal>([
			['a_krv:1', { fails: 0, lastAskedAt: NOW }],
			['a_krv:2', { fails: 3, lastAskedAt: NOW }]
		]);
		expect(buildQueue(pool, { signals, now: NOW }).map((i) => i.id)).toEqual([
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
