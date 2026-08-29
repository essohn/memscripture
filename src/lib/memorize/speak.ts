/**
 * Reading a verse aloud.
 *
 * The hard part is not the speaking, it is the text handed to it. `cite` is
 * stored for the eye — `창세기 28 : 14` — and a synthesizer reads that as
 * "창세기 이십팔 콜론 십사". Bodies carry 291 `*` verse-boundary markers that
 * would be read out or turned into a stumble. Both are converted here, where
 * the shapes can be pinned against the whole corpus.
 */

import { chapterUnit } from '$lib/bible/index';

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
	const name = book.trim();
	return `${name} ${chapter}${chapterUnit(name)} ${spoken}`;
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

// ─── Voice selection ────────────────────────────────────────────────────────

/** The shape of SpeechSynthesisVoice this module needs, so the ranking can be
 *  tested without a browser. */
export interface VoiceLike {
	name: string;
	lang: string;
	localService?: boolean;
}

/**
 * Voices worth reaching for, best first.
 *
 * The network voices — Google's on Chrome, Microsoft's Natural/Neural on Edge
 * — are neural and sound markedly better than the compact local ones. Yuna is
 * Apple's actual Korean narration voice, and gets better still if the reader
 * has downloaded its Enhanced or Premium variant.
 */
const PREFERRED_VOICES = [/Natural/i, /Neural/i, /SunHi/i, /InJoon/i, /Google/i, /Yuna/i];

/**
 * Voices that took an utterance and never spoke it, for this page's lifetime.
 *
 * The ranking above reaches for network voices first because they sound
 * markedly better. The cost is that a network voice can fail in the one way
 * the Web Speech API has no word for: `speak()` is accepted, `speaking` goes
 * true, and no `start`, `end` or `error` ever arrives. Nothing is thrown and
 * nothing is spoken.
 *
 * A voice that does that once will do it for every verse after it, so the
 * finding is remembered rather than rediscovered — 149 verses each waiting out
 * their own timeout is a hang, not playback. Held in memory only: the cause is
 * usually the network or the engine's mood, and a voice written off today
 * should get another chance on the next load.
 */
const deadVoices = new Set<string>();

/** Testing seam. Nothing in the app clears this — a reload does. */
export function forgetDeadVoices(): void {
	deadVoices.clear();
}

/**
 * How long a voice gets to make a sound before it is written off.
 *
 * Generous on purpose. A network voice has to fetch its audio, and calling a
 * slow connection dead would cost the reader the better voice for the rest of
 * the session. Long enough to be sure, short enough that nobody sits through
 * it twice.
 */
const START_TIMEOUT_MS = 3000;

/** How many voices to work through before admitting the device will not speak.
 *  The last attempt runs with no voice set at all, which is the platform's own
 *  default and the one thing left to try. */
const MAX_VOICE_ATTEMPTS = 3;

export type VoiceGender = 'male' | 'female';

/**
 * Gender by voice name, because the Web Speech API does not report it.
 *
 * Only names are available, so this is a lookup table of the Korean voices
 * actually shipped by the three platforms. Apple's eight character voices use
 * the same names in every language, so their genders hold across locales.
 * A name that is not listed reports null rather than being guessed at.
 */
const VOICE_GENDERS: { re: RegExp; gender: VoiceGender }[] = [
	// Microsoft neural — InJoon is the male one, SunHi the female.
	{ re: /InJoon/i, gender: 'male' },
	{ re: /SunHi|Heami/i, gender: 'female' },
	// Apple narration
	{ re: /^Yuna\b/i, gender: 'female' },
	// Apple character voices, best-sounding first within each gender.
	{ re: /^Reed\b/i, gender: 'male' },
	{ re: /^Rocko\b/i, gender: 'male' },
	{ re: /^Eddy\b/i, gender: 'male' },
	{ re: /^Grandpa\b/i, gender: 'male' },
	{ re: /^Flo\b/i, gender: 'female' },
	{ re: /^Sandy\b/i, gender: 'female' },
	{ re: /^Shelley\b/i, gender: 'female' },
	{ re: /^Grandma\b/i, gender: 'female' },
	// Chrome exposes exactly one Korean voice, and it is female.
	{ re: /^Google/i, gender: 'female' }
];

export function voiceGender(name: string): VoiceGender | null {
	return VOICE_GENDERS.find((g) => g.re.test(name))?.gender ?? null;
}

