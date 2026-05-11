import { db } from './local';
import type { DailyActivity } from '$lib/types';

export function todayLocalKey(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export async function markActiveToday(): Promise<void> {
	await db.activity.put({ dateKey: todayLocalKey() });
}

export async function daysActiveSince(cutoffKey: string): Promise<number> {
	return db.activity.where('dateKey').aboveOrEqual(cutoffKey).count();
}

export async function getActivityHistory(): Promise<DailyActivity[]> {
	return db.activity.orderBy('dateKey').toArray();
}
