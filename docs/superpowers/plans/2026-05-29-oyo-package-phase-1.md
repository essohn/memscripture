# OYO Package — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the personal-notebook slice of OYO — a reserved `package_id = 'oyo'` package with full verse CRUD on a dedicated `/library/oyo` route. Tags and backup ship in later phases.

**Architecture:** Reserve `package_id = 'oyo'` in the existing Dexie `packages` table; OYO verses live in the same `verses` table distinguished by `package_id`. Add a `kind: 'builtin' | 'user'` discriminator to `PackageMeta` so the library list can chip the OYO card and `installPackage` can early-return for user packages (which have no JSON source). A dedicated `/library/oyo/+page.svelte` route wins over the dynamic `[packageId]` route and avoids forking the curated detail page. Verse mutations go through a single `src/lib/db/oyo.ts` module.

**Tech Stack:** Svelte 5 (runes), SvelteKit, Tailwind v4, Dexie 4 (IndexedDB), Vitest + @testing-library/svelte + fake-indexeddb for unit tests, Playwright for e2e.

**Deviation from spec:** The spec called for a `source` discriminator field, but `PackageMeta.source` already exists as the JSON file path (`"data/60_krv.json"` etc.). This plan uses `kind: 'builtin' | 'user'` instead. Same semantics, no name collision.

**Convention notes:** Conventional commits (`feat`, `fix`, `refactor`, `test`). Korean UI strings. Commit trailer always: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## File Structure

**Create:**
- `src/lib/db/oyo.ts` — OYO_PACKAGE_ID const, seed helper, CRUD on verses table
- `src/lib/components/oyo/VerseEditSheet.svelte` — bottom-sheet form for add/edit
- `src/lib/components/oyo/VerseOverflowMenu.svelte` — `…` menu (edit / delete) per card
- `src/routes/library/oyo/+page.svelte` — dedicated OYO detail route (verse list, empty state, + CTA)
- `tests/unit/oyo.test.ts` — db module tests
- `tests/unit/VerseEditSheet.test.ts` — sheet component tests
- `tests/e2e/oyo.spec.ts` — full Phase 1 flow

**Modify:**
- `src/lib/types.ts` — add `kind: 'builtin' | 'user'` to PackageMeta
- `src/lib/db/verses.ts` — backfill `kind` on listPackages, early-return installPackage for `kind === 'user'`
- `src/lib/components/PackageCard.svelte` — render "사용자 정의" chip when `pkg.kind === 'user'`
- `src/routes/library/+page.svelte` — ensure OYO sorts to top (kind='user' first)
- `src/routes/+layout.svelte` — call `seedOyoPackageIfMissing` once on mount
- `tests/unit/PackageCard.test.ts` (if exists) — chip assertion

---

## Task 1: Add `kind` field to PackageMeta + db plumbing

**Files:**
- Modify: `src/lib/types.ts` — `PackageMeta` interface
- Modify: `src/lib/db/verses.ts` — `listPackages`, `installPackage`
- Test: `tests/unit/oyo.test.ts` (new)

- [ ] **Step 1: Write failing test for kind backfill**

Create `tests/unit/oyo.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/local';
import { listPackages, installPackage } from '../../src/lib/db/verses';
import type { PackageMeta } from '../../src/lib/types';

beforeEach(async () => {
	await db.packages.clear();
	await db.verses.clear();
});

describe('PackageMeta.kind backfill', () => {
	it('listPackages defaults missing kind to "builtin" for stored rows', async () => {
		// Insert a row without kind to mimic pre-migration data.
		const legacy = {
			id: 'legacy_pkg',
			name: 'Legacy',
			abbreviation: 'LP',
			verse_number: 5,
			translation: 'krv',
			translation_name: '개역한글',
			language: 'kor',
			copyright: '',
			copyright_text: '',
			version: 1,
			source: 'data/legacy.json',
			default: false
		} as PackageMeta;
		await db.packages.put(legacy);

		const all = await listPackages();
		const row = all.find((p) => p.id === 'legacy_pkg');
		expect(row?.kind).toBe('builtin');
	});

	it('installPackage early-returns when kind === "user" (no JSON fetch)', async () => {
		await db.packages.put({
			id: 'user_pkg',
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
		});

		// Should resolve without throwing even though source is empty.
		await expect(installPackage('user_pkg')).resolves.toBeUndefined();
	});
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npx vitest run tests/unit/oyo.test.ts
```

Expected: both fail. First fails because `kind` is missing on the result (undefined ≠ 'builtin'); second fails because `installPackage` tries to fetch `/` (empty source) and throws.

- [ ] **Step 3: Add `kind` to PackageMeta**

In `src/lib/types.ts`, update the interface:

```ts
export interface PackageMeta {
	id: string;
	name: string;
	verse_number: number;
	translation: 'krv';
	translation_name: string;
	abbreviation: string;
	language: 'kor';
	copyright: string;
	copyright_text: string;
	version: number;
	source: string;
	default: boolean;
	/**
	 * Distinguishes shipped (curated JSON) packages from user-owned packages
	 * like OYO. Defaults to 'builtin' when absent for backward compatibility
	 * with rows installed before this field existed.
	 */
	kind?: 'builtin' | 'user';
}
```