/** Order within a gender, so asking for a male voice still gets the best male
 *  voice rather than the first one the platform happens to list. */
function genderRank(v: VoiceLike): number {
	const at = VOICE_GENDERS.findIndex((g) => g.re.test(v.name));
	return at === -1 ? VOICE_GENDERS.length : at;
}

/**
 * Apple ships a row of character voices that are the wrong register for
 * scripture — and they sort ahead of Yuna alphabetically, so leaving the
 * choice to the platform is how a verse ends up read by "Grandpa".
 */
const NOVELTY_VOICES =
	/^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/i;

function voiceRank(v: VoiceLike): number {
	const preferred = PREFERRED_VOICES.findIndex((re) => re.test(v.name));
	if (preferred !== -1) return preferred;
	return NOVELTY_VOICES.test(v.name) ? 100 : 50;
}

/**
 * The Korean voice to read with.
 *
 * `wanted` is the reader's explicit choice and wins whenever it is still
 * installed — voices come and go with OS updates, so a stale name falls back
 * to the ranking rather than to silence.
 */
export function pickKoreanVoice<T extends VoiceLike>(
	voices: T[],
	opts: { wanted?: string; gender?: VoiceGender; exclude?: ReadonlySet<string> } = {}
): T | null {
	// Excluded before anything else, `wanted` included: a stale explicit choice
	// must not resurrect a voice already known to be silent.
	const korean = voices.filter((v) => /^ko/i.test(v.lang) && !opts.exclude?.has(v.name));
	if (korean.length === 0) return null;
	if (opts.wanted) {
		const exact = korean.find((v) => v.name === opts.wanted);
		if (exact) return exact;
	}
	// A gender preference narrows the field only when that field is not empty.
	// Not every platform ships both, and no voice at all is worse than the
	// wrong one.
	const pool = opts.gender
		? (korean.filter((v) => voiceGender(v.name) === opts.gender) ?? [])
		: korean;
	const field = pool.length > 0 ? pool : korean;
	return [...field].sort((a, b) => voiceRank(a) - voiceRank(b) || genderRank(a) - genderRank(b))[0];
}

/** Korean voices installed here, best first, for the settings picker. */
export function koreanVoices(): VoiceLike[] {
	if (!isTtsSupported()) return [];
	return window.speechSynthesis
		.getVoices()
		.filter((v) => /^ko/i.test(v.lang))
		.sort((a, b) => voiceRank(a) - voiceRank(b))
		.map((v) => ({ name: v.name, lang: v.lang, localService: v.localService }));
}

// ─── Playback ───────────────────────────────────────────────────────────────

export interface SpeakHandle {
	stop(): void;
}

export interface SpeakOptions {
	rate?: number;
	/** Reader's chosen voice name; falls back to the ranking when absent or
	 *  no longer installed. */
	voice?: string;
	/** Preferred gender, applied only when the device has such a voice. */
	gender?: VoiceGender;
	/** Keep reading the script over and over until stopped. What that means is
	 *  the caller's choice, not this file's: one verse from `VerseCard`, a
	 *  whole list from `PlaylistPlayer` — the engine loops whatever `segments`
	 *  it was handed. */
	repeat?: boolean;
	onEnd?: () => void;
}

/**
 * The playback currently holding the global speechSynthesis queue.
 *
 * There is one queue, so there is one owner. A new playback relieves the old
 * one through its own stop() rather than yanking the queue with cancel() —
 * cancel fires the outgoing utterance's `end`, which a repeating player reads
 * as "the verse finished" and answers by starting itself again. Two voices at
 * once was the symptom; this is the cause.
 */
let activeStop: (() => void) | null = null;

function claimSynth(stop: () => void): void {
	const previous = activeStop;
	// Registered before the previous owner is stopped, so that owner's own
	// release() sees it is no longer current and leaves the new one alone.
	activeStop = stop;
	if (previous !== stop) previous?.();
}

