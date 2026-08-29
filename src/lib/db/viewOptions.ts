import { db } from './local';
import { touchDataModified } from './touchData';

const KEY = 'view_options';

/** Allowed font scale tiers for the verse-card text. Other values are coerced
 *  back to the closest known step on read to keep the picker honest. */
export const VERSE_FONT_SCALES = [0.8, 0.9, 1.0, 1.15, 1.3] as const;
export type VerseFontScale = (typeof VERSE_FONT_SCALES)[number];

export interface ViewOptions {
	showVerseTextInList: boolean;
	verseFontScale: VerseFontScale;
}

const DEFAULTS: ViewOptions = {
	showVerseTextInList: true,
	verseFontScale: 1.0
};

/** Options this row used to hold and no longer does. Stripped on the next
 *  write rather than by a migration of its own — nothing reads them meanwhile,
 *  and this row travels in the sync envelope, so left alone they would follow
 *  the reader between devices for good.
 *
 *  eventStatsOpen: the per-event 통계 보기 fold, retired when the stats became
 *  permanently visible. */
const RETIRED_KEYS = ['eventStatsOpen'] as const;

async function readRaw(): Promise<Record<string, unknown>> {
	const entry = await db.settings.get(KEY);
	const value = entry?.value;
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const raw = { ...(value as Record<string, unknown>) };
	for (const key of RETIRED_KEYS) delete raw[key];
	return raw;
}

export async function getShowVerseTextInList(): Promise<boolean> {
	const raw = await readRaw();
	const v = raw.showVerseTextInList;
	return typeof v === 'boolean' ? v : DEFAULTS.showVerseTextInList;
}

let writeQueue: Promise<unknown> = Promise.resolve();

export async function setShowVerseTextInList(v: boolean): Promise<void> {
	const next = writeQueue.then(async () => {
		const raw = await readRaw();
		await db.settings.put({ key: KEY, value: { ...raw, showVerseTextInList: v } });
		await touchDataModified();
	});
	// Don't let a single failure poison the queue
	writeQueue = next.catch(() => {});
	return next;
}

export async function getVerseFontScale(): Promise<VerseFontScale> {
	const raw = await readRaw();
	const v = raw.verseFontScale;
	if (typeof v !== 'number') return DEFAULTS.verseFontScale;
	// Snap to the nearest allowed step so a stored value from a renamed picker
	// (or a legacy build) still maps to a valid choice.
	const exact = VERSE_FONT_SCALES.find((s) => Math.abs(s - v) < 0.001);
	return exact ?? DEFAULTS.verseFontScale;
}

export async function setVerseFontScale(v: VerseFontScale): Promise<void> {
	const next = writeQueue.then(async () => {
		const raw = await readRaw();
		await db.settings.put({ key: KEY, value: { ...raw, verseFontScale: v } });
		await touchDataModified();
	});
	writeQueue = next.catch(() => {});
	return next;
}

// ─── 읽어주기 (TTS) ──────────────────────────────────────────────────────────

/** Playback speeds offered. Slower than normal is the useful direction for
 *  memorizing, so the range leans that way. */
export const SPEAK_RATES = [0.6, 0.75, 0.9, 1.0, 1.2] as const;
export type SpeakRate = (typeof SPEAK_RATES)[number];

/** How long 따라 읽기 waits, against the verse's estimated reading time.
 *  Reaching further down than up: someone who knows the set cold wants the
 *  pause out of the way, and 1.5 is already a long silence to sit through. */
export const RECITE_SCALES = [0.3, 0.5, 0.8, 1, 1.2, 1.5] as const;
export type ReciteScale = (typeof RECITE_SCALES)[number];

export interface SpeakOptionsStored {
	/** Read the topical title before the reference. Off by default — it is a
	 *  label, not scripture. */
	speakTitle: boolean;
	speakRate: SpeakRate;
	/** Keep reading the verse until stopped. */
	speakRepeat: boolean;
	/** Loop the whole list in 전체 듣기. Separate from speakRepeat, which means
	 *  "loop this one verse forever" on a card — a reader who wants a list to
	 *  come round again does not want every card to loop. On by default:
	 *  reaching for 전체 듣기 is usually about soaking in a set. */
	speakListRepeat: boolean;
	/** Chosen voice name, or '' to let the ranking decide. Voices differ by
	 *  device and taste, so this is the reader's call when they want it. */
	speakVoice: string;
	/** Preferred voice gender. 'auto' takes whichever voice ranks best. */
	speakGender: 'male' | 'female' | 'auto';
	/** 따라 읽기's silence, as a multiple of the verse's estimated reading
	 *  time. 1 leaves the estimate alone, which already runs about 9% over
	 *  what the voice actually takes. */
	reciteScale: ReciteScale;
}

export const SPEAK_DEFAULTS: SpeakOptionsStored = {
	speakTitle: false,
	speakRate: 0.9,
	speakRepeat: false,
	speakListRepeat: true,
	speakVoice: '',
	// Auto, which the quality ranking resolves to the neural voice — 'Google
	// 한국의' on Chrome. Naming it here instead would go silent on iPhone,
	// where it does not exist; the ranking degrades to the next best.
	speakGender: 'auto',
	reciteScale: 1
};

export async function getSpeakOptions(): Promise<SpeakOptionsStored> {
	const raw = await readRaw();
	const rate = SPEAK_RATES.find((r) => Math.abs(r - (raw.speakRate as number)) < 0.001);
	// Matched against the offered steps rather than range-checked, for the same
	// reason as the rate: a value from an older build, a hand-edited record or
	// a future one that offered another step must not reach the player as a
	// multiplier nobody chose.
	const recite = RECITE_SCALES.find((r) => Math.abs(r - (raw.reciteScale as number)) < 0.001);
	return {
		speakTitle: typeof raw.speakTitle === 'boolean' ? raw.speakTitle : SPEAK_DEFAULTS.speakTitle,
		speakRate: rate ?? SPEAK_DEFAULTS.speakRate,
		speakRepeat:
			typeof raw.speakRepeat === 'boolean' ? raw.speakRepeat : SPEAK_DEFAULTS.speakRepeat,
		speakListRepeat:
			typeof raw.speakListRepeat === 'boolean'
				? raw.speakListRepeat
				: SPEAK_DEFAULTS.speakListRepeat,
		speakVoice: typeof raw.speakVoice === 'string' ? raw.speakVoice : SPEAK_DEFAULTS.speakVoice,
		speakGender:
			raw.speakGender === 'male' || raw.speakGender === 'female' || raw.speakGender === 'auto'
				? raw.speakGender
				: SPEAK_DEFAULTS.speakGender,
		reciteScale: recite ?? SPEAK_DEFAULTS.reciteScale
	};
}

/** Writes one option, merged into whatever else is stored. Shares the module
 *  write queue so a burst of toggles cannot lose one to a stale read. */
export async function setSpeakOption<K extends keyof SpeakOptionsStored>(
	key: K,
	value: SpeakOptionsStored[K]
): Promise<void> {
	const next = writeQueue.then(async () => {
		const raw = await readRaw();
		await db.settings.put({ key: KEY, value: { ...raw, [key]: value } });
		await touchDataModified();
	});
	writeQueue = next.catch(() => {});
	return next;
}

