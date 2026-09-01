import { db } from './local';
import type { PackageMeta } from '$lib/types';
import type { StoredVerse } from './local';
import { touchDataModified } from './touchData';

export const OYO_PACKAGE_ID = 'oyo' as const;

/** The name every install carried before the package was labelled with its
 *  own abbreviation. Kept so the rename below can recognise it. */
const OYO_LEGACY_NAME = '내 구절';

/** The PackageMeta values used when seeding OYO for the first time. */
const OYO_SEED: PackageMeta = {
	id: OYO_PACKAGE_ID,
	name: '나의 구절(OYO)',
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
	if (!existing) {
		await db.packages.put(OYO_SEED);
		return;
	}
	// Carry the old default forward. Matched exactly, and only against the
	// previous default, so this renames the rows nobody chose while leaving
	// alone any row that says something else — the non-destructive promise
	// above still holds for everything that is not this one known string.
	if (existing.name === OYO_LEGACY_NAME) {
		await db.packages.put({ ...existing, name: OYO_SEED.name });
	}
}

export interface OyoVerseInput {
	cite: string;
	title: string;
	w: string;
}

// Full-scan max — Dexie has no aggregate, and OYO partitions are small
// (single user, expected <1000 rows) so the in-memory reduce is the right call.
async function nextVerseNo(): Promise<number> {
	const rows = await db.verses.where('package_id').equals(OYO_PACKAGE_ID).toArray();
	if (rows.length === 0) return 1;
	const maxNo = rows.reduce((m, r) => (r.no > m ? r.no : m), 0);
	return maxNo + 1;
}

/**
 * Keep the count badge on the library OYO card honest.
 *
 * PackageMeta.verse_number is what PackageCard renders, so anything that adds
 * or removes an OYO verse has to nudge it alongside the verses table.
 * Recomputed from a live count rather than incremented — cheaper to reason
 * about, and a hole-allowed delete sequence won't drift from reality.
 *
 * Exported because this module is not the only writer of OYO verse rows: the
 * sync restore bulkPuts them straight into Dexie. A counter maintained by one
 * module and written by two is a counter that drifts, and once drifted nothing
 * here ever looked at it again — the reader who reported "구절이 2개 있는데
 * 0구절로 뜬다" had exactly that, permanently. listPackages now reconciles on
 * every read, so an install already carrying a wrong number repairs itself.
 */
export async function syncOyoVerseCount(): Promise<void> {
	const count = await db.verses.where('package_id').equals(OYO_PACKAGE_ID).count();
	const pkg = await db.packages.get(OYO_PACKAGE_ID);
	if (!pkg || pkg.verse_number === count) return;
	await db.packages.put({ ...pkg, verse_number: count });
}

// Single-tab PWA: no concurrent writers, so the read-then-write across
// nextVerseNo + put is safe without a Dexie transaction.
export async function createOyoVerse(input: OyoVerseInput): Promise<StoredVerse> {
	const no = await nextVerseNo();
	const row: StoredVerse = {
		package_id: OYO_PACKAGE_ID,
		no,
		i: no,
		title: input.title,
		cite: input.cite,
		w: input.w
	};
	await db.verses.put(row);
	await syncOyoVerseCount();
	await touchDataModified();
	return row;
}

export async function listOyoVerses(): Promise<StoredVerse[]> {
	return db.verses.where('package_id').equals(OYO_PACKAGE_ID).sortBy('no');
}

// Silent no-op on missing verseNo is intentional: undo / debounced edit flows
// may target a row that was concurrently deleted; throwing would force every
// caller into try/catch noise.
export async function updateOyoVerse(
	verseNo: number,
	patch: Partial<OyoVerseInput>
): Promise<void> {
	const row = await db.verses.get([OYO_PACKAGE_ID, verseNo]);
	if (!row) return;
	await db.verses.put({ ...row, ...patch });
	await touchDataModified();
}

export async function deleteOyoVerse(verseNo: number): Promise<StoredVerse | null> {
	const row = await db.verses.get([OYO_PACKAGE_ID, verseNo]);
	if (!row) return null;
	await db.verses.delete([OYO_PACKAGE_ID, verseNo]);
	await syncOyoVerseCount();
	await touchDataModified();
	return row;
}

// Guard against accidentally re-homing a non-OYO snapshot into the OYO partition.
export async function restoreOyoVerse(verse: StoredVerse): Promise<void> {
	if (verse.package_id !== OYO_PACKAGE_ID) return;
	await db.verses.put(verse);
	await syncOyoVerseCount();
	await touchDataModified();
}