function releaseSynth(stop: () => void): void {
	if (activeStop === stop) activeStop = null;
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

	let stopped = false;
	let keepalive: ReturnType<typeof setInterval> | null = null;
	let watchdog: ReturnType<typeof setTimeout> | null = null;

	function disarmWatchdog() {
		if (watchdog === null) return;
		clearTimeout(watchdog);
		watchdog = null;
	}

	// Named rather than inline so it can be handed to claimSynth as this
	// playback's identity: the next playback relieves it by calling this.
	function stop() {
		// Order matters: mark stopped first so the chained onend does not
		// start the next segment as cancel() tears the current one down. A
		// second call must stop there: once relieved, the global queue may
		// already belong to a successor, and reaching synth.cancel() again
		// would cancel *their* utterance — the same "cancel reads as
		// finished" bug this file exists to fix, sprung from behind by a
		// stale handle instead of by another playback starting.
		const wasStopped = stopped;
		stopped = true;
		disarmWatchdog();
		if (keepalive !== null) clearInterval(keepalive);
		if (wasStopped) return;
		releaseSynth(stop);
		synth.cancel();
		opts.onEnd?.();
	}

	// Assigned before claimSynth: relieving the previous owner can run this
	// playback's own stop() synchronously — its onEnd chaining straight into
	// a new playback, whose claim reaches back and relieves this one before
	// it has spoken a word. stop() must find a real interval to clear then,
	// not null, or the timer below outlives every handle that could clear it.
	keepalive = setInterval(() => {
		if (stopped) return;
		if (synth.speaking && !synth.paused) synth.resume();
	}, KEEPALIVE_MS);

	claimSynth(stop);
	// Still guarded rather than unconditional: on iOS a cancel() immediately
	// followed by speak() in the same tick swallows the utterance, so nothing
	// is cancelled when there was nothing to cancel. claimSynth has already
	// relieved any playback this module started; this covers a queue left busy
	// by something outside it.
	//
	// Also guarded by `stopped`: claimSynth can synchronously run a chain of
	// onEnd handlers that ends with a third playback claiming the queue and
	// relieving *this* one before this line runs. Without the check, this
	// would cancel that successor's utterance out from under it — say(0)'s own
	// `if (stopped) return` already declines to speak in that case, but this
	// cancel doesn't ask first, and the result is silence instead of the third
	// playback's verse.
	if (!stopped && (synth.speaking || synth.pending)) synth.cancel();

	function finish() {
		if (stopped) return;
		stopped = true;
		if (keepalive !== null) clearInterval(keepalive);
		releaseSynth(stop);
		opts.onEnd?.();
	}

	function say(index: number, attempt = 0) {
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
		// Chosen explicitly. With only `lang` set the platform picks, and on
		// macOS the character voices sort ahead of the narration one.
		const chosen = pickKoreanVoice(synth.getVoices(), {
			wanted: opts.voice,
			gender: opts.gender,
			// The same memo the player writes to. A voice found silent while
			// reading a list is silent for a single verse too, and a reader who
			// hits the speaker button next should not wait it out again.
			exclude: deadVoices
		});
		if (chosen) u.voice = chosen as SpeechSynthesisVoice;
		u.rate = opts.rate ?? 1;
		let started = false;
		u.onstart = () => {
			started = true;
			disarmWatchdog();
		};
		u.onend = () => {
			disarmWatchdog();
			say(index + 1);
		};
		// An error would otherwise leave the caller stuck showing "playing"
		// forever, the same way dictation did.
		u.onerror = () => {
			disarmWatchdog();
			finish();
		};
		disarmWatchdog();
		synth.speak(u);
		// The failure the API has no event for: accepted, `speaking` true, and
		// then nothing at all. Without this the button reads as playing forever
		// and the reader is left wondering whether they pressed it.
		watchdog = setTimeout(() => {
			watchdog = null;
			if (stopped || started) return;
			if (chosen) deadVoices.add(chosen.name);
			if (attempt + 1 >= MAX_VOICE_ATTEMPTS) {
				finish();
				return;
			}
			// Silenced before the cancel. Chrome fires `end` on whatever is
			// cancelled, and this utterance's own handler would read that as
			// the verse having been read and move to the next one — turning a
			// retry into a skip.
			u.onend = null;
			u.onerror = null;
			synth.cancel();
			say(index, attempt + 1);
		}, START_TIMEOUT_MS);
	}

	say(0);

	return { stop };
}

// ─── Player ─────────────────────────────────────────────────────────────────

/**
 * Korean characters spoken per second at rate 1.0.
 *
 * Only an estimate, and only needed where the browser withholds the truth:
 * Chrome reports real `boundary` events and the bar follows those exactly,
 * but iOS Safari fires none, so without a fallback the bar would sit still
 * through the whole verse.
 */
const CHARS_PER_SECOND = 5.5;

