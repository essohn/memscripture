import Dexie, { type Table } from 'dexie';
import type { PackageMeta, Verse } from '$lib/types';

export type StoredVerse = Verse & { package_id: string; no: number };
export type StoredPackage = PackageMeta;
export type StoredSetting = { key: string; value: unknown };

class LocalDB extends Dexie {
	packages!: Table<StoredPackage, string>;
	verses!: Table<StoredVerse, [string, number]>;
	settings!: Table<StoredSetting, string>;

	constructor() {
		super('memscripture');
		this.version(1).stores({
			packages: '&id, name',
			verses: '[package_id+no], package_id',
			settings: '&key'
		});
	}
}

export const db = new LocalDB();
