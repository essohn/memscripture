import { db } from './local';

const KEY = 'active_package';

interface ActivePackageRecord {
	packageId: string;
	setAt: number;
}

export async function getActivePackageId(): Promise<string | null> {
	const entry = await db.settings.get(KEY);
	const value = entry?.value;
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const id = (value as Partial<ActivePackageRecord>).packageId;
	return typeof id === 'string' ? id : null;
}

export async function setActivePackage(packageId: string): Promise<void> {
	const record: ActivePackageRecord = { packageId, setAt: Date.now() };
	await db.settings.put({ key: KEY, value: record });
}

export async function clearActivePackage(): Promise<void> {
	await db.settings.delete(KEY);
}
