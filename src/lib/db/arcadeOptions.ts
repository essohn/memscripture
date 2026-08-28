import { db } from './local';
import { touchDataModified } from './touchData';

const KEY = 'arcade_options';

export interface ArcadeOptions {
	/** Chiptune for the quiz's games. */
	sound: boolean;
}

/**
 * On by default.
 *
 * The quiz is the one place in this app that is a game, and a game with the
 * sound off by default is a game nobody knows has sound. Nothing else in the
 * app makes a noise, and the switch sits in 설정 for a reader who would rather
 * it did not.
 */
export const ARCADE_DEFAULTS: ArcadeOptions = { sound: true };

async function readRaw(): Promise<Record<string, unknown>> {
	const entry = await db.settings.get(KEY);
	const value = entry?.value;
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return { ...(value as Record<string, unknown>) };
}

export async function getArcadeSound(): Promise<boolean> {
	const raw = await readRaw();
	return typeof raw.sound === 'boolean' ? raw.sound : ARCADE_DEFAULTS.sound;
}

let writeQueue: Promise<unknown> = Promise.resolve();

export async function setArcadeSound(v: boolean): Promise<void> {
	const next = writeQueue.then(async () => {
		const raw = await readRaw();
		await db.settings.put({ key: KEY, value: { ...raw, sound: v } });
		await touchDataModified();
	});
	// Don't let a single failure poison the queue.
	writeQueue = next.catch(() => {});
	return next;
}
