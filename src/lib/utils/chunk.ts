/**
 * Split a Korean Bible verse body into recall chunks for memorization.
 *
 * Primary strategy: split at Korean clause endings (-다, -라, -고, -며, -니)
 * followed by whitespace. This is lossless — joining chunks with a single
 * space reconstructs the original (modulo whitespace normalization).
 *
 * Fallback: if the primary split yields fewer than 2 chunks OR any chunk
 * exceeds `maxChunkChars`, fall back to length-based grouping at whitespace
 * boundaries.
 */
export function splitVerseText(text: string, maxChunkChars = 40): string[] {
	const trimmed = text.trim();
	if (!trimmed) return [];

	// Primary: split at clause endings + whitespace
	const primary = trimmed
		.split(/(?<=[다라고며니])\s+/g)
		.map((p) => p.trim())
		.filter(Boolean);

	if (primary.length >= 2 && primary.every((p) => p.length <= maxChunkChars)) {
		return primary;
	}

	// Fallback: length-based grouping at word boundaries
	const words = trimmed.split(/\s+/).filter(Boolean);
	if (words.length === 0) return [];

	// Hard-split any word that itself exceeds maxChunkChars
	const tokens: string[] = [];
	for (const word of words) {
		if (word.length <= maxChunkChars) {
			tokens.push(word);
		} else {
			for (let i = 0; i < word.length; i += maxChunkChars) {
				tokens.push(word.slice(i, i + maxChunkChars));
			}
		}
	}

	if (tokens.length === 1) return [tokens[0]];

	const chunks: string[] = [];
	let current = '';
	for (const token of tokens) {
		const candidate = current ? `${current} ${token}` : token;
		if (candidate.length > maxChunkChars && current) {
			chunks.push(current);
			current = token;
		} else {
			current = candidate;
		}
	}
	if (current) chunks.push(current);
	return chunks.length > 0 ? chunks : [trimmed];
}
