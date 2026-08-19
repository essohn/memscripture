/**
 * Group-scoped content.
 *
 * A package or event with no groups is for everyone; one that names groups is
 * offered only to readers who belong to one of them.
 *
 * This is visibility, not access control, and the distinction is worth being
 * plain about: the app has no server, so packages.json and events.json are
 * public files that anyone can fetch with the group codes in them. What this
 * buys is that a reader in one 지구 is not shown another 지구's schedule and
 * verse sets — relevance, not secrecy. Anything that actually needed to be
 * secret would need a backend that does not exist.
 */

/** Anything the reader can be shown or withheld. Absent or empty groups mean
 *  it belongs to no group in particular, which is to say to everyone. */
export interface GroupScoped {
	groups?: string[];
}

/**
 * Canonical form, used for storage and display: lowercase, separators unified
 * to a single hyphen.
 */
export function normalizeGroupCode(code: string): string {
	return code
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * The loose key codes are compared on: letters and digits only.
 *
 * A reader typing what they heard at a meeting writes `CDM-B`, `CDMB`,
 * `cdm b` or `cdm_b`, and every one of them means the group whose id is
 * `cdm-b`. Nobody remembers where the hyphen went, so it cannot be the thing
 * that decides whether they get in.
 */
export function groupMatchKey(code: string): string {
	return code.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
}

/**
 * The group a typed code refers to, or null.
 *
 * An exact id wins outright. Otherwise the loose key decides — but only if it
 * picks out exactly one group: dropping separators makes `cdm-b` and `cd-mb`
 * the same key, and with more than one group in the catalog that is a real
 * collision. Guessing between two groups would put a reader in the wrong 지구
 * silently, so an ambiguous code is refused like an unknown one.
 */
export function resolveGroupCode(catalogIds: string[], code: string): string | null {
	const exact = normalizeGroupCode(code);
	if (!exact) return null;
	if (catalogIds.includes(exact)) return exact;
	const key = groupMatchKey(code);
	if (!key) return null;
	const hits = catalogIds.filter((id) => groupMatchKey(id) === key);
	return hits.length === 1 ? hits[0] : null;
}

/** Whether a reader in `myGroups` may see `item`. */
export function isVisibleTo(item: GroupScoped, myGroups: string[]): boolean {
	if (!item.groups || item.groups.length === 0) return true;
	const mine = new Set(myGroups.map(groupMatchKey));
	return item.groups.some((g) => mine.has(groupMatchKey(g)));
}

export function visibleTo<T extends GroupScoped>(items: T[], myGroups: string[]): T[] {
	return items.filter((i) => isVisibleTo(i, myGroups));
}

/**
 * Which packages this reader should see.
 *
 * A group package is shown to a member, and to anyone who has actually worked
 * in it — ratings, progress, bookmarks or underlines. Nothing else earns it.
 *
 * The distinction is *used*, not *installed*, and getting that wrong once made
 * the whole gate invisible: every reader was auto-given all seven packages on
 * first launch, so "keep what is installed" kept everything for everyone.
 * Meanwhile a reader who has memorized their way through 900구절 must not lose
 * it because a boundary was drawn later — that would delete the shelf their
 * work sits on. Having worked in it is what separates the two.
 */
export function visiblePackages<T extends GroupScoped & { id: string; kind?: string }>(
	available: T[],
	myGroups: string[],
	packagesWithData: Iterable<string>
): T[] {
	const touched = new Set(packagesWithData);
	return available.filter(
		(p) => p.kind === 'user' || isVisibleTo(p, myGroups) || touched.has(p.id)
	);
}