- [ ] **Step 4: Backfill `kind` in listPackages and skip installPackage for user kinds**

In `src/lib/db/verses.ts`, edit `listPackages` so every returned row has a `kind`:

```ts
export async function listPackages(): Promise<PackageMeta[]> {
	const byVerseNumber = (a: PackageMeta, b: PackageMeta) => a.verse_number - b.verse_number;

	const cached = await db.packages.toArray();
	if (cached.length) {
		return cached.map((p) => ({ ...p, kind: p.kind ?? 'builtin' })).sort(byVerseNumber);
	}

	const res = await fetch(PACKAGES_URL);
	if (!res.ok) throw new Error(`Failed to load packages: ${res.status}`);
	const map = (await res.json()) as Record<string, Omit<PackageMeta, 'id'>>;
	const list: PackageMeta[] = Object.entries(map).map(([id, meta]) => ({
		...meta,
		id,
		kind: meta.kind ?? 'builtin'
	}));
	await db.packages.bulkPut(list);
	return list.sort(byVerseNumber);
}
```

And edit `installPackage` to early-return for user kinds:

```ts
export async function installPackage(packageId: string): Promise<void> {
	if (await isPackageInstalled(packageId)) return;

	const pkg = await db.packages.get(packageId);
	if (!pkg) throw new Error(`Unknown package: ${packageId}`);

	// User-owned packages have no JSON source — their data is created at runtime.
	if (pkg.kind === 'user') return;

	const res = await fetch(`/${pkg.source}`);
	// … rest unchanged
```

- [ ] **Step 5: Run tests and confirm pass**

```bash
npx vitest run tests/unit/oyo.test.ts
```

Expected: both pass. Also run the full suite to check nothing else broke:

```bash
npm test
```

Expected: all green (207 + 2 new = 209).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/db/verses.ts tests/unit/oyo.test.ts
git commit -m "$(cat <<'EOF'
feat(types): add PackageMeta.kind discriminator for user packages

Prepares for OYO ("Only Your Own") — a user-owned package that lives
in Dexie alongside curated ones. listPackages backfills kind='builtin'
on legacy rows; installPackage early-returns for kind='user' so user
packages don't try to fetch a non-existent JSON source.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: PackageCard renders "사용자 정의" chip

**Files:**
- Modify: `src/lib/components/PackageCard.svelte`
- Test: `tests/unit/PackageCard.test.ts` (create if missing)

- [ ] **Step 1: Write failing test**

If `tests/unit/PackageCard.test.ts` does not exist, create it. Add:

```ts
import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import PackageCard from '../../src/lib/components/PackageCard.svelte';
import type { PackageMeta } from '../../src/lib/types';

const base: PackageMeta = {
	id: 'pkg',
	name: 'Sample',
	abbreviation: 'SP',
	verse_number: 5,
	translation: 'krv',
	translation_name: '개역한글',
	language: 'kor',
	copyright: '',
	copyright_text: '',
	version: 1,
	source: 'data/sample.json',
	default: false,
	kind: 'builtin'
};

describe('PackageCard', () => {
	it('shows "사용자 정의" chip when kind === "user"', () => {
		render(PackageCard, { props: { pkg: { ...base, kind: 'user' } } });
		expect(screen.getByText('사용자 정의')).toBeInTheDocument();
	});

	it('does not show the chip when kind === "builtin"', () => {
		render(PackageCard, { props: { pkg: { ...base, kind: 'builtin' } } });
		expect(screen.queryByText('사용자 정의')).toBeNull();
	});
});
```

- [ ] **Step 2: Run tests and confirm fail**

```bash
npx vitest run tests/unit/PackageCard.test.ts
```

Expected: fail with "Unable to find an element with the text: 사용자 정의".

- [ ] **Step 3: Add the chip render**

In `src/lib/components/PackageCard.svelte`, find the metadata row that already shows `pkg.translation_name`. Add a sibling chip when `pkg.kind === 'user'`. Insert immediately after the translation_name `<p>`:

```svelte
{#if pkg.kind === 'user'}
	<span
		class="ml-2 inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-elevated)] px-2 py-0.5 text-[10px] font-medium tracking-wider text-[var(--color-text-tertiary)]"
	>
		사용자 정의
	</span>
{/if}
```

Place it inside the same flex line so it sits to the right of the translation name. If layout breaks, wrap the existing translation name + chip in a flex span.

- [ ] **Step 4: Run tests and confirm pass**

```bash
npx vitest run tests/unit/PackageCard.test.ts
npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/PackageCard.svelte tests/unit/PackageCard.test.ts
git commit -m "$(cat <<'EOF'
feat(library): show "사용자 정의" chip on user-kind package cards

Visually distinguishes OYO from curated packages in the library list.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: OYO_PACKAGE_ID + seed helper + startup wiring

**Files:**
- Create: `src/lib/db/oyo.ts`
- Modify: `src/routes/+layout.svelte`
- Test: extend `tests/unit/oyo.test.ts`

- [ ] **Step 1: Write failing tests for seed**

Append to `tests/unit/oyo.test.ts`:

```ts
import { OYO_PACKAGE_ID, seedOyoPackageIfMissing } from '../../src/lib/db/oyo';

