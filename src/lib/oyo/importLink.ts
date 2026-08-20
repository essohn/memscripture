import { formatStandardRef, parsePassageRef } from '$lib/bible/index';

/**
 * The hand-off contract for verses arriving from another app — today the
 * reader at bible.lifescripture.org, tomorrow anything that can build a URL.
 *
 * A link, not a network call, because this app has no server: it is a static
 * SPA whose only store is the IndexedDB on the device. There is nowhere for a
 * POST to land. A link also costs the sender nothing (no CORS, no popup, no
 * handshake), opens the installed PWA on both phone platforms, and works
 * identically on a desktop.
 *
 * The payload rides in the URL *fragment* rather than the query string. A
 * fragment is never sent to the server, so scripture text does not end up in
 * Cloudflare's request logs on its way to a device that already has it.
 *
 *   https://mem.lifescripture.org/oyo/import#v=<base64 of the JSON below>
 *
 *   { "v": 1,
 *     "source": "bible.lifescripture.org",     // optional, shown to the reader
 *     "verses": [ { "cite": "창세기 12 : 1", "w": "…", "title": "…" } ] }
 *
 * An OYO verse is three things — 제목, 장절, 본문 — and all three have to be
 * there. The sender owns two of them: `cite` and `w` are both required, and a
 * row missing either is dropped rather than imported half-formed. `title` is
 * the reader's to give: the sender may suggest one, but the import screen is
 * where it is settled, and nothing is saved until every chosen row has one.
 */

export const IMPORT_VERSION = 1;

/** Guards a hand-built or truncated link. Well past any real selection — a
 *  chapter of Psalm 119 is 176 verses — while still bounding the work a
 *  single tap can queue up. */
export const MAX_IMPORT_VERSES = 200;

export interface ImportVerse {
	cite: string;
	/** What the sender suggested, or null when it said nothing. The reader
	 *  settles it on the import screen either way. */
	title: string | null;
	w: string;
}

export interface ImportPayload {
	source: string | null;
	verses: ImportVerse[];
}

export type ImportResult =
	| { ok: true; payload: ImportPayload }
	/** Every failure a reader can be told something useful about. The link is
	 *  machine-built, so these are for a truncated paste or a stale sender —
	 *  not for a user typo. */
	| { ok: false; reason: 'missing' | 'malformed' | 'version' | 'empty' | 'too-many' };

/**
 * Decodes the base64 payload.
 *
 * Accepts standard base64 and base64url alike: the obvious sender-side one
 * liner is `btoa(...)`, which emits `+/=`, but anything that reaches for a
 * URL-safe encoder emits `-_` instead, and a receiver that only understood
 * one of them would fail on a link that looks perfectly correct.
 *
 * Decoded as UTF-8 rather than through `atob` alone — `atob` yields one byte
 * per character, which turns every Korean syllable into mojibake.
 */
function decodeBase64Utf8(raw: string): string | null {
	const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
	// atob rejects a string whose length is not a multiple of four, which is
	// exactly what a URL-safe encoder produces when it strips the padding.
	const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
	try {
		const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
		return new TextDecoder().decode(bytes);
	} catch {
		return null;
	}
}

/** Pulls the payload parameter out of a location hash. Tolerates the leading
 *  `#`, and a hash carrying more than one parameter. */
