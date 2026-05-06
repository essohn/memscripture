import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

describe('local db schema', () => {
	it('exposes the expected tables', () => {
		const names = db.tables.map((t) => t.name).sort();
		expect(names).toEqual(['packages', 'settings', 'verses']);
	});

	it('round-trips a verse', async () => {
		await db.verses.put({ package_id: '5_krv', no: 1, i: 1, title: 't', cite: 'c', w: 'w' });
		const v = await db.verses.get(['5_krv', 1]);
		expect(v?.title).toBe('t');
	});
});
