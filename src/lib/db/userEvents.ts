import { db, type StoredEvent } from './local';
import { touchDataModified } from './touchData';
import type { MemEvent } from '$lib/types';

/**
 * 암송 DAYs the reader registered themselves.
 *
 * The shipped ones in static/data/events.json belong to whoever publishes the
 * app: they are shared, scoped by 지구, and the same for everyone who gets that
 * build. These are one reader's own, stored beside the rest of their data and
 * carried in the sync snapshot with it.
 *
 * Kept apart from the shipped list rather than merged into it at write time,
 * so an app update can change a published DAY without having to reconcile it
 * with an edit the reader made to their copy — there is no copy.
 */

/** Ids are the reader's own namespace. Prefixed so a locally made DAY can
 *  never collide with a published one, whatever it is called. */
export const USER_EVENT_PREFIX = 'my:';

export function isUserEventId(id: string): boolean {
	return id.startsWith(USER_EVENT_PREFIX);
}

/** A fresh id for a DAY the reader is creating. */
export function newUserEventId(now: number = Date.now()): string {
	return `${USER_EVENT_PREFIX}${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export async function listUserEvents(): Promise<StoredEvent[]> {
	return db.events.toArray();
}

let writeQueue: Promise<unknown> = Promise.resolve();

/** Create or replace one. The stamp is what the sync merge compares. */
export async function saveUserEvent(event: MemEvent): Promise<void> {
	const next = writeQueue.then(async () => {
		await db.events.put({ ...event, updatedAt: new Date().toISOString() });
		await touchDataModified();
	});
	// Don't let a single failure poison the queue.
	writeQueue = next.catch(() => {});
	return next;
}

export async function removeUserEvent(id: string): Promise<void> {
	const next = writeQueue.then(async () => {
		await db.events.delete(id);
		await touchDataModified();
	});
	writeQueue = next.catch(() => {});
	return next;
}
