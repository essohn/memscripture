import { db } from './local';
import { touchDataModified } from './touchData';
import { normalizeGroupCode, resolveGroupCode } from '$lib/groups/visibility';

const KEY = 'joined_groups';
const CATALOG_URL = '/data/groups.json';

export interface GroupInfo {
	id: string;
	name: string;
	short?: string;
}

/** Serialized so two joins in quick succession cannot lose one to a stale
 *  read — the same read-modify-write hazard as verseRatings and verseMarks. */
let writeQueue: Promise<unknown> = Promise.resolve();

function serialize<T>(work: () => Promise<T>): Promise<T> {
	const next = writeQueue.then(work, work);
	writeQueue = next.catch(() => {});
	return next;
}

export async function getJoinedGroups(): Promise<string[]> {
	const row = await db.settings.get(KEY);
	const value = row?.value;
	if (!Array.isArray(value)) return [];
	return value.filter((v): v is string => typeof v === 'string');
}

/** Joins a group by code. Returns the group when the code is known, null when
 *  it is not — the caller says so rather than silently storing a typo. */
export async function joinGroup(code: string): Promise<GroupInfo | null> {
	const catalog = await loadGroupCatalog();
	// Resolved against the catalog rather than normalized blindly, so CDMB and
	// CDM-B both land on cdm-b — and an ambiguous code lands on nothing.
	const id = resolveGroupCode(Object.keys(catalog), code);
	if (!id) return null;
	const info = catalog[id];
	if (!info) return null;
	await serialize(async () => {
		const current = await getJoinedGroups();
		if (current.includes(id)) return;
		await db.settings.put({ key: KEY, value: [...current, id] });
		await touchDataModified();
	});
	return info;
}

export async function leaveGroup(id: string): Promise<void> {
	await serialize(async () => {
		const current = await getJoinedGroups();
		const next = current.filter((g) => g !== normalizeGroupCode(id));
		if (next.length === current.length) return;
		await db.settings.put({ key: KEY, value: next });
		await touchDataModified();
	});
}

let catalogCache: Record<string, GroupInfo> | null = null;

/**
 * The known groups, by id.
 *
 * Public, like everything else served here. It carries no more than
 * packages.json and events.json already do — those name the same ids — and
 * having it lets a mistyped code be refused with a clear answer instead of
 * being stored and quietly matching nothing.
 */
export async function loadGroupCatalog(): Promise<Record<string, GroupInfo>> {
	if (catalogCache) return catalogCache;
	try {
		const res = await fetch(CATALOG_URL);
		if (!res.ok) throw new Error(String(res.status));
		const raw = (await res.json()) as Record<string, Omit<GroupInfo, 'id'>>;
		catalogCache = Object.fromEntries(
			Object.entries(raw).map(([id, meta]) => [id, { ...meta, id }])
		);
	} catch {
		catalogCache = {};
	}
	return catalogCache;
}

/** Test-only: forget the fetched catalog. Mirrors _resetEventsCache(). */
export function _resetGroupCatalogCache(): void {
	catalogCache = null;
}