describe('seedOyoPackageIfMissing', () => {
	it('inserts the OYO row when missing', async () => {
		await seedOyoPackageIfMissing();
		const row = await db.packages.get(OYO_PACKAGE_ID);
		expect(row).toBeDefined();
		expect(row?.id).toBe(OYO_PACKAGE_ID);
		expect(row?.kind).toBe('user');
		expect(row?.name).toBe('내 구절');
		expect(row?.abbreviation).toBe('OYO');
	});

	it('is idempotent', async () => {
		await seedOyoPackageIfMissing();
		await seedOyoPackageIfMissing();
		const all = await db.packages.where('id').equals(OYO_PACKAGE_ID).toArray();
		expect(all).toHaveLength(1);
	});

	it('does not overwrite an existing OYO row (preserves user state)', async () => {
		// Simulate an OYO row with custom name (e.g., user renamed in a future phase).
		await db.packages.put({
			id: OYO_PACKAGE_ID,
			name: '내가 바꾼 이름',
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
		});
		await seedOyoPackageIfMissing();
		const row = await db.packages.get(OYO_PACKAGE_ID);
		expect(row?.name).toBe('내가 바꾼 이름');
	});
});
```

- [ ] **Step 2: Run tests and confirm fail**

```bash
npx vitest run tests/unit/oyo.test.ts
```

Expected: all three fail because module does not exist.

- [ ] **Step 3: Implement `src/lib/db/oyo.ts`**

Create file:

```ts
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
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
npx vitest run tests/unit/oyo.test.ts
```

Expected: all pass.

- [ ] **Step 5: Wire seed into app startup**

In `src/routes/+layout.svelte`, add inside the `<script lang="ts">` block:

```ts
import { seedOyoPackageIfMissing } from '$lib/db/oyo';

$effect(() => {
	// Fire-and-forget on initial mount. Idempotent — repeated calls are no-ops.
	seedOyoPackageIfMissing().catch(() => {});
});
```

- [ ] **Step 6: Run full suite**

```bash
npm test
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/oyo.ts src/routes/+layout.svelte tests/unit/oyo.test.ts
git commit -m "$(cat <<'EOF'
feat(oyo): seed OYO package row on first app mount

Adds src/lib/db/oyo.ts with the OYO_PACKAGE_ID const and the idempotent
seedOyoPackageIfMissing helper, wired into +layout.svelte so the row
appears in Dexie before the library list queries it. Non-destructive
on repeat calls — preserves any user mutations to the OYO row.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: userVerses CRUD module (in `oyo.ts`)

**Files:**
- Modify: `src/lib/db/oyo.ts` — add CRUD functions
- Test: extend `tests/unit/oyo.test.ts`

- [ ] **Step 1: Write failing CRUD tests**

Append to `tests/unit/oyo.test.ts`:

```ts
import {
	createOyoVerse,
	updateOyoVerse,
	deleteOyoVerse,
	listOyoVerses,
	restoreOyoVerse
} from '../../src/lib/db/oyo';

describe('OYO verse CRUD', () => {
	it('createOyoVerse allocates no = max+1 starting from 1', async () => {
		const v1 = await createOyoVerse({ cite: '요한복음 3:16', title: '', w: '하나님이 …' });
		expect(v1.no).toBe(1);
		const v2 = await createOyoVerse({ cite: '시편 23:1', title: '주는 나의 목자', w: '주는 …' });
		expect(v2.no).toBe(2);
	});

	it('createOyoVerse leaves no a monotonic sequence even after deletes', async () => {
		await createOyoVerse({ cite: 'a', title: '', w: 'aa' });
		await createOyoVerse({ cite: 'b', title: '', w: 'bb' });
		await deleteOyoVerse(1);
		const v3 = await createOyoVerse({ cite: 'c', title: '', w: 'cc' });
		expect(v3.no).toBe(3); // not 2 — holes allowed
	});

	it('listOyoVerses returns only oyo rows, sorted by no ascending', async () => {
		await createOyoVerse({ cite: 'a', title: '', w: 'aa' });
		await createOyoVerse({ cite: 'b', title: '', w: 'bb' });
		// Drop a non-OYO row alongside to confirm filtering
		await db.verses.put({ package_id: 'other', no: 1, i: 1, title: 't', cite: 'c', w: 'w' });
		const list = await listOyoVerses();
		expect(list.map((v) => v.no)).toEqual([1, 2]);
	});

	it('updateOyoVerse merges fields without changing no', async () => {
		const v = await createOyoVerse({ cite: 'a', title: 't1', w: 'w1' });
		await updateOyoVerse(v.no, { title: 't2' });
		const list = await listOyoVerses();
		expect(list[0].title).toBe('t2');
		expect(list[0].cite).toBe('a');
		expect(list[0].no).toBe(v.no);
	});

	it('deleteOyoVerse removes the row and returns the snapshot', async () => {
		const v = await createOyoVerse({ cite: 'a', title: '', w: 'w' });
		const snapshot = await deleteOyoVerse(v.no);
		expect(snapshot?.no).toBe(v.no);
		expect(await listOyoVerses()).toHaveLength(0);
	});

	it('restoreOyoVerse reinserts a deleted verse at the same no', async () => {
		const v = await createOyoVerse({ cite: 'a', title: '', w: 'w' });
		const snapshot = await deleteOyoVerse(v.no);
		await restoreOyoVerse(snapshot!);
		const list = await listOyoVerses();
		expect(list).toHaveLength(1);
		expect(list[0].no).toBe(v.no);
	});
});
```