export function estimateDurationMs(text: string, rate = 1): number {
	const chars = text.replace(/\s+/g, '').length;
	if (chars === 0) return 0;
	return Math.round((chars / (CHARS_PER_SECOND * Math.max(rate, 0.1))) * 1000);
}

/** Characters in the whole script, which is what a progress fraction is of. */
export function totalChars(segments: string[]): number {
	return segments.reduce((n, s) => n + s.length, 0);
}

/** Every silence the script will sit through, so a runtime can include them. */
function totalGapMs(
	segments: string[],
	gapBefore: ((text: string, offset: number) => number) | undefined
): number {
	if (!gapBefore) return 0;
	let offset = 0;
	let total = 0;
	for (const seg of segments) {
		total += gapBefore(seg, offset);
		offset += seg.length;
	}
	return total;
}

/**
 * The script from a character offset onward, snapped back to the start of the
 * word the offset lands in.
 *
 * Snapping backward rather than forward means a seek plays the word you landed
 * on rather than skipping it — and never starts mid-syllable, which in Korean
 * is not a sound anyone wants to hear.
 */
export function sliceFrom(segments: string[], offset: number): string[] {
	if (offset <= 0) return [...segments];
	let seen = 0;
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		if (offset < seen + seg.length) {
			const within = offset - seen;
			const head = seg.slice(0, within);
			const wordStart = /\s/.test(seg[within] ?? '') ? within : head.lastIndexOf(' ') + 1;
			return [seg.slice(wordStart).trimStart(), ...segments.slice(i + 1)].filter(Boolean);
		}
		seen += seg.length;
	}
	return [];
}

/**
 * Where the segment containing `offset` ends, as a character offset.
 *
 * The companion to sliceFrom: that one says what is left to speak from here,
 * this one says how far the next utterance should advance the cursor. Read off
 * the segment boundaries rather than off the utterance that was spoken,
 * because sliceFrom trims a mid-segment start back to a word boundary — adding
 * the spoken text's length would leave the cursor short of the boundary and
 * replay the tail of a verse already read.
 */
export function segmentEnd(segments: string[], offset: number): number {
	let seen = 0;
	for (const seg of segments) {
		seen += seg.length;
		if (offset < seen) return seen;
	}
	return seen;
}

export interface PlayerProgress {
	/** 0..1 through the whole script. */
	fraction: number;
	/** In a deliberate silence before the next segment rather than speaking.
	 *  The bar has no characters to follow through one, so it says so instead
	 *  of looking stuck. */
	waiting: boolean;
	/** 0..1 through that silence, and 0 whenever there is not one. The script
	 *  has not moved, so this is its own measure rather than part of
	 *  `fraction` — but something has to be seen moving, or a silence is
	 *  indistinguishable from a player that has died. */
	waitFraction: number;
	elapsedMs: number;
	totalMs: number;
}

export interface PlayerHandle {
	pause(): void;
	resume(): void;
	/** Jump to a fraction of the script and carry on from there. */
	seek(fraction: number): void;
	stop(): void;
}

export interface PlayerOptions extends SpeakOptions {
	onProgress?: (p: PlayerProgress) => void;
	/** No voice on this device would speak. Fired instead of a completed run,
	 *  so the caller can say so rather than showing a finished bar. */
	onFailure?: () => void;
	/**
	 * Milliseconds of silence to leave before the segment starting at `offset`.
	 *
	 * The engine only knows how to wait; what is worth waiting for is the
	 * caller's business — 따라 읽기 asks for a pause in front of each verse
	 * body, long enough to say it from memory first. Returning 0, or leaving
	 * this out, plays straight through.
	 */
	gapBefore?: (text: string, offset: number) => number;
}

/**
 * Playback with a position — the difference between a speaker button and a
 * player.
 *
 * The Web Speech API has no seek and no reliable pause on iOS, so both are
 * built the same way: stop, and start again from a character offset. That one
 * mechanism covers seeking, resuming, and repeating, and behaves identically
 * on every platform rather than only where pause() happens to work.
 */
