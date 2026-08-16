/**
 * Dictation for the check panel, on top of the Web Speech API.
 *
 * Speech feeds the input box; it never feeds the grader directly. Recognition
 * is trained on modern Korean and the corpus is 개역한글 — 편만할지며,
 * 착념하라, 깨닫게 하매 — so a clean recitation comes back misheard often
 * enough that scoring it would mark a reader down for the recognizer's
 * mistakes. Putting the text in the box first lets them see the mishearing and
 * fix it, which keeps the rating about memory.
 */

/** The slice of the Web Speech API this module uses. Declared here because it
 *  is not in every TypeScript DOM lib, and because a narrow shape is easier to
 *  fake in a test than the real interface. */
export interface SpeechChunk {
	transcript: string;
	/** Settled text. Interim chunks are replaced by later results. */
	isFinal: boolean;
}

interface RecognitionLike {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	start(): void;
	stop(): void;
	abort(): void;
	onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
	onerror: ((e: { error: string }) => void) | null;
	onend: (() => void) | null;
}

type RecognitionCtor = new () => RecognitionLike;

function ctor(): RecognitionCtor | null {
	if (typeof window === 'undefined') return null;
	const w = window as unknown as {
		SpeechRecognition?: RecognitionCtor;
		webkitSpeechRecognition?: RecognitionCtor;
	};
	// Safari and older Chrome only expose the prefixed name.
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Whether dictation can run at all. False on Firefox, which ships no
 *  implementation — the button is hidden rather than offered and then failing. */
export function isSpeechSupported(): boolean {
	return ctor() !== null;
}

/**
 * Splits recognition chunks into the settled text and the tail still being
 * revised.
 *
 * They are kept apart because only the settled part may be committed: an
 * interim chunk is replaced wholesale by the next result, so appending it
 * would duplicate every phrase as it firms up.
 */
export function splitTranscript(chunks: SpeechChunk[]): { final: string; interim: string } {
	let final = '';
	let interim = '';
	for (const c of chunks) {
		if (c.isFinal) final += c.transcript;
		else interim += c.transcript;
	}
	return { final: final.trim(), interim: interim.trim() };
}

/**
 * Joins what the reader already had with what they just said.
 *
 * Dictation adds to the attempt rather than replacing it, so a reader can type
 * the part they are sure of, speak the rest, and then correct by hand. Exactly
 * one space joins the two, and an empty side contributes no space at all —
 * spacing is invisible to the grader but very visible in the box.
 */
export function joinSpoken(base: string, spoken: string): string {
	const a = base.trimEnd();
	const b = spoken.trim();
	if (!a) return b;
	if (!b) return a;
	return `${a} ${b}`;
}

export interface SpeechSession {
	stop(): void;
}

/**
 * Accumulates a transcript across recognition sessions.
 *
 * iOS Safari ends recognition after each utterance, so a verse recited in more
 * than one breath arrives as several sessions. Each one's `results` starts
 * empty, so without folding the finished session into a running total the
 * second utterance would replace the first instead of continuing it.
 */
export function createTranscript() {
	let committed = '';
	let session = '';
	return {
		/** Text for the results just received, including the interim tail. */
		update(chunks: SpeechChunk[]): string {
			const { final, interim } = splitTranscript(chunks);
			session = final;
			return joinSpoken(committed, joinSpoken(final, interim));
		},
		/** Folds the finished session in so a restart continues from it. */
		endSession(): void {
			committed = joinSpoken(committed, session);
			session = '';
		},
		text(): string {
			return joinSpoken(committed, session);
		}
	};
}

/** How many times a session may restart before we conclude it is looping
 *  rather than listening. A long verse with thinking pauses needs a good few;
 *  a recognizer that ends instantly every time needs to be stopped. */
const MAX_RESTARTS = 20;

export interface SpeechHandlers {
	/** Fired on every result with the full text so far — settled plus the tail
	 *  currently being revised — so the box can show speech as it lands. */
	onText: (text: string) => void;
	/** Recognition stopped, whether by stop(), silence, or an error. */
	onEnd: () => void;
	onError: (message: string) => void;
}

/** What each SpeechRecognition error code means to a reader. Anything else is
 *  reported generically rather than leaking a spec identifier onto the screen. */
const ERROR_MESSAGES: Record<string, string> = {
	'not-allowed': '마이크 권한이 필요합니다',
	'service-not-allowed': '마이크 권한이 필요합니다',
	network: '네트워크 오류로 인식하지 못했습니다',
	'no-speech': '소리가 들리지 않았습니다',
	'audio-capture': '마이크를 찾지 못했습니다'
};

export function speechErrorMessage(code: string): string {
	return ERROR_MESSAGES[code] ?? '음성 인식에 실패했습니다';
}

/**
 * Starts dictation. Returns null when unsupported, so the caller can decide
 * once whether to offer the control at all.
 */
export function startSpeech(handlers: SpeechHandlers, lang = 'ko-KR'): SpeechSession | null {
	const Ctor = ctor();
	if (!Ctor) return null;

	const rec = new Ctor();
	rec.lang = lang;
	// Not continuous, deliberately. iOS Safari ignores the flag and ends after
	// each utterance — and asking for it there produced a session whose onend
	// never arrived, which stranded the button on 중지 with no way back and read
	// as the whole UI freezing. Restarting on end gives the same "keep listening
	// through a pause" behaviour on every platform, with no UA sniffing.
	rec.continuous = false;
	rec.interimResults = true;

	const transcript = createTranscript();
	/** The reader has asked to stop; no further restarts. */
	let stopped = false;
	/** onEnd is reported exactly once, however many sessions ran. */
	let settled = false;
	let restarts = 0;

	function finish() {
		if (settled) return;
		settled = true;
		handlers.onEnd();
	}

	rec.onresult = (e) => {
		const chunks: SpeechChunk[] = [];
		for (let i = 0; i < e.results.length; i++) {
			const r = e.results[i];
			chunks.push({ transcript: r[0].transcript, isFinal: r.isFinal });
		}
		handlers.onText(transcript.update(chunks));
	};

	rec.onerror = (e) => {
		// 'aborted' is what stop() produces, and 'no-speech' is just a pause —
		// neither is worth putting on screen. Anything else ends the attempt
		// rather than restarting into the same failure.
		if (e.error === 'aborted') return;
		if (e.error === 'no-speech') return;
		stopped = true;
		handlers.onError(speechErrorMessage(e.error));
	};

	rec.onend = () => {
		transcript.endSession();
		if (stopped || restarts >= MAX_RESTARTS) {
			finish();
			return;
		}
		restarts += 1;
		try {
			rec.start();
		} catch {
			finish();
		}
	};

	try {
		rec.start();
	} catch {
		// start() throws when a session is already running. Report the end so the
		// caller never sits in a listening state it cannot leave.
		finish();
		return { stop: () => finish() };
	}

	return {
		stop: () => {
			stopped = true;
			try {
				rec.stop();
			} catch {
				/* already gone */
			}
			// Does not wait for onend. On iOS it may never arrive, and the caller's
			// only way out of the listening state must not depend on it.
			finish();
		}
	};
}
