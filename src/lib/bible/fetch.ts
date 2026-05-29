// Fetches KRV scripture text from bolls.life by chapter, caches per chapter,
// and joins requested verses into a single space-separated string for the
// OYO 본문 autofill flow.
//
// Adapted from qtpassage's bible-fetch.ts. We only use KRV here — multi-
// translation support belongs in qtpassage, not the OYO notebook.

import type { ParsedRef } from './index';

const API_BASE = 'https://bolls.life/get-text';

interface RawVerse {
	verse: number;
	text: string;
}

const chapterCache = new Map<string, RawVerse[]>();

function stripVerseHtml(raw: string): string {
	// bolls.life sometimes wraps Strong's number references in <S>…</S>; KRV
	// doesn't use them today, but the defensive strip costs nothing and
	// keeps the parser robust to upstream changes.
	return raw
		.replace(/<S>[^<]*<\/S>/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

async function fetchChapter(bookId: number, chapter: number): Promise<RawVerse[]> {
	const key = `${bookId}:${chapter}`;
	const cached = chapterCache.get(key);
	if (cached) return cached;

	const url = `${API_BASE}/KRV/${bookId}/${chapter}/`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`fetch chapter ${key}: HTTP ${res.status}`);
	const data = (await res.json()) as RawVerse[];
	chapterCache.set(key, data);
	return data;
}

/**
 * Fetches the KRV text for the given parsed reference and returns it as a
 * single string. Verses inside the range are joined with single spaces.
 *
 * - When `startVerse` is null (chapter-only reference), the whole chapter
 *   is returned.
 * - When `endVerse` is null, it defaults to `startVerse` (single verse).
 *
 * Caches the chapter response in-memory so subsequent lookups inside the
 * same session don't re-hit the network.
 */
export async function fetchPassageText(parsed: ParsedRef): Promise<string> {
	const chapter = await fetchChapter(parsed.bookId, parsed.chapter);
	if (parsed.startVerse === null) {
		return chapter
			.map((v) => stripVerseHtml(v.text))
			.filter((s) => s.length > 0)
			.join(' ');
	}
	const end = parsed.endVerse ?? parsed.startVerse;
	return chapter
		.filter((v) => v.verse >= parsed.startVerse! && v.verse <= end)
		.map((v) => stripVerseHtml(v.text))
		.filter((s) => s.length > 0)
		.join(' ');
}

/** Test seam: lets unit tests prime the cache without touching `fetch`. */
export function __setChapterCacheForTest(
	bookId: number,
	chapter: number,
	verses: RawVerse[]
): void {
	chapterCache.set(`${bookId}:${chapter}`, verses);
}

/** Test seam: clears the in-memory cache between tests. */
export function __clearChapterCacheForTest(): void {
	chapterCache.clear();
}
