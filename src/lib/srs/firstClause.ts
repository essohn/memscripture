/**
 * Extracts a "first clause" preview from a verse body — used as the Stage 2 cue
 * in the daily review card. Heuristic: roughly first 1/3 of space-separated tokens,
 * clamped to [3, 8].
 *
 * @param text  Full verse text (verse.w in the StoredVerse type).
 * @param override  If provided, returned verbatim. Seam for future v.first_clause data.
 */
export function extractFirstClause(text: string, override?: string): string {
	if (override !== undefined) return override;
	const tokens = text.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return '';
	const target = Math.ceil(tokens.length / 3);
	const count = Math.min(Math.max(target, 3), 8);
	return tokens.slice(0, Math.min(count, tokens.length)).join(' ');
}
