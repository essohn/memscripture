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

async function readRaw(): Promise<Record<string, unknown>> {
	const entry = await db.settings.get(KEY);
	const value = entry?.value;
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
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
