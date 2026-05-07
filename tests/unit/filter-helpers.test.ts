import { describe, it, expect } from 'vitest';
import {
	level1Groups,
	level2GroupsInSeries,
	tagsForVerse,
	filterVerses
} from '../../src/lib/db/verses';
import type { IndexGroup } from '../../src/lib/types';
import type { StoredVerse } from '../../src/lib/db/local';

const PID = '60_krv';

const groups: IndexGroup[] = [
	{ package_id: PID, group_name: 'A. 새로운 삶', level: 1, index: [1, 2, 3, 4] },
	{ package_id: PID, group_name: 'A.1 중심', level: 2, index: [1, 2] },
	{ package_id: PID, group_name: 'A.2 순종', level: 2, index: [3, 4] },
	{ package_id: PID, group_name: 'B. 그리스도', level: 1, index: [5, 6, 7, 8] },
	{ package_id: PID, group_name: 'B.1 신성', level: 2, index: [5, 6] },
	{ package_id: PID, group_name: 'B.2 인성', level: 2, index: [7, 8] }
];

const flatGroups: IndexGroup[] = [
	{ package_id: '5_krv', group_name: 'one', level: 1, index: [1, 2, 3, 4, 5] }
];

const seriesOnlyGroups: IndexGroup[] = [
	{ package_id: '100_krv', group_name: 'S1', level: 1, index: [1, 2, 3] },
	{ package_id: '100_krv', group_name: 'S2', level: 1, index: [4, 5, 6] }
];

function v(no: number): StoredVerse {
	return { package_id: PID, no, i: no, title: `t${no}`, cite: `c${no}`, w: `w${no}` };
}
const verses: StoredVerse[] = [v(1), v(2), v(3), v(4), v(5), v(6), v(7), v(8)];

describe('level1Groups', () => {
	it('returns level-1 groups in JSON order', () => {
		const r = level1Groups(groups);
		expect(r.map((g) => g.group_name)).toEqual(['A. 새로운 삶', 'B. 그리스도']);
	});

	it('returns single group for flat package', () => {
		expect(level1Groups(flatGroups)).toHaveLength(1);
	});
});

describe('level2GroupsInSeries', () => {
	it('returns level-2 groups whose index is subset of series', () => {
		const r = level2GroupsInSeries(groups, 0);
		expect(r.map((g) => g.group_name)).toEqual(['A.1 중심', 'A.2 순종']);
	});

	it('scopes by selected series', () => {
		const r = level2GroupsInSeries(groups, 1);
		expect(r.map((g) => g.group_name)).toEqual(['B.1 신성', 'B.2 인성']);
	});

	it('returns [] when series has no level-2 (e.g., 100_krv)', () => {
		expect(level2GroupsInSeries(seriesOnlyGroups, 0)).toEqual([]);
	});

	it('returns [] when seriesIndex is null', () => {
		expect(level2GroupsInSeries(groups, null)).toEqual([]);
	});

	it('returns [] when seriesIndex is out of range', () => {
		expect(level2GroupsInSeries(groups, 99)).toEqual([]);
	});
});

describe('tagsForVerse', () => {
	it('returns level-1 + level-2 tag with indices for verse 1', () => {
		const tags = tagsForVerse(groups, 1);
		expect(tags).toHaveLength(2);
		expect(tags[0]).toMatchObject({ level: 1, seriesIndex: 0 });
		expect(tags[0].group.group_name).toBe('A. 새로운 삶');
		expect(tags[1]).toMatchObject({ level: 2, seriesIndex: 0, groupIndex: 0 });
		expect(tags[1].group.group_name).toBe('A.1 중심');
	});

	it('returns level-1 only for series-only package', () => {
		const tags = tagsForVerse(seriesOnlyGroups, 1);
		expect(tags).toHaveLength(1);
		expect(tags[0]).toMatchObject({ level: 1, seriesIndex: 0 });
		expect(tags[0].groupIndex).toBeUndefined();
	});

	it('returns level-1 only for flat package (single group)', () => {
		const tags = tagsForVerse(flatGroups, 1);
		expect(tags).toHaveLength(1);
		expect(tags[0].level).toBe(1);
	});

	it('orders level-1 first, then level-2', () => {
		const tags = tagsForVerse(groups, 1);
		expect(tags[0].level).toBe(1);
		expect(tags[1].level).toBe(2);
	});

	it('returns [] for verse not in any group', () => {
		expect(tagsForVerse(groups, 99)).toEqual([]);
	});
});

describe('filterVerses', () => {
	it('returns all verses when seriesIndex is null', () => {
		const r = filterVerses(verses, groups, null, []);
		expect(r).toHaveLength(8);
	});

	it('filters by series only', () => {
		const r = filterVerses(verses, groups, 0, []);
		expect(r.map((v) => v.no)).toEqual([1, 2, 3, 4]);
	});

	it('filters by series + single level-2 group', () => {
		const r = filterVerses(verses, groups, 0, [0]);
		expect(r.map((v) => v.no)).toEqual([1, 2]);
	});

	it('filters by series + multiple level-2 groups (union)', () => {
		const r = filterVerses(verses, groups, 0, [0, 1]);
		expect(r.map((v) => v.no)).toEqual([1, 2, 3, 4]);
	});

	it('out-of-range seriesIndex passes through', () => {
		const r = filterVerses(verses, groups, 99, []);
		expect(r).toHaveLength(8);
	});

	it('out-of-range groupIndices are silently dropped', () => {
		const r = filterVerses(verses, groups, 0, [0, 99]);
		expect(r.map((v) => v.no)).toEqual([1, 2]);
	});
});
