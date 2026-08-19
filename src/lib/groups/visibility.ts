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
 * Codes are compared loosely: a reader typing what they heard at a meeting
 * writes `CDM-B`, `cdm b` or `cdm_b`, and all three mean the group whose id is
 * `cdm-b`. Only the stored ids are canonical.
 */
export function normalizeGroupCode(code: string): string {
	return code
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

/** Whether a reader in `myGroups` may see `item`. */
export function isVisibleTo(item: GroupScoped, myGroups: string[]): boolean {
	if (!item.groups || item.groups.length === 0) return true;
	const mine = new Set(myGroups.map(normalizeGroupCode));
	return item.groups.some((g) => mine.has(normalizeGroupCode(g)));
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