- [ ] **Step 2: Run tests and confirm fail**

```bash
npx vitest run tests/unit/oyo.test.ts
```

Expected: all six fail because functions don't exist.

- [ ] **Step 3: Implement CRUD in `src/lib/db/oyo.ts`**

Append to `src/lib/db/oyo.ts`:

```ts
import type { StoredVerse } from './local';

export interface OyoVerseInput {
	cite: string;
	title: string;
	w: string;
}

async function nextVerseNo(): Promise<number> {
	const rows = await db.verses.where('package_id').equals(OYO_PACKAGE_ID).toArray();
	if (rows.length === 0) return 1;
	const maxNo = rows.reduce((m, r) => (r.no > m ? r.no : m), 0);
	return maxNo + 1;
}

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
	return row;
}

export async function listOyoVerses(): Promise<StoredVerse[]> {
	const rows = await db.verses.where('package_id').equals(OYO_PACKAGE_ID).toArray();
	return rows.sort((a, b) => a.no - b.no);
}

export async function updateOyoVerse(
	verseNo: number,
	patch: Partial<OyoVerseInput>
): Promise<void> {
	const row = await db.verses.get([OYO_PACKAGE_ID, verseNo]);
	if (!row) return;
	await db.verses.put({ ...row, ...patch });
}

export async function deleteOyoVerse(verseNo: number): Promise<StoredVerse | null> {
	const row = await db.verses.get([OYO_PACKAGE_ID, verseNo]);
	if (!row) return null;
	await db.verses.delete([OYO_PACKAGE_ID, verseNo]);
	return row;
}

export async function restoreOyoVerse(verse: StoredVerse): Promise<void> {
	if (verse.package_id !== OYO_PACKAGE_ID) return;
	await db.verses.put(verse);
}
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
npx vitest run tests/unit/oyo.test.ts
npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/oyo.ts tests/unit/oyo.test.ts
git commit -m "$(cat <<'EOF'
feat(oyo): verse CRUD (create / list / update / delete / restore)

Adds the persistence layer for OYO verses living in the shared Dexie
`verses` table under package_id='oyo'. nextVerseNo allocates monotonic
no values (holes allowed on delete) so the prev/next nav reasoning on
sparse sequences keeps working. deleteOyoVerse returns the snapshot
and restoreOyoVerse re-puts it, enabling the upcoming undo-delete UX.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: VerseEditSheet bottom-sheet component

**Files:**
- Create: `src/lib/components/oyo/VerseEditSheet.svelte`
- Test: `tests/unit/VerseEditSheet.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/VerseEditSheet.test.ts`:

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import VerseEditSheet from '../../src/lib/components/oyo/VerseEditSheet.svelte';

describe('VerseEditSheet', () => {
	it('renders empty fields in create mode', () => {
		render(VerseEditSheet, {
			props: { mode: 'create', onSubmit: () => {}, onClose: () => {} }
		});
		expect(screen.getByLabelText('인용')).toHaveValue('');
		expect(screen.getByLabelText('제목 (선택)')).toHaveValue('');
		expect(screen.getByLabelText('본문')).toHaveValue('');
	});

	it('prefills fields in edit mode', () => {
		render(VerseEditSheet, {
			props: {
				mode: 'edit',
				initial: { cite: '시편 23:1', title: '목자', w: '주는 나의 목자' },
				onSubmit: () => {},
				onClose: () => {}
			}
		});
		expect(screen.getByLabelText('인용')).toHaveValue('시편 23:1');
		expect(screen.getByLabelText('제목 (선택)')).toHaveValue('목자');
		expect(screen.getByLabelText('본문')).toHaveValue('주는 나의 목자');
	});

	it('save button is disabled until cite and body are filled', async () => {
		render(VerseEditSheet, {
			props: { mode: 'create', onSubmit: () => {}, onClose: () => {} }
		});
		const save = screen.getByRole('button', { name: '저장' });
		expect(save).toBeDisabled();

		await fireEvent.input(screen.getByLabelText('인용'), { target: { value: '요 3:16' } });
		expect(save).toBeDisabled();

		await fireEvent.input(screen.getByLabelText('본문'), { target: { value: '하나님이' } });
		expect(save).toBeEnabled();
	});

	it('save submits the trimmed payload and closes', async () => {
		const onSubmit = vi.fn();
		const onClose = vi.fn();
		render(VerseEditSheet, { props: { mode: 'create', onSubmit, onClose } });

		await fireEvent.input(screen.getByLabelText('인용'), { target: { value: '  요 3:16  ' } });
		await fireEvent.input(screen.getByLabelText('제목 (선택)'), { target: { value: '' } });
		await fireEvent.input(screen.getByLabelText('본문'), { target: { value: '하나님이 …' } });
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));

		expect(onSubmit).toHaveBeenCalledWith({ cite: '요 3:16', title: '', w: '하나님이 …' });
		expect(onClose).toHaveBeenCalled();
	});

	it('cancel closes without submitting', async () => {
		const onSubmit = vi.fn();
		const onClose = vi.fn();
		render(VerseEditSheet, { props: { mode: 'create', onSubmit, onClose } });
		await fireEvent.click(screen.getByRole('button', { name: '취소' }));
		expect(onSubmit).not.toHaveBeenCalled();
		expect(onClose).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run tests and confirm fail**

```bash
npx vitest run tests/unit/VerseEditSheet.test.ts
```

Expected: fails because component doesn't exist.

- [ ] **Step 3: Implement component**

Create `src/lib/components/oyo/VerseEditSheet.svelte`:

```svelte
<script lang="ts">
	import { X } from 'lucide-svelte';

	export interface VerseEditValues {
		cite: string;
		title: string;
		w: string;
	}

	interface Props {
		mode: 'create' | 'edit';
		initial?: VerseEditValues;
		onSubmit: (values: VerseEditValues) => void;
		onClose: () => void;
	}
	let { mode, initial, onSubmit, onClose }: Props = $props();

	let cite = $state(initial?.cite ?? '');
	let title = $state(initial?.title ?? '');
	let w = $state(initial?.w ?? '');

	const canSave = $derived(cite.trim().length > 0 && w.trim().length > 0);

	function submit() {
		if (!canSave) return;
		onSubmit({ cite: cite.trim(), title: title.trim(), w: w.trim() });
		onClose();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKey} />

