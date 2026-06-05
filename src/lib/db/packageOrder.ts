import { db } from './local';
import { touchDataModified } from './touchData';

const KEY = 'package_order';

/** Returns the user's custom package ordering as a list of package IDs.
 *  Empty when the user hasn't reordered yet (callers then fall back to the
 *  default verse-count order). Only curated packages are stored here — OYO is
 *  always pinned first by listPackages regardless of this list. */
export async function getPackageOrder(): Promise<string[]> {
	const entry = await db.settings.get(KEY);
	const v = entry?.value;
	return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

let writeQueue: Promise<unknown> = Promise.resolve();

/** Persists a new package ordering (list of IDs). Serialized through a queue so
 *  rapid reorders can't interleave, mirroring viewOptions' write pattern. */
export async function setPackageOrder(ids: string[]): Promise<void> {
	const next = writeQueue.then(async () => {
		await db.settings.put({ key: KEY, value: ids });
		await touchDataModified();
	});
	writeQueue = next.catch(() => {});
	return next;
}
