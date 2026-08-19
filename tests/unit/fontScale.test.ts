import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import { fontScale } from '../../src/lib/state/fontScale.svelte';
import { getVerseFontScale, setVerseFontScale } from '../../src/lib/db/viewOptions';

beforeEach(async () => {
	await db.delete();
	await db.open();
	fontScale.value = 1.0;
	fontScale._resetForTest();
});

describe('fontScale', () => {
	it('loads the stored size', async () => {
		await setVerseFontScale(1.3);
		await fontScale.load();
		expect(fontScale.value).toBe(1.3);
	});

	// The header mounts and calls load() before the read resolves, so the
	// picker is usable while it is still in flight — a real cold-start window
	// on a slow device. A choice made then must not be reverted by the read.
	it('a choice during an in-flight load wins over the load', async () => {
		await setVerseFontScale(0.8);
		const loading = fontScale.load();
		// No await: pick() fires while load()'s read is still pending.
		const picking = fontScale.pick(1.3);
		await Promise.all([loading, picking]);
		expect(fontScale.value).toBe(1.3);
		expect(await getVerseFontScale()).toBe(1.3);
	});

	it('applies before the write finishes, so a tap never waits on storage', () => {
		const write = fontScale.pick(1.15);
		expect(fontScale.value).toBe(1.15);
		return write;
	});

	// The whole point of moving the picker into the header: one shared value,
	// so every screen already rendered follows the change.
	it('is a single shared value, not a copy per screen', async () => {
		await fontScale.pick(0.9);
		const { fontScale: again } = await import('../../src/lib/state/fontScale.svelte');
		expect(again.value).toBe(0.9);
	});

	it('keeps the default when the stored value cannot be read', async () => {
		await db.close();
		await fontScale.load();
		expect(fontScale.value).toBe(1.0);
		await db.open();
	});
});
