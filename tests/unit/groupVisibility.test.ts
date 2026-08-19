import { describe, expect, it } from 'vitest';
import {
	groupMatchKey,
	isVisibleTo,
	normalizeGroupCode,
	resolveGroupCode,
	visiblePackages,
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

describe('groupMatchKey', () => {
	// Nobody remembers where the hyphen went, so it cannot decide whether a
	// reader gets in.
	it.each(['CDM-B', 'CDMB', 'cdm b', 'cdm_b', 'c d m b'])('%s matches cdm-b', (typed) => {
		expect(groupMatchKey(typed)).toBe(groupMatchKey('cdm-b'));
	});

	it('keeps different codes apart', () => {
		expect(groupMatchKey('cdm-b')).not.toBe(groupMatchKey('cdm-c'));
	});

	it('handles a Korean code', () => {
		expect(groupMatchKey('강남 지구')).toBe(groupMatchKey('강남지구'));
	});
});

describe('resolveGroupCode', () => {
	const CATALOG = ['cdm-b', 'cdm-c'];

	it('accepts the code written any way', () => {
		for (const typed of ['cdm-b', 'CDM-B', 'CDMB', 'cdm b', ' cdm_b ']) {
			expect(resolveGroupCode(CATALOG, typed)).toBe('cdm-b');
		}
	});

	it('refuses a code for no group', () => {
		expect(resolveGroupCode(CATALOG, 'cdm-z')).toBeNull();
		expect(resolveGroupCode(CATALOG, '  ')).toBeNull();
	});

	// Dropping separators makes these one key. Guessing would put a reader in
	// the wrong 지구 without saying so, so an ambiguous code is refused.
	it('refuses rather than guessing between two groups that collide', () => {
		expect(resolveGroupCode(['cdm-b', 'cd-mb'], 'cdmb')).toBeNull();
	});

	// An id typed exactly still wins, even where the loose key is ambiguous.
	it('takes an exact id over an ambiguous loose match', () => {
		expect(resolveGroupCode(['cdm-b', 'cd-mb'], 'cd-mb')).toBe('cd-mb');
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
		expect(isVisibleTo({ groups: ['cdm-b'] }, ['CDMB'])).toBe(true);
	});
});

describe('visiblePackages', () => {
	const AVAILABLE = [
		{ id: '5_krv' },
		{ id: '100_krv', groups: ['cdm-b'] },
		{ id: '900_krv', groups: ['cdm-b'] }
	];

	it('shows the open packages to everyone', () => {
		expect(visiblePackages(AVAILABLE, [], []).map((p) => p.id)).toEqual(['5_krv']);
	});

	it('adds the group packages for a member', () => {
		expect(visiblePackages(AVAILABLE, ['cdm-b'], []).map((p) => p.id)).toEqual([
			'5_krv',
			'100_krv',
			'900_krv'
		]);
	});

	// The rule that matters most: a reader who has memorized their way through
	// 900구절 must not lose it because a boundary was drawn later.
	it('keeps a package the reader has worked in', () => {
		const ids = visiblePackages(AVAILABLE, [], ['900_krv']).map((p) => p.id);
		expect(ids).toEqual(['5_krv', '900_krv']);
	});

	// The mistake this replaced. Every reader was auto-given all seven packages
	// on first launch, so keying on "installed" kept everything for everyone and
	// the gate did nothing at all.
	it('is not satisfied by mere installation', () => {
		expect(visiblePackages(AVAILABLE, [], []).map((p) => p.id)).not.toContain('900_krv');
	});

	// 내 구절 is the reader's own and belongs to no group by construction.
	it('always keeps the user own package', () => {
		const withOyo = [...AVAILABLE, { id: 'oyo', kind: 'user' }];
		expect(visiblePackages(withOyo, [], []).map((p) => p.id)).toContain('oyo');
	});
});

describe('visibleTo', () => {
	it('filters a list the same way', () => {
		const events = [{ id: 'a' }, { id: 'b', groups: ['cdm-b'] }];
		expect(visibleTo(events, []).map((e) => e.id)).toEqual(['a']);
		expect(visibleTo(events, ['cdm-b']).map((e) => e.id)).toEqual(['a', 'b']);
	});
});