export function readFragmentParam(hash: string): string | null {
	const params = new URLSearchParams(hash.replace(/^#/, ''));
	const v = params.get('v');
	return v && v.length > 0 ? v : null;
}

function cleanText(value: unknown): string {
	return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/**
 * Rewrites an incoming citation into this project's standard shape, so an
 * imported verse is indistinguishable from one added by hand — "창 12:1" and
 * "창세기 12 : 1" both become the latter.
 *
 * A citation this app cannot parse is kept verbatim rather than rejected.
 * The sender may know about a book naming this one does not, and a verse
 * whose reference reads oddly is worth far more than no verse at all.
 */
export function normalizeCite(cite: string): string {
	const trimmed = cleanText(cite);
	const parsed = parsePassageRef(trimmed);
	return parsed ? formatStandardRef(parsed) : trimmed;
}

/** Parses one entry, or null when it is not a whole verse. */
function parseVerse(raw: unknown): ImportVerse | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	const w = cleanText(r.w);
	const cite = normalizeCite(typeof r.cite === 'string' ? r.cite : '');
	// Both, not either. The body is the verse and the citation is how it is
	// found again — a row missing one of them is not a verse this app can
	// hold, and importing it would leave a card the reader has to repair.
	if (w.length === 0 || cite.length === 0) return null;
	return { cite, title: cleanText(r.title) || null, w };
}

/**
 * Turns a link's fragment into verses, or says why it cannot.
 *
 * Lenient about individual rows and strict about the envelope: a sender that
 * gets the version wrong is speaking a protocol this code does not know, but
 * one bad row among twenty should not cost the reader the other nineteen.
 */
export function parseImportFragment(hash: string): ImportResult {
	const encoded = readFragmentParam(hash);
	if (encoded === null) return { ok: false, reason: 'missing' };

	// decodeURIComponent because the obvious sender-side one liner wraps the
	// base64 in it; a payload that was not wrapped survives unchanged.
	let decoded: string | null;
	try {
		decoded = decodeBase64Utf8(decodeURIComponent(encoded));
	} catch {
		decoded = decodeBase64Utf8(encoded);
	}
	if (decoded === null) return { ok: false, reason: 'malformed' };

	let json: unknown;
	try {
		json = JSON.parse(decoded);
	} catch {
		return { ok: false, reason: 'malformed' };
	}
	if (!json || typeof json !== 'object') return { ok: false, reason: 'malformed' };

	const body = json as Record<string, unknown>;
	if (body.v !== IMPORT_VERSION) return { ok: false, reason: 'version' };
	if (!Array.isArray(body.verses)) return { ok: false, reason: 'malformed' };
	if (body.verses.length > MAX_IMPORT_VERSES) return { ok: false, reason: 'too-many' };

	const verses = body.verses.map(parseVerse).filter((v): v is ImportVerse => v !== null);
	if (verses.length === 0) return { ok: false, reason: 'empty' };

	return {
		ok: true,
		payload: { source: cleanText(body.source) || null, verses }
	};
}

/**
 * Builds a link. Not used by this app — it is the receiver — but it is the
 * executable half of the contract: the sender's encoding is verified here by
 * a round-trip test rather than by a paragraph of prose in a document that
 * can drift from the parser.
 */
export function buildImportLink(origin: string, payload: ImportPayload): string {
	const json = JSON.stringify({
		v: IMPORT_VERSION,
		source: payload.source ?? undefined,
		verses: payload.verses.map((v) => ({
			cite: v.cite,
			w: v.w,
			// Omitted rather than sent as null: a receiver reading the documented
			// shape should never have to special-case a key that means "absent".
			...(v.title ? { title: v.title } : {})
		}))
	});
	const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
	return `${origin}/oyo/import#v=${encodeURIComponent(base64)}`;
}

/**
 * Which incoming rows the reader already has.
 *
 * Matched on the citation alone, not the body: the point is to stop a second
 * tap on the same link from producing twins, and two rows with the same
 * reference are the same verse whatever whitespace differs. Both sides go
 * through normalizeCite so a hand-typed "창 12:1" matches an imported
 * "창세기 12 : 1".
 *
 * Returns indexes rather than filtering, because the screen still shows a
 * duplicate — unchecked, and labelled — instead of silently dropping a row
 * the reader chose to send.
 */
export function duplicateIndexes(verses: ImportVerse[], existingCites: string[]): Set<number> {
	const have = new Set(existingCites.map(normalizeCite).filter((c) => c.length > 0));
	const out = new Set<number>();
	verses.forEach((v, i) => {
		if (have.has(v.cite)) out.add(i);
	});
	return out;
}

/**
 * Which chosen rows still have no title.
 *
 * The citation is not a fallback. It answers "which verse is this", which the
 * row already shows on its own line; a heading that merely repeats it names
 * nothing. 제목 is the one of the three fields the reader supplies, so the
 * import waits for it rather than inventing one.
 *
 * Only chosen rows count — a row nobody is importing has nothing to name.
 */
export function untitledRows(chosen: Iterable<number>, titles: string[]): number[] {
	return [...chosen].filter((i) => (titles[i] ?? '').trim().length === 0).sort((a, b) => a - b);
}
