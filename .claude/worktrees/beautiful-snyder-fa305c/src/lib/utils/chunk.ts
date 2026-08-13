/**
 * Split a Korean Bible verse body into recall chunks for memorization.
 *
 * Primary strategy: split at Korean clause endings (-다, -라, -고, -며, -니)
 * followed by whitespace. This is lossless — joining chunks with a single
 * space reconstructs the original (modulo whitespace normalization).
 *
 * Fallback: if the primary split yields fewer than 2 chunks OR any chunk
 * exceeds `maxChunkChars`, fall back to length-based grouping at whitespace
 * boundaries (with hard-split for oversized single words).
 *
 * Post-pass: merge adjacent chunks that fall under `minChunkChars` so
 * memorization isn't fragmented into trivially short pieces. Merging never
 * exceeds `maxChunkChars`.
 */
export function splitVerseText(
	text: string,
	maxChunkChars = 40,
	minChunkChars = 10
): string[] {
	const trimmed = text.trim();
	if (!trimmed) return [];

	// Primary: split at clause endings + whitespace
	const primary = trimmed
		.split(/(?<=[다라고며니])\s+/g)
		.map((p) => p.trim())
		.filter(Boolean);

	const raw =
		primary.length >= 2 && primary.every((p) => p.length <= maxChunkChars)
			? primary
			: lengthBasedChunks(trimmed, maxChunkChars);

	return mergeShortChunks(raw, minChunkChars, maxChunkChars);
}

function lengthBasedChunks(text: string, maxChunkChars: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	if (words.length === 0) return [];
	if (words.length === 1) {
		// Hard-split a single oversized word into fixed-length pieces
		return hardSplit(words[0], maxChunkChars);
	}

	// Pre-pass: hard-split any word longer than maxChunkChars
	const expanded: string[] = [];
	for (const w of words) {
		if (w.length > maxChunkChars) expanded.push(...hardSplit(w, maxChunkChars));
		else expanded.push(w);
	}

	const chunks: string[] = [];
	let current = '';
	for (const word of expanded) {
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length > maxChunkChars && current) {
			chunks.push(current);
			current = word;
		} else {
			current = candidate;
		}
	}
	if (current) chunks.push(current);
	return chunks.length > 0 ? chunks : [text];
}

function hardSplit(word: string, maxChunkChars: number): string[] {
	const out: string[] = [];
	for (let i = 0; i < word.length; i += maxChunkChars) {
		out.push(word.slice(i, i + maxChunkChars));
	}
	return out.length > 0 ? out : [word];
}

/**
 * Split a verse body into individual whitespace-delimited words.
 * Each token (including any trailing punctuation) becomes one item.
 * Empty/whitespace-only input returns an empty array.
 */
export function splitVerseWords(text: string): string[] {
	const trimmed = text.trim();
	if (!trimmed) return [];
	return trimmed.split(/\s+/).filter(Boolean);
}

function mergeShortChunks(
	chunks: string[],
	minChunkChars: number,
	maxChunkChars: number
): string[] {
	if (chunks.length <= 1) return chunks;

	const result: string[] = [];
	let buffer = chunks[0];

	for (let i = 1; i < chunks.length; i++) {
		const next = chunks[i];
		const merged = `${buffer} ${next}`;
		if (buffer.length < minChunkChars && merged.length <= maxChunkChars) {
			buffer = merged;
		} else {
			result.push(buffer);
			buffer = next;
		}
	}

	// Final buffer: if it's too short, try merging backward into last result
	if (buffer.length < minChunkChars && result.length > 0) {
		const last = result[result.length - 1];
		const merged = `${last} ${buffer}`;
		if (merged.length <= maxChunkChars) {
			result[result.length - 1] = merged;
		} else {
			result.push(buffer);
		}
	} else {
		result.push(buffer);
	}

	return result;
}
