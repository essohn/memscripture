import { describe, expect, it } from 'vitest';
import {
	isVisibleTo,
	normalizeGroupCode,
	packagesToInstall,
	visibleTo
} from '../../src/lib/groups/visibility';

describe('normalizeGroupCode', () => {
	// Someone who heard the code at a meeting writes it however it sounded.
	it.each(['CDM-B', 'cdm-b', ' CDM B ', 'cdm_b', 'CDM--B'])('%s → cdm-b', (typed) => {
		expect(normalizeGroupCode(typed)).toBe('cdm-b');
	});

	it('leaves an already-canonical code alone', () => {
		expect(normalizeGroupCode('cdm-b')).toBe('cdm-b');
	});
});

describe('isVisibleTo', () => {
	// The default has to be "everyone", or adding the field would hide every
	// existing package and event at once.
	it('shows anything that names no group', () => {
		expect(isVisibleTo({}, [])).toBe(true);
		expect(isVisibleTo({ groups: [] }, [])).toBe(true);
	});

	it('hides a group item from a reader outside it', () => {
		expect(isVisibleTo({ groups: ['cdm-b'] }, [])).toBe(false);
		expect(isVisibleTo({ groups: ['cdm-b'] }, ['other'])).toBe(false);
	});

	it('shows it to a member', () => {
		expect(isVisibleTo({ groups: ['cdm-b'] }, ['cdm-b'])).toBe(true);
	});

	// A reader can be in a 지구 and a church at once, and a course can be opened
	// to more than one 지구.
	it('matches on any overlap', () => {
		expect(isVisibleTo({ groups: ['cdm-b', 'cdm-c'] }, ['church-x', 'cdm-c'])).toBe(true);
	});

	it('compares loosely on both sides', () => {
		expect(isVisibleTo({ groups: ['CDM-B'] }, ['cdm b'])).toBe(true);
	});
});

describe('packagesToInstall', () => {
	const AVAILABLE = [
		{ id: '5_krv' },
		{ id: '100_krv', groups: ['cdm-b'] },
		{ id: '900_krv', groups: ['cdm-b'] }
	];

	it('installs the open packages for everyone', () => {
		expect(packagesToInstall(AVAILABLE, [], []).map((p) => p.id)).toEqual(['5_krv']);
	});

	it('adds the group packages for a member', () => {
		expect(packagesToInstall(AVAILABLE, ['cdm-b'], []).map((p) => p.id)).toEqual([
			'5_krv',
			'100_krv',
			'900_krv'
		]);
	});

	// The one rule that matters most. Every reader had all seven packages before
	// groups existed, and some have memorized their way through 900구절.
	// Withdrawing a package because a boundary was drawn later would delete the
	// shelf their work sits on.
	it('never withdraws a package the reader already has', () => {
		const ids = packagesToInstall(AVAILABLE, [], ['900_krv']).map((p) => p.id);
		expect(ids).toContain('900_krv');
		expect(ids).toContain('5_krv');
		expect(ids).not.toContain('100_krv');
	});
});

describe('visibleTo', () => {
	it('filters a list the same way', () => {
		const events = [{ id: 'a' }, { id: 'b', groups: ['cdm-b'] }];
		expect(visibleTo(events, []).map((e) => e.id)).toEqual(['a']);
		expect(visibleTo(events, ['cdm-b']).map((e) => e.id)).toEqual(['a', 'b']);
	});
});