<div
	class="fixed inset-0 z-[55] bg-black/30"
	onclick={onClose}
	role="presentation"
	aria-hidden="true"
></div>

<div
	role="dialog"
	aria-modal="true"
	aria-labelledby="oyo-sheet-title"
	class="fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-2xl rounded-t-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 pb-6 pt-5 shadow-2xl"
	style="padding-bottom: calc(env(safe-area-inset-bottom) + 24px);"
>
	<div class="mb-4 flex items-center justify-between">
		<h2 id="oyo-sheet-title" class="text-[16px] font-semibold text-[var(--color-text)]">
			{mode === 'create' ? '구절 추가' : '구절 편집'}
		</h2>
		<button
			type="button"
			onclick={onClose}
			aria-label="닫기"
			class="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
		>
			<X size={18} strokeWidth={1.75} />
		</button>
	</div>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
		class="space-y-3"
	>
		<label class="block">
			<span class="text-[12px] font-medium text-[var(--color-text-secondary)]">인용</span>
			<input
				bind:value={cite}
				placeholder="요한복음 3:16"
				aria-label="인용"
				class="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2 text-[14px] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50"
			/>
		</label>

		<label class="block">
			<span class="text-[12px] font-medium text-[var(--color-text-secondary)]">제목 (선택)</span>
			<input
				bind:value={title}
				aria-label="제목 (선택)"
				class="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2 text-[14px] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50"
			/>
		</label>

		<label class="block">
			<span class="text-[12px] font-medium text-[var(--color-text-secondary)]">본문</span>
			<textarea
				bind:value={w}
				rows="5"
				aria-label="본문"
				class="mt-1 w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2 text-[14px] leading-relaxed text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50"
			></textarea>
		</label>

		<div class="flex items-center justify-end gap-2 pt-2">
			<button
				type="button"
				onclick={onClose}
				class="rounded-full px-4 py-2 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-elevated)]"
			>
				취소
			</button>
			<button
				type="submit"
				disabled={!canSave}
				class="rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
			>
				저장
			</button>
		</div>
	</form>
</div>
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
npx vitest run tests/unit/VerseEditSheet.test.ts
npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/oyo/VerseEditSheet.svelte tests/unit/VerseEditSheet.test.ts
git commit -m "$(cat <<'EOF'
feat(oyo): VerseEditSheet bottom-sheet for verse add/edit

Reusable for both create and edit modes — initial prefills come from
the parent. Cite + body are required; trimming applied at submit so
leading/trailing whitespace doesn't sneak into storage. Escape/backdrop
close, no submit-on-empty.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `/library/oyo` route — list, empty state, + 구절 추가 CTA

**Files:**
- Create: `src/routes/library/oyo/+page.svelte`
- (No new test file — covered by e2e in Task 8)

- [ ] **Step 1: Implement the route page**

Create `src/routes/library/oyo/+page.svelte`:

