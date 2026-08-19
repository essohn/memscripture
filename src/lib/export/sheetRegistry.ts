import { db } from '$lib/db/local';
import { touchDataModified } from '$lib/db/touchData';

const KEY = 'event_sheet_ids';

/**
 * Which Google Sheet belongs to which event, per account.
 *
 * Keyed by account as well as event because `drive.file` grants access only
 * to files the app created *for that account*. A document made from a
 * personal login is a 404 to a work login, and remembering one id per event
 * would make two accounts overwrite each other's entry on every export —
 * each one creating a replacement, then losing it again. Two accounts get
 * two documents; the same account gets the same document from every device,
 * because this row rides along in the sync snapshot.
 *
 * NUL as the separator: an email cannot contain one, so no pair of
 * (email, eventId) can collide with another.
 */
export function registryKey(email: string, eventId: string): string {
	return `${email}\u0000${eventId}`;
}

/** Reads a stored value defensively — this row round-trips through sync and
 *  through whatever an older version of the app wrote. */
export function parseRegistry(value: unknown): Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		if (typeof v === 'string' && v.length > 0) out[k] = v;
	}
	return out;
}

export async function getEventSheetId(email: string, eventId: string): Promise<string | null> {
	const row = await db.settings.get(KEY);
	return parseRegistry(row?.value)[registryKey(email, eventId)] ?? null;
}

/** Serialized for the same reason verseMarks is: this is a read-modify-write
 *  on one shared row, and exporting two events in quick succession would
 *  otherwise drop the first id. */
let writeQueue: Promise<unknown> = Promise.resolve();

export async function setEventSheetId(
	email: string,
	eventId: string,
	fileId: string
): Promise<void> {
	const next = writeQueue.then(run, run);
	writeQueue = next.catch(() => {});
	return next;

	async function run(): Promise<void> {
		const row = await db.settings.get(KEY);
		const map = parseRegistry(row?.value);
		map[registryKey(email, eventId)] = fileId;
		await db.settings.put({ key: KEY, value: map });
		await touchDataModified();
	}
}
