import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	markActiveToday,
	daysActiveSince,
	todayLocalKey,
	getActivityHistory
} from '../../src/lib/db/activity';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

describe('activity I/O', () => {
	it('todayLocalKey returns YYYY-MM-DD format', () => {
		const key = todayLocalKey();
		expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('markActiveToday creates a row for today', async () => {
		expect(await db.activity.count()).toBe(0);
		await markActiveToday();
		expect(await db.activity.count()).toBe(1);
	});

	it('markActiveToday is idempotent within one day', async () => {
		await markActiveToday();
		await markActiveToday();
		expect(await db.activity.count()).toBe(1);
	});

	it('daysActiveSince counts entries with dateKey >= cutoff', async () => {
		await db.activity.put({ dateKey: '2026-05-08' });
		await db.activity.put({ dateKey: '2026-05-09' });
		await db.activity.put({ dateKey: '2026-05-10' });
		expect(await daysActiveSince('2026-05-09')).toBe(2);
		expect(await daysActiveSince('2026-05-08')).toBe(3);
		expect(await daysActiveSince('2026-05-11')).toBe(0);
	});

	it('getActivityHistory returns rows sorted ascending by dateKey', async () => {
		await db.activity.put({ dateKey: '2026-05-10' });
		await db.activity.put({ dateKey: '2026-05-08' });
		await db.activity.put({ dateKey: '2026-05-09' });
		const history = await getActivityHistory();
		expect(history.map((h) => h.dateKey)).toEqual(['2026-05-08', '2026-05-09', '2026-05-10']);
	});

	it('getActivityHistory returns empty array when nothing recorded', async () => {
		expect(await getActivityHistory()).toEqual([]);
	});
});