export function createPlayer(segments: string[], opts: PlayerOptions = {}): PlayerHandle | null {
	if (!isTtsSupported() || segments.length === 0) return null;
	const synth = window.speechSynthesis;

	const chars = totalChars(segments);
	// The silences are playback too. Left out, the bar counts up past its own
	// total on every verse of 따라 읽기 — and byClock, which divides by this,
	// would believe the script twice over by the time it was half read.
	const totalMs =
		estimateDurationMs(segments.join(' '), opts.rate ?? 1) + totalGapMs(segments, opts.gapBefore);

	/** Characters completed before the current utterance began. */
	let baseOffset = 0;
	/** Position within the current utterance, from boundary events. */
	let charInUtterance = 0;
	let startedAt = 0;
	let elapsedBefore = 0;
	let stopped = false;
	let paused = false;
	/** Whether the utterance on the queue has actually made a sound. */
	let speaking = false;
	let waiting = false;
	let gapStartedAt = 0;
	let gapMs = 0;
	let watchdog: ReturnType<typeof setTimeout> | null = null;
	let gapTimer: ReturnType<typeof setTimeout> | null = null;
	let ticker: ReturnType<typeof setInterval> | null = null;
	let keepalive: ReturnType<typeof setInterval> | null = null;
	let current: SpeechSynthesisUtterance | null = null;

	function elapsed(): number {
		return paused || stopped ? elapsedBefore : elapsedBefore + (Date.now() - startedAt);
	}

	function report() {
		// Boundary events give the truth where they exist; elsewhere the clock
		// carries the bar. Whichever is further along is the honest one, since a
		// missing boundary event never means we went backwards.
		const byChars = chars > 0 ? (baseOffset + charInUtterance) / chars : 0;
		// Only while something is actually being spoken. The clock is here for
		// iOS, which fires no boundary events — but it ran just as happily
		// through an utterance the engine accepted and never voiced, and with
		// finish() reporting a full bar, a silent failure drew exactly what a
		// completed playlist draws. That bar is why this went two days
		// undiagnosed: there was nothing on screen that said "no sound".
		const byClock = speaking && totalMs > 0 ? elapsed() / totalMs : 0;
		// The clock is an estimate and the segment on the queue is a fact.
		// Whatever the estimate believes, playback cannot have gone further than
		// the end of what is being spoken — and when the estimate runs fast, the
		// title line names a verse ahead of the one in the reader's ears.
		const reach = chars > 0 ? segmentEnd(segments, baseOffset) / chars : 1;
		opts.onProgress?.({
			fraction: Math.min(reach, Math.max(byChars, byClock)),
			waiting,
			waitFraction:
				waiting && gapMs > 0 ? Math.min(1, (Date.now() - gapStartedAt) / gapMs) : 0,
			elapsedMs: elapsed(),
			totalMs
		});
	}

	/**
	 * Silences the outgoing utterance before the synth is cancelled.
	 *
	 * cancel() fires `end` on whatever is speaking. Inside playFrom that
	 * utterance is our own, one line from being replaced — and its handler
	 * would read the cancel as "the script finished" and, with repeat armed,
	 * throw the reader back to offset 0 instead of to where they scrubbed.
	 */
	function detachCurrent() {
		if (!current) return;
		current.onstart = null;
		current.onend = null;
		current.onboundary = null;
		current.onerror = null;
	}

	function disarmWatchdog() {
		if (watchdog === null) return;
		clearTimeout(watchdog);
		watchdog = null;
	}
	function cancelGap() {
		waiting = false;
		gapMs = 0;
		if (gapTimer === null) return;
		clearTimeout(gapTimer);
		gapTimer = null;
	}

	function playFrom(
		offset: number,
		{
			chained = false,
			attempt = 0,
			waited = false
		}: { chained?: boolean; attempt?: number; waited?: boolean } = {}
	) {
		if (stopped) return;
		const rest = sliceFrom(segments, offset);
		if (rest.length === 0) {
			finish();
			return;
		}
		baseOffset = offset;
		charInUtterance = 0;
		// One utterance per segment, not one for the whole remainder.
		//
		// Handing the platform the entire script was simpler arithmetic —
		// boundary charIndex is per utterance, so a single utterance kept the
		// offset in one place — but Chrome will not speak one that size. The
		// shipped 암송 DAY is 149 verses and ~12,000 characters, and Chrome
		// accepts it, reports `speaking` true, then never fires start, end or
		// error: 전체 듣기 was silent, and the engine stayed wedged for
		// everything that came after it, per-verse playback included. iOS
		// happened to tolerate it, which is one platform's luck rather than a
		// promise any of them make.
		//
		// The cursor advances by segment boundaries instead (segmentEnd), so
		// charIndex stays per utterance exactly as before — it is just a
		// smaller utterance now. This is what speak() has always done.
		const head = rest[0];
		// Asked once per arrival at a segment, not again after the wait. A seek
		// that lands mid-body arrives at an offset no gap is registered for, so
		// scrubbing into a verse plays it rather than pausing first.
		const gap = waited ? 0 : (opts.gapBefore?.(head, offset) ?? 0);
		if (gap > 0) {
			waiting = true;
			gapStartedAt = Date.now();
			gapMs = gap;
			report();
			gapTimer = setTimeout(() => {
				gapTimer = null;
				if (stopped || paused) return;
				playFrom(offset, { chained, attempt, waited: true });
			}, gap);
			return;
		}
		waiting = false;
		gapMs = 0;
		const end = segmentEnd(segments, offset);
		const u = new SpeechSynthesisUtterance(head);
		u.lang = 'ko-KR';
		const chosen = pickKoreanVoice(synth.getVoices(), {
			wanted: opts.voice,
			gender: opts.gender,
			exclude: deadVoices
		});
		if (chosen) u.voice = chosen as SpeechSynthesisVoice;
		u.rate = opts.rate ?? 1;
		speaking = false;
		u.onstart = () => {
			speaking = true;
			disarmWatchdog();
		};
		u.onboundary = (e) => {
			charInUtterance = e.charIndex ?? 0;
			report();
		};
		u.onend = () => {
			disarmWatchdog();
			if (stopped || paused) return;
			// More script left: straight on to the next verse. Chained rather
			// than queued for the reason speak() chains — a queue leaves the
			// tail playing after a stop on some platforms.
			if (end < chars) {
				playFrom(end, { chained: true });
				return;
			}
			if (opts.repeat) {
				elapsedBefore = 0;
				startedAt = Date.now();
				playFrom(0, { chained: true });
				return;
			}
			finish();
		};
		u.onerror = () => {
			disarmWatchdog();
			// Not finish(): an error is not an ending, and reporting one drew a
			// full bar over a verse nobody heard.
			giveUp();
		};
		detachCurrent();
		disarmWatchdog();
		current = u;
		// Not when chaining. The utterance that just ended left the queue empty,
		// and a cancel() immediately followed by speak() in the same tick is
		// swallowed on iOS — which would end the script at verse one on the
		// platform that was working before this change.
		if (!chained && (synth.speaking || synth.pending)) synth.cancel();
		synth.speak(u);
		// Armed after speak(), because a voice that works answers within this
		// window and disarms it. One that does not has taken the utterance and
		// gone quiet — the failure the API has no event for.
		watchdog = setTimeout(() => {
			watchdog = null;
			if (stopped || paused || speaking) return;
			if (chosen) deadVoices.add(chosen.name);
			if (attempt + 1 >= MAX_VOICE_ATTEMPTS) {
				giveUp();
				return;
			}
			// Not chained: the dead utterance is still on the queue and has to
			// be cleared before the next voice gets a turn. detachCurrent has
			// already silenced its handlers, so the cancel cannot be read as a
			// verse that finished.
			playFrom(offset, { attempt: attempt + 1 });
		}, START_TIMEOUT_MS);
	}

	/**
	 * Ends the run without claiming it played.
	 *
	 * The bar is left where the sound stopped rather than being filled in, and
	 * onFailure fires so the caller can say what happened. finish() means the
	 * script was read; this means the device would not read it.
	 */
	function giveUp() {
		if (stopped) return;
		stopped = true;
		disarmWatchdog();
		cancelGap();
		if (ticker !== null) clearInterval(ticker);
		if (keepalive !== null) clearInterval(keepalive);
		releaseSynth(stop);
		opts.onFailure?.();
		opts.onEnd?.();
	}

	function finish() {
		if (stopped) return;
		stopped = true;
		disarmWatchdog();
		cancelGap();
		if (ticker !== null) clearInterval(ticker);
		if (keepalive !== null) clearInterval(keepalive);
		releaseSynth(stop);
		opts.onProgress?.({
			fraction: 1,
			waiting: false,
			waitFraction: 0,
			elapsedMs: totalMs,
			totalMs
		});
		opts.onEnd?.();
	}

	// Named for the same reason speak()'s is: this is the handle claimSynth
	// holds, and the way the next playback relieves this one.
	function stop() {
		if (stopped) return;
		stopped = true;
		disarmWatchdog();
		cancelGap();
		if (ticker !== null) clearInterval(ticker);
		if (keepalive !== null) clearInterval(keepalive);
		releaseSynth(stop);
		detachCurrent();
		synth.cancel();
		current = null;
		opts.onEnd?.();
	}

	ticker = setInterval(() => {
		if (!stopped && !paused) report();
	}, 200);

	// Same platform fact speak()'s keepalive above is for — Chrome drops
	// synthesis after roughly 15 seconds unless resume() is called — and a
	// 전체 듣기 script runs to tens of minutes, so it is crossed many times
	// over even now that each utterance is a single verse. A long verse alone
	// can reach the cliff.
	//
	// It matters more here than it does for speak() because speakListRepeat
	// defaults on, so a synthesis that dies mid-script does not go quiet: the
	// onend below reads the silence as "that verse finished" and moves on, and
	// at the end of the script it starts over. What a reader would hear is the
	// list marching on without sound while the bar's clock keeps climbing.
	//
	// resume() on a synth that is not paused is a no-op, so this is inert if
	// the platform ever stops needing it. A second interval rather than folding
	// into the 200ms ticker above: the nudge cadence is a platform constant,
	// not a UI refresh rate, and tying the two together would make a future
	// change to report()'s frequency silently change this too.
	keepalive = setInterval(() => {
		if (stopped || paused) return;
		if (synth.speaking && !synth.paused) synth.resume();
	}, KEEPALIVE_MS);

	claimSynth(stop);
	startedAt = Date.now();
	playFrom(0);

	return {
		pause() {
			if (stopped || paused) return;
			paused = true;
			elapsedBefore += Date.now() - startedAt;
			detachCurrent();
			synth.cancel();
			report();
		},
		resume() {
			if (stopped || !paused) return;
			paused = false;
			startedAt = Date.now();
			playFrom(baseOffset + charInUtterance);
		},
		seek(fraction) {
			if (stopped) return;
			const clamped = Math.min(1, Math.max(0, fraction));
			elapsedBefore = Math.round(totalMs * clamped);
			startedAt = Date.now();
			const offset = Math.round(chars * clamped);
			if (paused) {
				baseOffset = offset;
				charInUtterance = 0;
				report();
				return;
			}
			playFrom(offset);
			report();
		},
		stop
	};
}