```svelte
<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import VerseCard from '$lib/components/card/VerseCard.svelte';
	import VerseEditSheet, {
		type VerseEditValues
	} from '$lib/components/oyo/VerseEditSheet.svelte';
	import Toast from '$lib/components/feedback/Toast.svelte';
	import { Plus, Eye, EyeOff } from 'lucide-svelte';
	import { getShowVerseTextInList, setShowVerseTextInList } from '$lib/db/viewOptions';
	import {
		createOyoVerse,
		deleteOyoVerse,
		listOyoVerses,
		restoreOyoVerse,
		updateOyoVerse
	} from '$lib/db/oyo';
	import type { StoredVerse } from '$lib/db/local';

	let verses = $state<StoredVerse[]>([]);
	let showVerseText = $state(true);
	let sheet = $state<{ mode: 'create' | 'edit'; initial?: VerseEditValues; editingNo?: number } | null>(null);
	let toast = $state<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null);

	$effect(() => {
		let active = true;
		(async () => {
			const [list, eyeState] = await Promise.all([
				listOyoVerses(),
				getShowVerseTextInList()
			]);
			if (active) {
				verses = list;
				showVerseText = eyeState;
			}
		})().catch(() => {});
		return () => {
			active = false;
		};
	});

	function toggleVerseText() {
		showVerseText = !showVerseText;
		setShowVerseTextInList(showVerseText).catch(() => {});
	}

	function openCreate() {
		sheet = { mode: 'create' };
	}

	function openEdit(verse: StoredVerse) {
		sheet = {
			mode: 'edit',
			initial: { cite: verse.cite, title: verse.title, w: verse.w },
			editingNo: verse.no
		};
	}

	async function onSheetSubmit(values: VerseEditValues) {
		if (sheet?.mode === 'create') {
			const created = await createOyoVerse(values);
			verses = [...verses, created].sort((a, b) => a.no - b.no);
		} else if (sheet?.mode === 'edit' && sheet.editingNo !== undefined) {
			const editingNo = sheet.editingNo;
			await updateOyoVerse(editingNo, values);
			verses = verses.map((v) => (v.no === editingNo ? { ...v, ...values } : v));
		}
	}

	async function onDelete(verse: StoredVerse) {
		const snapshot = await deleteOyoVerse(verse.no);
		verses = verses.filter((v) => v.no !== verse.no);
		if (!snapshot) return;
		toast = {
			message: '구절을 지웠어요',
			actionLabel: '실행 취소',
			onAction: async () => {
				await restoreOyoVerse(snapshot);
				verses = [...verses, snapshot].sort((a, b) => a.no - b.no);
			}
		};
	}
</script>

<Header title="내 구절" onBack={() => history.back()} />

<main class="mx-auto max-w-2xl px-5 pb-8 pt-4">
	<div class="mb-3 flex items-center justify-between px-1">
		<p class="text-[13px] text-[var(--color-text-secondary)]">
			총 <span class="font-semibold text-[var(--color-text)]">{verses.length}개</span>
		</p>
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={openCreate}
				class="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-3.5 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
			>
				<Plus size={14} strokeWidth={2} />
				구절 추가
			</button>
			<button
				type="button"
				onclick={toggleVerseText}
				aria-pressed={showVerseText}
				aria-label={showVerseText ? '구절 본문 표시 끄기' : '구절 본문 표시 켜기'}
				class="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
			>
				{#if showVerseText}
					<Eye size={16} />
				{:else}
					<EyeOff size={16} />
				{/if}
			</button>
		</div>
	</div>

	{#if verses.length === 0}
		<section
			class="empty-card rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-7 py-12 text-center"
		>
			<p class="text-[15px] text-[var(--color-text-secondary)]">
				아직 추가된 구절이 없어요.
			</p>
			<p class="mt-2 text-[13px] text-[var(--color-text-tertiary)]">
				위의 "구절 추가" 버튼을 눌러 첫 구절을 만들어 보세요.
			</p>
		</section>
	{:else}
		<div class="space-y-5">
			{#each verses as verse (verse.no)}
				{#key verse.no}
					<VerseCard
						{verse}
						packageName="OYO"
						packageId="oyo"
						showBody={showVerseText}
					/>
				{/key}
			{/each}
		</div>
	{/if}
</main>

{#if sheet}
	<VerseEditSheet
		mode={sheet.mode}
		initial={sheet.initial}
		onSubmit={onSheetSubmit}
		onClose={() => (sheet = null)}
	/>
{/if}

{#if toast}
	<Toast
		message={toast.message}
		actionLabel={toast.actionLabel}
		onAction={toast.onAction}
		onClose={() => (toast = null)}
	/>
{/if}

<style>
	.empty-card {
		box-shadow: var(--shadow-soft);
	}
</style>
```

(Edit affordance and overflow menu come in Task 7; this task ships create + view + delete + Eye + empty state.)

Wait — `onDelete` is called from where? Right, Task 7 adds the overflow menu that surfaces edit/delete. For now this file references `openEdit` and `onDelete` but doesn't expose them in the UI. That's fine; Task 7 wires them.

- [ ] **Step 2: Confirm the page renders by visiting it**

Start dev server if not running:

```bash
npm run dev
```

Open `http://localhost:5173/library/oyo` (or whichever port). Expected: empty state visible, "구절 추가" button at top-right.

- [ ] **Step 3: Smoke-create a verse manually**

Click "구절 추가", fill cite="요 3:16", body="하나님이 …", save. The sheet closes; the verse appears as a VerseCard.

- [ ] **Step 4: Run full suite**

```bash
npm test
```

Expected: all green (no new tests in this task; e2e in Task 8 will cover this path).

- [ ] **Step 5: Commit**

