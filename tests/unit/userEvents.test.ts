import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	isUserEventId,
	listUserEvents,
	newUserEventId,
	removeUserEvent,
	saveUserEvent
} from '../../src/lib/db/userEvents';
import { loadEvents, _resetEventsCache } from '../../src/lib/db/events';
import type { MemEvent } from '../../src/lib/types';

const mine: MemEvent = {
	id: 'my:abc',
	title: '9월 암송 DAY',
	dueAt: '2026-09-30',
	ranges: [{ packageId: '242_krv', verseNos: [1, 2, 3] }]
};

beforeEach(async () => {
	await db.delete();
	await db.open();
	_resetEventsCache();
});

describe('user events', () => {
	it('keeps what it was given', async () => {
		await saveUserEvent(mine);
		const rows = await listUserEvents();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ id: 'my:abc', title: '9월 암송 DAY', dueAt: '2026-09-30' });
	});

	// The merge has nothing else to compare: an event carries no version of its
	// own, so two devices that both edited one could not say which edit won.
	it('stamps every write', async () => {
		await saveUserEvent(mine);
		const [row] = await listUserEvents();
		expect(Date.parse(row.updatedAt)).not.toBeNaN();
	});

	it('replaces rather than duplicates on a second save', async () => {
		await saveUserEvent(mine);
		await saveUserEvent({ ...mine, title: '고친 제목' });
		const rows = await listUserEvents();
		expect(rows).toHaveLength(1);
		expect(rows[0].title).toBe('고친 제목');
	});

	it('removes one', async () => {
		await saveUserEvent(mine);
		await removeUserEvent('my:abc');
		expect(await listUserEvents()).toEqual([]);
	});
});

describe('user event ids', () => {
	// A published DAY and a locally made one live in one list. Without a
	// namespace, a reader who called theirs the same thing would shadow it.
	it('are their own namespace', () => {
		expect(isUserEventId(newUserEventId())).toBe(true);
		expect(isUserEventId('2026-summer-amsong-day')).toBe(false);
	});

	it('does not repeat itself', () => {
		const ids = new Set(Array.from({ length: 200 }, () => newUserEventId()));
		expect(ids.size).toBe(200);
	});
});

describe('loadEvents', () => {
	// The published list is fetched, and in this environment that fetch fails —
	// which is the point. Before the reader could register a DAY of their own
	// there was nothing to lose by throwing here; now a network blip would take
	// away the DAY sitting in their own storage.
	it('still has the reader own DAYs when the published list cannot be fetched', async () => {
		await saveUserEvent(mine);
		const all = await loadEvents();
		expect(all.map((e) => e.id)).toContain('my:abc');
	});

	// Caching them would mean every screen that registers or edits a DAY had
	// to remember to clear it.
	it('sees a DAY registered after the first read', async () => {
		await loadEvents();
		await saveUserEvent(mine);
		const all = await loadEvents();
		expect(all.map((e) => e.id)).toContain('my:abc');
	});
});
