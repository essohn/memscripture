/**
 * Reading a verse aloud.
 *
 * The hard part is not the speaking, it is the text handed to it. `cite` is
 * stored for the eye — `창세기 28 : 14` — and a synthesizer reads that as
 * "창세기 이십팔 콜론 십사". Bodies carry 291 `*` verse-boundary markers that
 * would be read out or turned into a stumble. Both are converted here, where
 * the shapes can be pinned against the whole corpus.
 */

/** Verse-number separators seen in the corpus. The last is U+223C, a different
 *  character from the ASCII tilde and easy to miss by eye. */
const RANGE_SEPARATORS = /[-~∼]/;

/**
 * `14` → `14절`, `9상` → `9절 상`.
 *
 * A few verses cite half a verse (`역대하 16 : 9상`); the marker is kept and
 * read after the number rather than glued to it.
 */
function verseNumber(part: string): string {
	const m = part.trim().match(/^(\d+)\s*([가-힣]*)$/);
	if (!m) return part.trim();
	return m[2] ? `${m[1]}절 ${m[2]}` : `${m[1]}절`;
}

/** One verse, or a range of them. */
function versePhrase(part: string): string {
	const ends = part.split(RANGE_SEPARATORS);
	if (ends.length === 2 && ends.every((e) => e.trim())) {
		return `${verseNumber(ends[0])}에서 ${verseNumber(ends[1])}`;
	}
	return verseNumber(part);
}

/**
 * `창세기 28 : 14` → `창세기 28장 14절`.
 *
 * Anything that does not parse falls back to the citation with its colon
 * replaced by a space: a slightly flat reading beats "콜론", and beats
 * throwing on a verse someone adds by hand.
 */
export function citeToSpeech(cite: string): string {
	const m = cite.trim().match(/^(.+?)\s*(\d+)\s*:\s*(.+)$/);
	if (!m) return cite.trim().replace(/\s*:\s*/g, ' ');
	const [, book, chapter, verses] = m;
	const spoken = verses
		.split(',')
		.map((p) => versePhrase(p))
		.filter(Boolean)
		.join(', ');
	return `${book.trim()} ${chapter}장 ${spoken}`;
}

/**
 * The verse body as it should be heard.
 *
 * `*` marks a verse boundary for the eye and means nothing aloud. Whitespace
 * is collapsed so a line break does not become a swallowed word.
 */
export function bodyToSpeech(body: string): string {
	return body.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * What to say, in order, as separate utterances.
 *
 * Separate rather than one string so the synthesizer puts a real pause between
 * the reference and the text — running them together sounds like the chapter
 * number is part of the first sentence. The title is opt-in: it is a topical
 * label, not scripture.
 */
export function speechSegments(
	verse: { title?: string; cite: string; w: string },
	opts: { includeTitle?: boolean } = {}
): string[] {
	const segments: string[] = [];
	if (opts.includeTitle && verse.title?.trim()) {
		// Titles are padded for layout (e.g. "양  육"); collapse before speaking.
		segments.push(verse.title.replace(/\s+/g, ' ').trim());
	}
	segments.push(citeToSpeech(verse.cite));
	const body = bodyToSpeech(verse.w);
	if (body) segments.push(body);
	return segments;
}

// ─── Playback ───────────────────────────────────────────────────────────────

export interface SpeakHandle {
	stop(): void;
}

export interface SpeakOptions {
	rate?: number;
	/** Keep reading the verse over and over until stopped. */
	repeat?: boolean;
	onEnd?: () => void;
}

export function isTtsSupported(): boolean {
	return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Chrome stops synthesis after roughly 15 seconds unless nudged. A long verse
 *  runs past that, so the ticker keeps it alive; it is cleared on stop. */
const KEEPALIVE_MS = 10_000;

/**
 * Speaks the segments in order, optionally on a loop.
 *
 * Utterances are chained on their own `end` rather than queued all at once:
 * queueing leaves the tail playing after a stop on some platforms, and
 * chaining is what makes repeat a two-line change instead of a queue rebuild.
 */
export function speak(segments: string[], opts: SpeakOptions = {}): SpeakHandle | null {
	if (!isTtsSupported() || segments.length === 0) return null;
	const synth = window.speechSynthesis;
	// Whatever another card was saying stops here — speechSynthesis is one
	// global queue, so two cards playing at once is not a thing that can happen.
	synth.cancel();

	let stopped = false;
	let keepalive: ReturnType<typeof setInterval> | null = null;

	function finish() {
		if (stopped) return;
		stopped = true;
		if (keepalive !== null) clearInterval(keepalive);
		opts.onEnd?.();
	}

	function say(index: number) {
		if (stopped) return;
		if (index >= segments.length) {
			if (opts.repeat) {
				say(0);
				return;
			}
			finish();
			return;
		}
		const u = new SpeechSynthesisUtterance(segments[index]);
		u.lang = 'ko-KR';
		u.rate = opts.rate ?? 1;
		u.onend = () => say(index + 1);
		// An error would otherwise leave the caller stuck showing "playing"
		// forever, the same way dictation did.
		u.onerror = () => finish();
		synth.speak(u);
	}

	keepalive = setInterval(() => {
		if (stopped) return;
		if (synth.speaking && !synth.paused) synth.resume();
	}, KEEPALIVE_MS);

	say(0);

	return {
		stop: () => {
			// Order matters: mark stopped first so the chained onend does not
			// start the next segment as cancel() tears the current one down.
			const wasStopped = stopped;
			stopped = true;
			if (keepalive !== null) clearInterval(keepalive);
			synth.cancel();
			if (!wasStopped) opts.onEnd?.();
		}
	};
}
