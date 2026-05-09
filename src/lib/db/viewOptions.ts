import { db } from './local';

const KEY = 'view_options';

export interface ViewOptions {
	showVerseTextInList: boolean;
}

const DEFAULTS: ViewOptions = {
	showVerseTextInList: true
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
	});
	// Don't let a single failure poison the queue
	writeQueue = next.catch(() => {});
	return next;
}
