import { db } from './local';
import type { PackageMeta } from '$lib/types';

export const OYO_PACKAGE_ID = 'oyo' as const;

/** The PackageMeta values used when seeding OYO for the first time. */
const OYO_SEED: PackageMeta = {
	id: OYO_PACKAGE_ID,
	name: '내 구절',
	abbreviation: 'OYO',
	verse_number: 0,
	translation: 'krv',
	translation_name: '사용자',
	language: 'kor',
	copyright: '',
	copyright_text: '',
	version: 1,
	source: '',
	default: false,
	kind: 'user'
};

/**
 * Insert the OYO PackageMeta row if not already present. Idempotent and
 * non-destructive — if the user has mutated their OYO row (rename, etc.),
 * existing values are preserved.
 */
export async function seedOyoPackageIfMissing(): Promise<void> {
	const existing = await db.packages.get(OYO_PACKAGE_ID);
	if (existing) return;
	await db.packages.put(OYO_SEED);
}
