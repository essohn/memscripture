import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import { verseVisibility } from '../../src/lib/state/verseVisibility.svelte';
import { getShowVerseTextInList, setShowVerseTextInList } from '../../src/lib/db/viewOptions';

beforeEach(async () => {
	await db.delete();
	await db.open();
	verseVisibility.shown = true;
	// #loaded is private and stays true after the first test's load()
	// resolves, so later tests' load() calls would otherwise return
	// immediately without re-reading storage.
	verseVisibility._resetForTest();
});

describe('verseVisibility', () => {
	// Header mounts and calls load() before first paint resolves, so the eye
	// is tappable while the IndexedDB read is still in flight — a real
	// cold-start window on a slow device. A tap during that window must not
	// be reverted once the read finally comes back.
	it('a toggle during an in-flight load wins over the load', async () => {
		await setShowVerseTextInList(true);
		const loadPromise = verseVisibility.load();
		// No await here: toggle() fires while load()'s read is still pending.
		const togglePromise = verseVisibility.toggle();
		await Promise.all([loadPromise, togglePromise]);
		expect(verseVisibility.shown).toBe(false);
		expect(await getShowVerseTextInList()).toBe(false);
	});

	it('load() still applies the stored value when nothing raced it', async () => {
		await setShowVerseTextInList(false);
		await verseVisibility.load();
		expect(verseVisibility.shown).toBe(false);
	});

	it('a second load() call is a no-op (guarded by #loaded)', async () => {
		await setShowVerseTextInList(false);
		await verseVisibility.load();
		await setShowVerseTextInList(true);
		await verseVisibility.load();
		// Still false: the second call returns immediately without re-reading.
		expect(verseVisibility.shown).toBe(false);
	});
});
