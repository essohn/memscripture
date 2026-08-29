import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/lib/db/local';
import { dataGeneration } from '../../src/lib/state/dataGeneration.svelte';
import {
	_resetGroupCatalogCache,
	getJoinedGroups,
	joinGroup,
	leaveGroup
} from '../../src/lib/db/groups';

const CATALOG = { 'cdm-b': { name: '네비게이토 CDM-B지구', short: 'CDM-B' } };

beforeEach(async () => {
	await db.delete();
	await db.open();
	_resetGroupCatalogCache();
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify(CATALOG), { status: 200 }))
	);
});

describe('joining a group', () => {
	it('stores a known code and reports the group', async () => {
		const info = await joinGroup('cdm-b');
		expect(info?.name).toBe('네비게이토 CDM-B지구');
		expect(await getJoinedGroups()).toEqual(['cdm-b']);
	});

	// Someone who heard the code at a meeting types it however it sounded.
	it.each([' CDM B ', 'CDMB', 'cdm_b', 'CDM-B'])('accepts %s', async (typed) => {
		expect(await joinGroup(typed)).not.toBeNull();
		// Stored canonically whatever was typed, so the id in packages.json and
		// events.json is the only form that has to be got right.
		expect(await getJoinedGroups()).toEqual(['cdm-b']);
	});

	// A typo must be refused out loud, not stored to match nothing forever.
	it('refuses an unknown code instead of storing it', async () => {
		expect(await joinGroup('cdm-z')).toBeNull();
		expect(await getJoinedGroups()).toEqual([]);
	});

	it('refuses an empty code', async () => {
		expect(await joinGroup('   ')).toBeNull();
	});

	it('does not add the same group twice', async () => {
		await joinGroup('cdm-b');
		await joinGroup('CDM-B');
		expect(await getJoinedGroups()).toEqual(['cdm-b']);
	});

	// An invite link can be tapped twice in a row; the writes are serialized so
	// the second cannot read the row before the first has written it.
	it('survives two joins racing', async () => {
		await Promise.all([joinGroup('cdm-b'), joinGroup('cdm-b')]);
		expect(await getJoinedGroups()).toEqual(['cdm-b']);
	});
});

describe('leaving a group', () => {
	it('removes it', async () => {
		await joinGroup('cdm-b');
		await leaveGroup('cdm-b');
		expect(await getJoinedGroups()).toEqual([]);
	});

	it('is quiet about a group that was never joined', async () => {
		await leaveGroup('cdm-b');
		expect(await getJoinedGroups()).toEqual([]);
	});
});

describe('an unreachable catalog', () => {
	// Offline, or a deploy without the file. Refusing every code is the right
	// answer; throwing on the settings screen is not.
	it('refuses codes rather than throwing', async () => {
		_resetGroupCatalogCache();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('offline');
			})
		);
		expect(await joinGroup('cdm-b')).toBeNull();
	});
});


// The home page reads membership once, on mount, and the invite link is
// handled by the layout at the same moment — so a reader arriving through
// /?team=cdm-b joined successfully and went on being told to join, until they
// happened to reload. Membership decides which packages and which 암송 DAY
// they are shown, so the screen has to hear about it.
describe('joining and the screens above it', () => {
	it('advances the data generation on a join', async () => {
		const before = dataGeneration.value;
		await joinGroup('cdm-b');
		expect(dataGeneration.value).toBeGreaterThan(before);
	});

	it('advances it on leaving too', async () => {
		await joinGroup('cdm-b');
		const before = dataGeneration.value;
		await leaveGroup('cdm-b');
		expect(dataGeneration.value).toBeGreaterThan(before);
	});

	// A code that matched nothing changed nothing.
	it('leaves it alone when the code is unknown', async () => {
		const before = dataGeneration.value;
		await joinGroup('no-such-team');
		expect(dataGeneration.value).toBe(before);
	});
});