/**
 * How many voices this device reports at all, Korean or not.
 *
 * Only ever shown as a diagnostic. "No Korean voice" and "no voices at all"
 * are different faults with different fixes — the first is a missing language
 * pack, the second is a device whose speech engine never woke up — and the
 * settings screen cannot tell the reader which one they have without this.
 */
export function installedVoiceCount(): number {
	if (!isTtsSupported()) return 0;
	return window.speechSynthesis.getVoices().length;
}

/** How long to keep asking for the voice list before giving up. */
export const VOICE_POLL_MS = 400;
export const VOICE_POLL_LIMIT = 10;

/**
 * Keep asking until the voice list arrives.
 *
 * `voiceschanged` is the documented way and is enough on a desktop. On Android
 * the engine warms up out of band: getVoices() is empty at load, and the event
 * either fires before anything is listening or does not fire at all — which
 * leaves the settings screen believing the device has no Korean voice and
 * hiding the picker, on exactly the devices whose reader has been told to go
 * and use it.
 *
 * Stops at the first non-empty answer, and gives up after a few seconds rather
 * than polling a device that genuinely has nothing to report.
 *
 * The clock and the reader are injected so this can be tested without either.
 */
export function pollForVoices(opts: {
	read: () => VoiceLike[];
	emit: (voices: VoiceLike[]) => void;
	schedule: (fn: () => void, ms: number) => number;
	cancel: (id: number) => void;
	limit?: number;
}): () => void {
	const limit = opts.limit ?? VOICE_POLL_LIMIT;
	let tries = 0;
	let timer: number | null = null;

	const tick = () => {
		timer = null;
		const voices = opts.read();
		if (voices.length > 0) {
			opts.emit(voices);
			return;
		}
		if (++tries >= limit) return;
		timer = opts.schedule(tick, VOICE_POLL_MS);
	};

	// The first read is immediate: a desktop has the list already and must not
	// wait out a poll interval to show it.
	tick();

	return () => {
		if (timer !== null) opts.cancel(timer);
		timer = null;
	};
}