```bash
git add src/routes/library/oyo/+page.svelte
git commit -m "$(cat <<'EOF'
feat(oyo): /library/oyo route — verse list + empty state + add CTA

Dedicated concrete route beats the dynamic [packageId] route so the
curated detail page stays untouched. Wires the VerseEditSheet for
create + the existing Toast for delete-with-undo. Eye toggle reuses
the global viewOptions setting and applies showBody to each VerseCard.

Per-row edit and delete affordance lands in the next commit (overflow
menu).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Per-card overflow menu (edit / delete)

**Files:**
- Create: `src/lib/components/oyo/VerseOverflowMenu.svelte`
- Modify: `src/lib/components/card/VerseCard.svelte` — accept optional `onEdit` / `onDelete` slots
- Modify: `src/routes/library/oyo/+page.svelte` — pass handlers

- [ ] **Step 1: Add optional edit/delete props to VerseCard**

In `src/lib/components/card/VerseCard.svelte`, extend the Props interface:

```ts
interface Props {
	verse: StoredVerse;
	packageName?: string;
	packageId?: string;
	tags?: VerseTag[];
	bookmark?: BookmarkColor | null;
	onBookmarkPick?: (color: BookmarkColor) => void;
	onBookmarkClear?: () => void;
	showBody?: boolean;
	/** When provided, render an overflow `…` menu with edit/delete actions. OYO only. */
	onEdit?: () => void;
	onDelete?: () => void;
}
let {
	verse,
	packageName,
	packageId,
	tags = [],
	bookmark = null,
	onBookmarkPick,
	onBookmarkClear,
	showBody = true,
	onEdit,
	onDelete
}: Props = $props();

const editingEnabled = $derived(Boolean(onEdit) || Boolean(onDelete));
```

Import the overflow menu near the other imports:

```ts
import VerseOverflowMenu from '$lib/components/oyo/VerseOverflowMenu.svelte';
```

And in the header `<header>` block of the card (next to verse number badge), conditionally render:

```svelte
{#if editingEnabled}
	<VerseOverflowMenu {onEdit} {onDelete} />
{/if}
```

Place it inside the existing flex row that contains the package label and verse number — typically right after the verse number `<span>`.

- [ ] **Step 2: Implement VerseOverflowMenu**

Create `src/lib/components/oyo/VerseOverflowMenu.svelte`:

```svelte
<script lang="ts">
	import { MoreHorizontal, Pencil, Trash2 } from 'lucide-svelte';

	interface Props {
		onEdit?: () => void;
		onDelete?: () => void;
	}
	let { onEdit, onDelete }: Props = $props();

	let open = $state(false);
	let triggerEl: HTMLButtonElement | undefined = $state();
	let menuStyle = $state('');

	function toggle() {
		if (open) {
			open = false;
			return;
		}
		if (!triggerEl) return;
		const r = triggerEl.getBoundingClientRect();
		menuStyle = `top: ${r.bottom + 4}px; left: ${r.right - 140}px;`;
		open = true;
	}

	function onKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape') open = false;
	}

	function handleEdit() {
		open = false;
		onEdit?.();
	}

	function handleDelete() {
		open = false;
		onDelete?.();
	}
</script>

<svelte:window onkeydown={onKey} />

<button
	bind:this={triggerEl}
	type="button"
	onclick={toggle}
	aria-haspopup="menu"
	aria-expanded={open}
	aria-label="구절 메뉴"
	class="-mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
>
	<MoreHorizontal size={18} strokeWidth={1.75} />
</button>

{#if open}
	<div
		class="fixed inset-0 z-[55]"
		onclick={() => (open = false)}
		role="presentation"
		aria-hidden="true"
	></div>
	<div
		role="menu"
		aria-label="구절 액션"
		class="fixed z-[60] min-w-[140px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] py-1 shadow-lg"
		style={menuStyle}
	>
		{#if onEdit}
			<button
				type="button"
				role="menuitem"
				onclick={handleEdit}
				class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[var(--color-text)] transition-colors hover:bg-[var(--color-elevated)]"
			>
				<Pencil size={14} strokeWidth={1.75} />
				편집
			</button>
		{/if}
		{#if onDelete}
			<button
				type="button"
				role="menuitem"
				onclick={handleDelete}
				class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[var(--color-danger)] transition-colors hover:bg-[var(--color-elevated)]"
			>
				<Trash2 size={14} strokeWidth={1.75} />
				삭제
			</button>
		{/if}
	</div>
{/if}
```

- [ ] **Step 3: Wire handlers in `/library/oyo` page**

In `src/routes/library/oyo/+page.svelte`, update the `{#each}` block to pass the handlers:

```svelte
{#each verses as verse (verse.no)}
	{#key verse.no}
		<VerseCard
			{verse}
			packageName="OYO"
			packageId="oyo"
			showBody={showVerseText}
			onEdit={() => openEdit(verse)}
			onDelete={() => onDelete(verse)}
		/>
	{/key}
{/each}
```

- [ ] **Step 4: Quick visual smoke test**

```bash
npm run dev
```

Open `/library/oyo`, ensure a verse exists. Tap the `…` icon — menu appears with 편집 / 삭제. Tap 편집: sheet opens prefilled. Tap 삭제: toast appears with 실행 취소; verse vanishes. Undo restores it.

- [ ] **Step 5: Run full suite (VerseCard tests should still pass)**

```bash
npm test
```

Expected: all green. Existing VerseCard tests do not pass `onEdit` / `onDelete`, so `editingEnabled` is false and the overflow menu doesn't render — no breakage.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/oyo/VerseOverflowMenu.svelte src/lib/components/card/VerseCard.svelte src/routes/library/oyo/+page.svelte
git commit -m "$(cat <<'EOF'
feat(oyo): per-card edit/delete overflow menu

Adds optional onEdit/onDelete props to VerseCard. When either is set,
a … overflow menu renders next to the verse number; built-in package
detail pages don't pass them, so the affordance is invisible there.
The OYO page wires the menu to reopen VerseEditSheet in edit mode and
to the existing delete-with-undo toast.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Playwright e2e — full Phase 1 happy path

**Files:**
- Create: `tests/e2e/oyo.spec.ts`

- [ ] **Step 1: Write the e2e spec**

Create `tests/e2e/oyo.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('OYO package — phase 1', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/library');
		await page.evaluate(async () => {
			const dbs = await indexedDB.databases();
			for (const d of dbs) {
				if (d.name)
					await new Promise((res) => {
						const req = indexedDB.deleteDatabase(d.name!);
						req.onsuccess = () => res(null);
						req.onerror = () => res(null);
						req.onblocked = () => res(null);
					});
			}
		});
		await page.reload();
	});

	test('add → view → edit → delete (with undo) on /library/oyo', async ({ page }) => {
		// Library list shows the OYO card with chip
		await page.goto('/library');
		await expect(page.getByText('사용자 정의')).toBeVisible();

		// Tap OYO card
		await page.getByRole('link', { name: /OYO/i }).click();
		await expect(page).toHaveURL(/\/library\/oyo$/);
		await expect(page.getByText('아직 추가된 구절이 없어요.')).toBeVisible();

		// Add a verse
		await page.getByRole('button', { name: /구절 추가/ }).click();
		await page.getByLabel('인용').fill('요 3:16');
		await page.getByLabel('제목 (선택)').fill('영생');
		await page.getByLabel('본문').fill('하나님이 세상을 이처럼 사랑하사…');
		await page.getByRole('button', { name: '저장' }).click();

		// Verse renders
		await expect(page.getByText('영생')).toBeVisible();
		await expect(page.getByText('요 3:16')).toBeVisible();
		await expect(page.getByText('총 1개')).toBeVisible();

		// Edit it
		await page.getByRole('button', { name: '구절 메뉴' }).click();
		await page.getByRole('menuitem', { name: /편집/ }).click();
		await page.getByLabel('제목 (선택)').fill('영생 (요한복음)');
		await page.getByRole('button', { name: '저장' }).click();
		await expect(page.getByText('영생 (요한복음)')).toBeVisible();

		// Delete with undo
		await page.getByRole('button', { name: '구절 메뉴' }).click();
		await page.getByRole('menuitem', { name: /삭제/ }).click();
		await expect(page.getByText('아직 추가된 구절이 없어요.')).toBeVisible();
		await expect(page.getByRole('status')).toContainText('구절을 지웠어요');
		await page.getByRole('button', { name: '실행 취소' }).click();
		await expect(page.getByText('영생 (요한복음)')).toBeVisible();
	});
});
```

- [ ] **Step 2: Run the e2e**

```bash
npx playwright test tests/e2e/oyo.spec.ts
```

Expected: pass. If the test runner needs the dev server up, the project's playwright config likely already handles it — if not, start `npm run dev` in another shell first.

- [ ] **Step 3: Run the full e2e suite to confirm no regressions**

```bash
npx playwright test
```

Expected: all green (existing today.spec.ts is .skip'd; home.spec.ts and oyo.spec.ts should pass).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/oyo.spec.ts
git commit -m "$(cat <<'EOF'
test(oyo): e2e happy-path for add / edit / delete-with-undo

Single test walks the full Phase 1 flow: clear IDB, assert the OYO
card with chip on /library, navigate, create a verse via the sheet,
confirm it renders, edit via the overflow menu, delete via the menu,
verify the empty state + toast, then 실행 취소 and confirm restore.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Summary

**Spec coverage check:**
- Spec Phase 1 item 1 (`source` field + backfill) → Task 1 (renamed to `kind`, rationale captured in plan preamble and spec needs follow-up edit if user cares about consistency)
- Spec Phase 1 item 2 (`seedOyoPackageIfMissing`) → Task 3
- Spec Phase 1 item 3 (OYO card + chip) → Tasks 1, 2 (chip), 3 (seed makes it visible)
- Spec Phase 1 item 4 (`/library/oyo` page with list + CTA + overflow menu) → Tasks 6 + 7
- Spec Phase 1 item 5 (verse add/edit sheet) → Task 5
- Spec Phase 1 item 6 (delete with undo toast) → Tasks 4 + 7 (restore helper + wiring)
- Spec Phase 1 item 7 (test coverage) → Tasks 1, 2, 3, 4, 5 (unit) + 8 (e2e)

**Placeholder scan:** No TBDs, all code blocks contain real code, all commit messages and bash commands are concrete.

**Type consistency:** `VerseEditValues` defined in Task 5 is imported by name in Task 6. CRUD function names (`createOyoVerse`, etc.) are used consistently across Tasks 4, 6, 7. `OYO_PACKAGE_ID` from Task 3 is referenced in Task 4.

**Scope check:** Phase 1 only — tags (Phase 2) and backup (Phase 3) are not touched here.

