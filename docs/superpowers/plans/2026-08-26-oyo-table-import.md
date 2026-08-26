# 표로 구절 가져오기 (Table Import) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a reader add many OYO verses at once by handing the app a CSV file or a block of cells copied out of a spreadsheet.

**Architecture:** Four pure modules turn bytes into draft verses — decode, parse, map columns, fill missing bodies — behind a three-step screen (`pick → confirm → review`). The confirm step is the load-bearing one: everything before it is pure and instant, so column guesses can be corrected freely, and the only expensive work (fetching scripture text) runs once, after a person has agreed to the mapping.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, Dexie (IndexedDB), Tailwind v4, Vitest + @testing-library/svelte, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-26-oyo-table-import-design.md`

## Global Constraints

- **No new npm dependencies.** CSV parsing, encoding fallback and column detection are all hand-rolled; the repo already refuses libraries for zip/xlsx writing for the same reason.
- **Korean UI copy, verbatim.** Every user-visible string in this plan is final. Do not translate, paraphrase, or "improve" them.
- **`MAX_IMPORT_VERSES = 200`** — one shared constant, used by both the deeplink door and the table door.
- **Svelte 5 runes only** (`$state`, `$derived`, `$props`, `$bindable`, `$effect`). No Svelte 4 stores or `export let`.
- **Tailwind classes must use the `var(--color-*)` tokens** already used across the app (`--color-text`, `--color-text-secondary`, `--color-text-tertiary`, `--color-border`, `--color-card`, `--color-elevated`, `--color-accent`, `--color-accent-soft`, `--color-on-accent`, `--color-success`). Never hardcode hex.
- **Tests live in `tests/unit/*.test.ts`** and import source by relative path (`../../src/lib/...`). Source files import each other with the `$lib` alias.
- **Run the full suite before every commit:** `pnpm test`. A task is not done while any test fails.
- **`.xlsx` files are never parsed.** They are detected and refused with a message pointing at paste and CSV-save.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/utils/columnName.ts` | **New (moved).** `0 → A`, `26 → AA`. Bijective base-26 column letters. |
| `src/lib/utils/cleanText.ts` | **New.** The one whitespace rule (`\s+ → ' '`, trim) shared by the link parser, the table parser and citation normalisation. |
| `src/lib/oyo/cite.ts` | **New (moved).** `normalizeCite`, `duplicateIndexes`, `MAX_IMPORT_VERSES` — what *any* import door needs. |
| `src/lib/oyo/tableText.ts` | **New.** Bytes → text. Size guard, `.xlsx` refusal, strict-UTF-8-then-EUC-KR decode, BOM strip. |
| `src/lib/oyo/tableParse.ts` | **New.** Text → `string[][]`. Delimiter detection and RFC 4180 quoting. |
| `src/lib/oyo/tableColumns.ts` | **New.** Grid → column mapping → `TableDraft[]`. All the guessing lives here. |
| `src/lib/oyo/autofill.ts` | **New.** Fetch bodies for drafts that lack one, grouped by chapter, with a timeout and a breaker. |
| `src/lib/components/oyo/VerseReviewList.svelte` | **New (extracted).** The review row list, shared by both import doors. |
| `src/lib/components/oyo/ColumnMapper.svelte` | **New.** Three selects and a header checkbox. |
| `src/routes/oyo/import/table/+page.svelte` | **New.** The `pick → confirm → review → saved` screen. |
| `src/lib/oyo/importLink.ts` | **Modify.** Imports the citation helpers from their new home. |
| `src/lib/export/xlsx.ts` | **Modify.** Imports `columnName` from its new home. |
| `src/routes/oyo/import/+page.svelte` | **Modify.** Renders `VerseReviewList` instead of its own `<ul>`. |
| `src/routes/library/oyo/+page.svelte` | **Modify.** 가져오기 becomes a two-item menu. |

Two files here are not named in the spec's Scope line: `utils/cleanText.ts` and this plan's use of it. The spec requires the table parser to apply "the same `\s+ → ' '` + trim rule the deeplink parser uses"; with three consumers, that rule needs one home rather than three copies.

**Dependency order** (each task only consumes what earlier tasks produced):

```
1 columnName ─────────────┐
2 cleanText + cite ───┬───┼──▶ 5 applyMapping ──▶ 6 detectColumns ──▶ 7 autofill
3 tableText           │   │                                              │
4 tableParse ─────────┘   └──▶ 9 ColumnMapper                            │
                                                8 VerseReviewList ◀──────┘
                                                        │
                                          10 table page ─┴──▶ 11 library menu ──▶ 12 E2E
```

---

### Task 1: Move `columnName` to a shared utility

`ColumnMapper` needs Excel's column letters for its dropdown labels. They currently live inside the xlsx writer, and importing them from there would pull a zip encoder into the dependency graph of a `<select>` label.

**Files:**
- Create: `src/lib/utils/columnName.ts`
- Create: `tests/unit/columnName.test.ts`
- Modify: `src/lib/export/xlsx.ts` (remove the function, import it instead)
- Modify: `tests/unit/xlsx.test.ts` (drop the moved import and describe block)

**Interfaces:**
- Consumes: nothing.
- Produces: `columnName(index0: number): string` from `$lib/utils/columnName`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/columnName.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { columnName } from '../../src/lib/utils/columnName';

describe('columnName', () => {
	it('maps a zero-based index to a spreadsheet column letter', () => {
		expect(columnName(0)).toBe('A');
		expect(columnName(25)).toBe('Z');
		expect(columnName(26)).toBe('AA');
		expect(columnName(27)).toBe('AB');
	});

	it('keeps carrying past two letters', () => {
		expect(columnName(51)).toBe('AZ');
		expect(columnName(52)).toBe('BA');
		expect(columnName(701)).toBe('ZZ');
		expect(columnName(702)).toBe('AAA');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/columnName.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/utils/columnName"`.

- [ ] **Step 3: Create the module**

Create `src/lib/utils/columnName.ts`:

```ts
/** 0 → A, 25 → Z, 26 → AA. Spreadsheet columns are bijective base-26, so
 *  this is not a plain radix conversion. */
export function columnName(index0: number): string {
	let n = index0 + 1;
	let s = '';
	while (n > 0) {
		const r = (n - 1) % 26;
		s = String.fromCharCode(65 + r) + s;
		n = Math.floor((n - 1) / 26);
	}
	return s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/columnName.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Point the xlsx writer at the new home**

In `src/lib/export/xlsx.ts`, delete this block (it is around line 44–56):

```ts
/** 0 → A, 25 → Z, 26 → AA. Spreadsheet columns are bijective base-26, so
 *  this is not a plain radix conversion. */
export function columnName(index0: number): string {
	let n = index0 + 1;
	let s = '';
	while (n > 0) {
		const r = (n - 1) % 26;
		s = String.fromCharCode(65 + r) + s;
		n = Math.floor((n - 1) / 26);
	}
	return s;
}
```

and add to the imports at the top of the file, directly under the existing `import { zipStore, type ZipEntry } from './zip';`:

```ts
import { columnName } from '$lib/utils/columnName';
```

- [ ] **Step 6: Update the xlsx test's imports**

In `tests/unit/xlsx.test.ts`, change line 2 from:

```ts
import { columnName, sanitizeSheetName, writeXlsx, type Sheet } from '../../src/lib/export/xlsx';
```

to:

```ts
import { sanitizeSheetName, writeXlsx, type Sheet } from '../../src/lib/export/xlsx';
```

and delete the whole `describe('columnName', ...)` block (around lines 45–52) — it now lives in `columnName.test.ts`.

- [ ] **Step 7: Run the full suite**

Run: `pnpm test`
Expected: PASS. Same total count as before, minus the one moved `columnName` test and plus the two new ones.

- [ ] **Step 8: Commit**

```bash
git add src/lib/utils/columnName.ts tests/unit/columnName.test.ts src/lib/export/xlsx.ts tests/unit/xlsx.test.ts
git commit -m "refactor: column letters are not the xlsx writer's private business"
```

---

### Task 2: Extract the citation helpers into `oyo/cite.ts`

`normalizeCite` and `duplicateIndexes` were written for the deeplink door, but neither is link-specific: normalising a reference and spotting one the reader already has is what any import needs. Moving them also breaks a type cycle before it forms.

**Files:**
- Create: `src/lib/utils/cleanText.ts`
- Create: `src/lib/oyo/cite.ts`
- Create: `tests/unit/cite.test.ts`
- Modify: `src/lib/oyo/importLink.ts`
- Modify: `src/routes/oyo/import/+page.svelte` (import path only)
- Modify: `tests/unit/importLink.test.ts` (drop the moved describes)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `cleanText(value: unknown): string` from `$lib/utils/cleanText`
  - `MAX_IMPORT_VERSES: 200`, `normalizeCite(cite: string): string`, `duplicateIndexes(verses: readonly { cite: string }[], existingCites: string[]): Set<number>` from `$lib/oyo/cite`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/cite.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MAX_IMPORT_VERSES, normalizeCite, duplicateIndexes } from '../../src/lib/oyo/cite';

describe('normalizeCite', () => {
	it('rewrites an abbreviated reference into the standard shape', () => {
		expect(normalizeCite('창 12:1')).toBe('창세기 12 : 1');
		expect(normalizeCite('요3:16')).toBe('요한복음 3 : 16');
		expect(normalizeCite('창세기 12 : 1')).toBe('창세기 12 : 1');
	});

	it('keeps a reference it cannot parse rather than dropping it', () => {
		expect(normalizeCite('토비트 3 : 1')).toBe('토비트 3 : 1');
	});

	it('squeezes whitespace before parsing', () => {
		expect(normalizeCite('  요   3:16  ')).toBe('요한복음 3 : 16');
	});
});

describe('duplicateIndexes', () => {
	it('flags a row whose citation the reader already has', () => {
		const incoming = [{ cite: '창세기 12 : 1' }, { cite: '창세기 12 : 2' }];
		expect([...duplicateIndexes(incoming, ['창세기 12 : 1'])]).toEqual([0]);
	});

	it('normalises both sides before comparing', () => {
		const incoming = [{ cite: '창세기 12 : 1' }, { cite: '창세기 12 : 2' }];
		expect([...duplicateIndexes(incoming, ['창 12:2'])]).toEqual([1]);
	});

	it('ignores blank existing citations', () => {
		const incoming = [{ cite: '창세기 12 : 1' }];
		expect(duplicateIndexes(incoming, ['', '   ']).size).toBe(0);
	});

	it('accepts any object carrying a cite, not just an ImportVerse', () => {
		const drafts = [{ row: 1, cite: '요한복음 3 : 16', title: '', w: '' }];
		expect([...duplicateIndexes(drafts, ['요 3:16'])]).toEqual([0]);
	});

	it('bounds one import at 200 verses', () => {
		expect(MAX_IMPORT_VERSES).toBe(200);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/cite.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/oyo/cite"`.

- [ ] **Step 3: Create the shared whitespace rule**

Create `src/lib/utils/cleanText.ts`:

```ts
/**
 * The one whitespace rule for text arriving from outside this app.
 *
 * Scripture reaches us from a link payload, a pasted spreadsheet cell and a
 * CSV field, and each of those carries its own idea of a line break. A verse
 * is stored as one line, so every door squeezes runs of whitespace to a
 * single space and trims the ends — here, once, rather than three times.
 *
 * Takes `unknown` because callers are reading parsed JSON and array indexes
 * that may not hold a string at all; a non-string is not an error, it is an
 * absent value, and absent reads as ''.
 */
export function cleanText(value: unknown): string {
	return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}
```

- [ ] **Step 4: Create the citation module**

Create `src/lib/oyo/cite.ts`:

```ts
import { formatStandardRef, parsePassageRef } from '$lib/bible/index';
import { cleanText } from '$lib/utils/cleanText';

/**
 * The most verses one import may carry, whichever door it came through.
 *
 * Well past any real selection — a chapter of Psalm 119 is 176 verses —
 * while still bounding the work a single tap can queue up. For a link it
 * also guards a hand-built or truncated URL; for a pasted table it bounds
 * how many chapters the body fill may go and fetch.
 */
export const MAX_IMPORT_VERSES = 200;

/**
 * Rewrites an incoming citation into this project's standard shape, so an
 * imported verse is indistinguishable from one added by hand — "창 12:1" and
 * "창세기 12 : 1" both become the latter.
 *
 * A citation this app cannot parse is kept verbatim rather than rejected.
 * The sender may know about a book naming this one does not, and a verse
 * whose reference reads oddly is worth far more than no verse at all.
 */
export function normalizeCite(cite: string): string {
	const trimmed = cleanText(cite);
	const parsed = parsePassageRef(trimmed);
	return parsed ? formatStandardRef(parsed) : trimmed;
}

/**
 * Which incoming rows the reader already has.
 *
 * Matched on the citation alone, not the body: the point is to stop a second
 * import of the same set from producing twins, and two rows with the same
 * reference are the same verse whatever whitespace differs. Both sides go
 * through normalizeCite so a hand-typed "창 12:1" matches an imported
 * "창세기 12 : 1".
 *
 * Returns indexes rather than filtering, because the screen still shows a
 * duplicate — unchecked, and labelled — instead of silently dropping a row
 * the reader chose to send.
 *
 * Typed on the shape it actually reads rather than on any one door's verse
 * type, so a link payload and a table draft can both be handed to it without
 * this module having to know about either.
 */
export function duplicateIndexes(
	verses: readonly { cite: string }[],
	existingCites: string[]
): Set<number> {
	const have = new Set(existingCites.map(normalizeCite).filter((c) => c.length > 0));
	const out = new Set<number>();
	verses.forEach((v, i) => {
		if (have.has(v.cite)) out.add(i);
	});
	return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/cite.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Strip the moved code out of `importLink.ts`**

In `src/lib/oyo/importLink.ts`:

1. Replace the import line at the top:

```ts
import { formatStandardRef, parsePassageRef } from '$lib/bible/index';
```

with:

```ts
import { cleanText } from '$lib/utils/cleanText';
import { duplicateIndexes, MAX_IMPORT_VERSES, normalizeCite } from './cite';
```

2. Delete the `MAX_IMPORT_VERSES` declaration and its doc comment.
3. Delete the local `cleanText` function.
4. Delete `normalizeCite` and its doc comment.
5. Delete `duplicateIndexes` and its doc comment (the last function in the file).
6. Add a re-export line directly under the imports so existing consumers keep working:

```ts
// Re-exported because the deeplink protocol is still where readers of this
// file expect to find the import's size bound.
export { MAX_IMPORT_VERSES, normalizeCite, duplicateIndexes };
```

Everything else in the file — `IMPORT_VERSION`, `ImportVerse`, `ImportPayload`, `ImportResult`, `decodeBase64Utf8`, `readFragmentParam`, `parseVerse`, `parseImportFragment`, `buildImportLink` — stays exactly as it is.

- [ ] **Step 7: Trim the moved describes out of `importLink.test.ts`**

In `tests/unit/importLink.test.ts`, delete the `describe('normalizeCite', ...)` and `describe('duplicateIndexes', ...)` blocks (they are the last two, around lines 184–223). Leave the import list at the top unchanged — `importLink.ts` re-exports all three names, so the `MAX_IMPORT_VERSES` assertions inside the envelope tests still resolve.

- [ ] **Step 8: Run the full suite**

Run: `pnpm test`
Expected: PASS. The deeplink import page compiles unchanged because `duplicateIndexes` is still exported from `importLink.ts`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/utils/cleanText.ts src/lib/oyo/cite.ts tests/unit/cite.test.ts src/lib/oyo/importLink.ts tests/unit/importLink.test.ts
git commit -m "refactor: normalising a citation was never the link's private business"
```

---

### Task 3: `tableText.ts` — bytes into text

Korean Excel's plain "CSV 저장" writes CP949, not UTF-8. `File.text()` assumes UTF-8, so 요한복음 arrives as mojibake with no error raised anywhere — the most likely way this feature could fail silently.

**Files:**
- Create: `src/lib/oyo/tableText.ts`
- Create: `tests/unit/tableText.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, from `$lib/oyo/tableText`:
  - `type TableFileErrorKind = 'too-large' | 'xlsx' | 'empty'`
  - `class TableFileError extends Error` with a readonly `kind: TableFileErrorKind`
  - `const MAX_TABLE_FILE_BYTES = 2 * 1024 * 1024`
  - `interface DecodedTable { text: string; encoding: 'utf-8' | 'euc-kr' }`
  - `decodeTableFile(bytes: Uint8Array): DecodedTable`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tableText.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
	decodeTableFile,
	MAX_TABLE_FILE_BYTES,
	TableFileError
} from '../../src/lib/oyo/tableText';

/** CP949 bytes for 요한복음 — what Korean Excel's plain CSV save produces. */
const CP949_YOHAN = new Uint8Array([0xbf, 0xe4, 0xc7, 0xd1, 0xba, 0xb9, 0xc0, 0xbd]);

function utf8(s: string): Uint8Array {
	return new TextEncoder().encode(s);
}

describe('decodeTableFile', () => {
	it('reads UTF-8 as UTF-8', () => {
		const out = decodeTableFile(utf8('장절,제목\n요 3:16,영생'));
		expect(out.encoding).toBe('utf-8');
		expect(out.text).toBe('장절,제목\n요 3:16,영생');
	});

	it('falls back to EUC-KR when strict UTF-8 refuses the bytes', () => {
		const out = decodeTableFile(CP949_YOHAN);
		expect(out.encoding).toBe('euc-kr');
		expect(out.text).toBe('요한복음');
	});

	it('strips a UTF-8 BOM, which Excel writes on "CSV UTF-8"', () => {
		const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('장절')]);
		expect(decodeTableFile(withBom).text).toBe('장절');
	});

	it('refuses a zip, which is almost always a picked .xlsx', () => {
		const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
		expect(() => decodeTableFile(zip)).toThrowError(
			expect.objectContaining({ kind: 'xlsx' })
		);
	});

	it('refuses a file over the size cap', () => {
		const big = new Uint8Array(MAX_TABLE_FILE_BYTES + 1);
		expect(() => decodeTableFile(big)).toThrowError(
			expect.objectContaining({ kind: 'too-large' })
		);
	});

	it('refuses zero bytes', () => {
		expect(() => decodeTableFile(new Uint8Array(0))).toThrowError(
			expect.objectContaining({ kind: 'empty' })
		);
	});

	it('refuses a file that decodes to nothing but whitespace', () => {
		expect(() => decodeTableFile(utf8('   \n\n\t '))).toThrowError(
			expect.objectContaining({ kind: 'empty' })
		);
	});

	it('throws a TableFileError, so callers can branch on kind', () => {
		try {
			decodeTableFile(new Uint8Array(0));
			expect.unreachable('should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(TableFileError);
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tableText.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/oyo/tableText"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/oyo/tableText.ts`:

```ts
/**
 * Turns the bytes of a picked file into text a parser can read.
 *
 * The encoding fallback is the reason this module exists. Korean Excel's
 * plain "CSV 저장" writes CP949, not UTF-8, and `File.text()` assumes UTF-8 —
 * which turns 요한복음 into mojibake and raises nothing. Decoding strictly
 * first makes the wrong guess *fail* instead of succeeding quietly, and a
 * failure is something we can act on.
 */

export type TableFileErrorKind = 'too-large' | 'xlsx' | 'empty';

/** Carries a `kind` rather than a message, so the screen owns the Korean
 *  copy and this module owns the facts. */
export class TableFileError extends Error {
	readonly kind: TableFileErrorKind;

	constructor(kind: TableFileErrorKind) {
		super(kind);
		this.name = 'TableFileError';
		this.kind = kind;
	}
}

/** A verse list is kilobytes. Two megabytes is far past any real table and
 *  keeps a mis-picked video out of the decoder. */
export const MAX_TABLE_FILE_BYTES = 2 * 1024 * 1024;

export interface DecodedTable {
	text: string;
	/** Which decode won. Read by the tests; no screen mentions it. */
	encoding: 'utf-8' | 'euc-kr';
}

/** Local zip file header. Every .xlsx starts with it, because .xlsx is a zip. */
function looksLikeZip(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 4 &&
		bytes[0] === 0x50 &&
		bytes[1] === 0x4b &&
		bytes[2] === 0x03 &&
		bytes[3] === 0x04
	);
}

export function decodeTableFile(bytes: Uint8Array): DecodedTable {
	if (bytes.length > MAX_TABLE_FILE_BYTES) throw new TableFileError('too-large');
	if (bytes.length === 0) throw new TableFileError('empty');
	// Checked before decoding: a zip's bytes are not text in any encoding, and
	// "this is an Excel file" is a far more useful thing to say than "this file
	// is unreadable".
	if (looksLikeZip(bytes)) throw new TableFileError('xlsx');

	let text: string;
	let encoding: 'utf-8' | 'euc-kr';
	try {
		// `fatal` is the whole point — without it a CP949 byte becomes U+FFFD
		// and the decode "succeeds" with garbage.
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		encoding = 'utf-8';
	} catch {
		// Required of every browser by the Encoding Standard, and present in
		// Node's full-ICU build, so this costs no dependency.
		text = new TextDecoder('euc-kr').decode(bytes);
		encoding = 'euc-kr';
	}

	// Excel's "CSV UTF-8" writes a BOM. Left in place it would ride along on
	// the first header cell and stop it matching any synonym.
	if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
	if (text.trim().length === 0) throw new TableFileError('empty');

	return { text, encoding };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/tableText.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/oyo/tableText.ts tests/unit/tableText.test.ts
git commit -m "feat(import): decode strictly, so the wrong guess fails loudly"
```

---

### Task 4: `tableParse.ts` — text into a grid

**Files:**
- Create: `src/lib/oyo/tableParse.ts`
- Create: `tests/unit/tableParse.test.ts`

**Interfaces:**
- Consumes: `cleanText` from `$lib/utils/cleanText` (Task 2).
- Produces, from `$lib/oyo/tableParse`:
  - `detectDelimiter(text: string): ',' | '\t'`
  - `parseDelimited(text: string): string[][]`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tableParse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectDelimiter, parseDelimited } from '../../src/lib/oyo/tableParse';

describe('detectDelimiter', () => {
	it('picks comma for a CSV', () => {
		expect(detectDelimiter('장절,제목,본문\n요 3:16,영생,하나님이')).toBe(',');
	});

	it('picks tab for spreadsheet clipboard data', () => {
		expect(detectDelimiter('장절\t제목\t본문\n요 3:16\t영생\t하나님이')).toBe('\t');
	});

	it('ignores commas inside quotes when counting', () => {
		expect(detectDelimiter('a\t"x,y,z,w,v"\nb\t"p,q,r,s,t"')).toBe('\t');
	});

	it('defaults to comma when neither appears', () => {
		expect(detectDelimiter('요 3:16\n창 12:1')).toBe(',');
	});
});

describe('parseDelimited', () => {
	it('splits a plain CSV into rows and cells', () => {
		expect(parseDelimited('장절,제목\n요 3:16,영생')).toEqual([
			['장절', '제목'],
			['요 3:16', '영생']
		]);
	});

	it('keeps a comma that lives inside a quoted body', () => {
		const csv = '장절,본문\n요 3:16,"하나님이 세상을 이처럼 사랑하사, 독생자를 주셨으니"';
		expect(parseDelimited(csv)[1]).toEqual([
			'요 3:16',
			'하나님이 세상을 이처럼 사랑하사, 독생자를 주셨으니'
		]);
	});

	it('folds a newline inside a quoted field into a single line', () => {
		const csv = '장절,본문\n요 3:16,"하나님이 세상을\n이처럼 사랑하사"';
		expect(parseDelimited(csv)).toHaveLength(2);
		expect(parseDelimited(csv)[1][1]).toBe('하나님이 세상을 이처럼 사랑하사');
	});

	it('reads "" as a literal quote', () => {
		expect(parseDelimited('a,"그가 ""아멘"" 하니"')[0][1]).toBe('그가 "아멘" 하니');
	});

	it('accepts CRLF and bare CR as row breaks', () => {
		expect(parseDelimited('a,b\r\nc,d\re,f')).toEqual([
			['a', 'b'],
			['c', 'd'],
			['e', 'f']
		]);
	});

	it('drops rows that are entirely empty', () => {
		expect(parseDelimited('a,b\n\n,,\nc,d\n')).toEqual([
			['a', 'b'],
			['c', 'd']
		]);
	});

	it('squeezes whitespace inside every cell', () => {
		expect(parseDelimited('  요   3:16  ,  영생 ')).toEqual([['요 3:16', '영생']]);
	});

	it('parses a tab-separated paste', () => {
		expect(parseDelimited('요 3:16\t영생\n창 12:1\t부르심')).toEqual([
			['요 3:16', '영생'],
			['창 12:1', '부르심']
		]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tableParse.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/oyo/tableParse"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/oyo/tableParse.ts`:

```ts
import { cleanText } from '$lib/utils/cleanText';

/**
 * Turns a CSV file or a pasted block of spreadsheet cells into a grid.
 *
 * Hand-rolled rather than pulled from npm for the same reason `export/zip.ts`
 * is: the whole job is one state machine over one string, and RFC 4180 is
 * four rules long.
 */

/** How many leading rows the delimiter vote looks at. Enough to be decisive,
 *  few enough that a large paste costs nothing to sniff. */
const SNIFF_ROWS = 5;

/**
 * Comma or tab, decided by counting rather than asking.
 *
 * Anything copied out of Excel or Google Sheets arrives tab-separated, so a
 * paste resolves correctly without a control on screen. Quoted spans are
 * skipped, because a body full of commas would otherwise outvote the tabs
 * actually separating the columns.
 */
export function detectDelimiter(text: string): ',' | '\t' {
	let tabs = 0;
	let commas = 0;
	let rows = 0;
	let quoted = false;
	for (let i = 0; i < text.length && rows < SNIFF_ROWS; i++) {
		const c = text[i];
		if (c === '"') {
			if (quoted && text[i + 1] === '"') {
				i++;
				continue;
			}
			quoted = !quoted;
			continue;
		}
		if (quoted) continue;
		if (c === '\t') tabs++;
		else if (c === ',') commas++;
		else if (c === '\n') rows++;
	}
	return tabs > commas ? '\t' : ',';
}

/**
 * RFC 4180 quoting, because scripture is full of commas: `"…"` wraps a
 * field, `""` is a literal quote inside one, and a quoted field may span
 * newlines.
 *
 * Every cell goes through `cleanText`, which is also what flattens a quoted
 * multi-line body into the single line a verse is stored as. Rows that end
 * up entirely empty are dropped — a trailing newline, a spacer row between
 * sections, a run of empty cells left behind by a deletion.
 */
export function parseDelimited(text: string): string[][] {
	const delimiter = detectDelimiter(text);
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;

	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
					continue;
				}
				quoted = false;
				continue;
			}
			field += c;
			continue;
		}
		if (c === '"') {
			quoted = true;
			continue;
		}
		if (c === delimiter) {
			row.push(field);
			field = '';
			continue;
		}
		if (c === '\n' || c === '\r') {
			row.push(field);
			field = '';
			rows.push(row);
			row = [];
			// CRLF is one break, not two.
			if (c === '\r' && text[i + 1] === '\n') i++;
			continue;
		}
		field += c;
	}
	row.push(field);
	rows.push(row);

	return rows
		.map((r) => r.map((cell) => cleanText(cell)))
		.filter((r) => r.some((cell) => cell.length > 0));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/tableParse.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/oyo/tableParse.ts tests/unit/tableParse.test.ts
git commit -m "feat(import): a grid from a CSV or a pasted block of cells"
```

---

### Task 5: `tableColumns.ts` — types and `applyMapping`

The mapping half first, because it is small and every later task's types come from this file.

**Files:**
- Create: `src/lib/oyo/tableColumns.ts`
- Create: `tests/unit/tableColumns.test.ts`

**Interfaces:**
- Consumes: `normalizeCite`, `MAX_IMPORT_VERSES` from `$lib/oyo/cite` (Task 2).
- Produces, from `$lib/oyo/tableColumns`:
  - `interface ColumnMapping { cite: number; title: number | null; w: number | null }`
  - `interface TableDraft { row: number; cite: string; title: string; w: string }`
  - `applyMapping(grid: string[][], hasHeader: boolean, mapping: ColumnMapping): { drafts: TableDraft[]; truncated: boolean }`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tableColumns.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyMapping, type ColumnMapping } from '../../src/lib/oyo/tableColumns';
import { MAX_IMPORT_VERSES } from '../../src/lib/oyo/cite';

const CITE_TITLE_BODY: ColumnMapping = { cite: 0, title: 1, w: 2 };

describe('applyMapping', () => {
	it('reads each data row through the mapping', () => {
		const grid = [
			['장절', '제목', '본문'],
			['요 3:16', '영생', '하나님이 세상을 이처럼 사랑하사']
		];
		const { drafts } = applyMapping(grid, true, CITE_TITLE_BODY);
		expect(drafts).toEqual([
			{ row: 2, cite: '요한복음 3 : 16', title: '영생', w: '하나님이 세상을 이처럼 사랑하사' }
		]);
	});

	it('numbers rows against the source table, header included', () => {
		const grid = [['장절'], ['요 3:16'], ['창 12:1']];
		const { drafts } = applyMapping(grid, true, { cite: 0, title: null, w: null });
		expect(drafts.map((d) => d.row)).toEqual([2, 3]);
	});

	it('numbers from one when there is no header', () => {
		const grid = [['요 3:16'], ['창 12:1']];
		const { drafts } = applyMapping(grid, false, { cite: 0, title: null, w: null });
		expect(drafts.map((d) => d.row)).toEqual([1, 2]);
	});

	it('keeps a row that has no body — the fill exists for exactly that row', () => {
		const grid = [['요 3:16', '영생', '']];
		const { drafts } = applyMapping(grid, false, CITE_TITLE_BODY);
		expect(drafts[0].w).toBe('');
		expect(drafts[0].cite).toBe('요한복음 3 : 16');
	});

	it('drops a row with no citation — it could never be found again', () => {
		const grid = [['요 3:16', '영생', '본문'], ['', '제목만', '본문만']];
		const { drafts } = applyMapping(grid, false, CITE_TITLE_BODY);
		expect(drafts).toHaveLength(1);
	});

	it('reads an unmapped column as empty rather than undefined', () => {
		const grid = [['요 3:16']];
		const { drafts } = applyMapping(grid, false, { cite: 0, title: null, w: null });
		expect(drafts[0].title).toBe('');
		expect(drafts[0].w).toBe('');
	});

	it('survives a ragged row that is shorter than the mapping', () => {
		const grid = [['요 3:16']];
		const { drafts } = applyMapping(grid, false, CITE_TITLE_BODY);
		expect(drafts[0]).toEqual({ row: 1, cite: '요한복음 3 : 16', title: '', w: '' });
	});

	it('cuts the list at the import bound and says that it did', () => {
		const grid = Array.from({ length: MAX_IMPORT_VERSES + 5 }, () => ['요 3:16']);
		const { drafts, truncated } = applyMapping(grid, false, { cite: 0, title: null, w: null });
		expect(drafts).toHaveLength(MAX_IMPORT_VERSES);
		expect(truncated).toBe(true);
	});

	it('reports no truncation when the table fits', () => {
		const grid = [['요 3:16']];
		expect(applyMapping(grid, false, { cite: 0, title: null, w: null }).truncated).toBe(false);
	});

	it('does not count dropped rows as truncation', () => {
		const grid = [['요 3:16'], [''], ['창 12:1']];
		const { drafts, truncated } = applyMapping(grid, false, { cite: 0, title: null, w: null });
		expect(drafts).toHaveLength(2);
		expect(truncated).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tableColumns.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/oyo/tableColumns"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/oyo/tableColumns.ts`:

```ts
import { MAX_IMPORT_VERSES, normalizeCite } from './cite';

/**
 * Which column holds what, and what the rows become once that is settled.
 *
 * Every rule in this file is a guess. That is deliberate: the confirm screen
 * shows the guess to a person before anything is fetched or saved, which is
 * what lets the heuristics be opinionated instead of timid.
 */

export interface ColumnMapping {
	cite: number;
	/** null when the table has no such column — the reader may also say so. */
	title: number | null;
	/** null when the table has no such column; the fill supplies the body. */
	w: number | null;
}

export interface TableDraft {
	/** 1-based row number in the source table, header included. */
	row: number;
	cite: string;
	title: string;
	w: string;
}

/**
 * Reads the grid through a mapping.
 *
 * A row with no citation is dropped, for the reason the deeplink parser drops
 * one: a verse with no reference cannot be found again. A row missing only its
 * body is kept — that is precisely the row the body fill exists for.
 *
 * `truncated` is returned rather than left to be inferred. Rows go missing for
 * two different reasons here, and comparing input and output lengths would
 * report a truncation that never happened.
 */
export function applyMapping(
	grid: string[][],
	hasHeader: boolean,
	mapping: ColumnMapping
): { drafts: TableDraft[]; truncated: boolean } {
	const body = hasHeader ? grid.slice(1) : grid;
	const offset = hasHeader ? 2 : 1;
	const drafts: TableDraft[] = [];
	let truncated = false;

	for (let i = 0; i < body.length; i++) {
		const cells = body[i];
		const cite = normalizeCite(cells[mapping.cite] ?? '');
		if (cite.length === 0) continue;
		if (drafts.length >= MAX_IMPORT_VERSES) {
			truncated = true;
			break;
		}
		drafts.push({
			row: i + offset,
			cite,
			title: mapping.title === null ? '' : (cells[mapping.title] ?? ''),
			w: mapping.w === null ? '' : (cells[mapping.w] ?? '')
		});
	}

	return { drafts, truncated };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/tableColumns.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/oyo/tableColumns.ts tests/unit/tableColumns.test.ts
git commit -m "feat(import): a mapping turns a grid into draft verses"
```

---

### Task 6: `detectColumns` — guessing the mapping

Four rules for the columns, two for the header. A sheet's author is free to invent header names, so cell *content* is treated as stronger evidence than the words in the top row.

**Files:**
- Modify: `src/lib/oyo/tableColumns.ts` (append)
- Modify: `tests/unit/tableColumns.test.ts` (append)

**Interfaces:**
- Consumes: `ColumnMapping` (Task 5), `parsePassageRef` from `$lib/bible/index`.
- Produces, from `$lib/oyo/tableColumns`:
  - `interface DetectedColumns { hasHeader: boolean; labels: string[]; mapping: ColumnMapping }`
  - `detectColumns(grid: string[][]): DetectedColumns` — `mapping` is never null.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/tableColumns.test.ts` (and add `detectColumns` to the import from `tableColumns` at the top of the file):

```ts
describe('detectColumns — header rule 1, synonyms', () => {
	it('reads a header whose names are in the table', () => {
		const grid = [
			['장절', '제목', '본문'],
			['요 3:16', '영생', '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니']
		];
		const out = detectColumns(grid);
		expect(out.hasHeader).toBe(true);
		expect(out.mapping).toEqual({ cite: 0, title: 1, w: 2 });
	});

	it('accepts English and spaced spellings', () => {
		const grid = [
			['Reference', 'Title', 'Text'],
			['요 3:16', '영생', '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니']
		];
		expect(detectColumns(grid).mapping).toEqual({ cite: 0, title: 1, w: 2 });
	});

	it('takes columns in any order', () => {
		const grid = [
			['본문', '장절', '제목'],
			['하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니', '요 3:16', '영생']
		];
		expect(detectColumns(grid).mapping).toEqual({ cite: 1, title: 2, w: 0 });
	});
});

describe('detectColumns — header rule 2, a label row', () => {
	it('spots an invented header by its shape, not its words', () => {
		const grid = [
			['순번', '암송구절', '확인'],
			['1', '요 3:16', 'O'],
			['2', '창 12:1', 'O'],
			['3', '시 23:1', '']
		];
		const out = detectColumns(grid);
		expect(out.hasHeader).toBe(true);
		expect(out.mapping.cite).toBe(1);
	});

	it('leaves a headerless table alone', () => {
		const grid = [['요 3:16'], ['창 12:1'], ['시 23:1']];
		expect(detectColumns(grid).hasHeader).toBe(false);
	});

	it('does not call a single-row table a header', () => {
		const grid = [['요 3:16']];
		expect(detectColumns(grid).hasHeader).toBe(false);
	});
});

describe('detectColumns — choosing columns', () => {
	it('finds the citation column by content when no header names it', () => {
		const grid = [
			['1', '요 3:16', 'O'],
			['2', '창 12:1', 'O'],
			['3', '시 23:1', 'X']
		];
		expect(detectColumns(grid).mapping.cite).toBe(1);
	});

	it('gives the body to the longest remaining column', () => {
		const grid = [
			['요 3:16', '영생', '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니'],
			['창 12:1', '부르심', '여호와께서 아브람에게 이르시되 너는 너의 본토 친척 아비 집을 떠나']
		];
		expect(detectColumns(grid).mapping).toEqual({ cite: 0, title: 1, w: 2 });
	});

	it('two columns, a long second one: that is the body', () => {
		const grid = [
			['요 3:16', '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니'],
			['창 12:1', '여호와께서 아브람에게 이르시되 너는 너의 본토 친척 아비 집을 떠나']
		];
		expect(detectColumns(grid).mapping).toEqual({ cite: 0, title: null, w: 1 });
	});

	it('two columns, a short second one: that is the title, and the body is fetched', () => {
		const grid = [
			['요 3:16', '영생'],
			['창 12:1', '부르심']
		];
		expect(detectColumns(grid).mapping).toEqual({ cite: 0, title: 1, w: null });
	});

	it('one column of references maps to citations alone', () => {
		const grid = [['요 3:16'], ['창 12:1']];
		expect(detectColumns(grid).mapping).toEqual({ cite: 0, title: null, w: null });
	});

	it('falls back to the leftmost column when nothing else fires', () => {
		const grid = [['아무거나', '또 아무거나'], ['이것도', '저것도']];
		expect(detectColumns(grid).mapping.cite).toBe(0);
	});

	it('never leaves the citation column unset', () => {
		const grid = [['', ''], ['', '']];
		expect(typeof detectColumns(grid).mapping.cite).toBe('number');
	});

	it('does not hand a wholly empty column to the title', () => {
		const grid = [
			['요 3:16', ''],
			['창 12:1', '']
		];
		expect(detectColumns(grid).mapping.title).toBeNull();
	});
});

describe('detectColumns — labels', () => {
	it('labels columns with the header cells when there is a header', () => {
		const grid = [
			['장절', '제목'],
			['요 3:16', '영생']
		];
		expect(detectColumns(grid).labels).toEqual(['장절', '제목']);
	});

	it('labels columns with the first row when there is no header', () => {
		const grid = [['요 3:16', '영생'], ['창 12:1', '부르심']];
		expect(detectColumns(grid).labels).toEqual(['요 3:16', '영생']);
	});

	it('pads labels out to the widest row', () => {
		const grid = [['요 3:16'], ['창 12:1', '부르심', '길게 쓴 본문입니다 여기에']];
		expect(detectColumns(grid).labels).toHaveLength(3);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tableColumns.test.ts`
Expected: FAIL — `detectColumns is not a function` (or an import error for the name).

- [ ] **Step 3: Write the implementation**

Append to `src/lib/oyo/tableColumns.ts` (and add `import { parsePassageRef } from '$lib/bible/index';` to the top of the file):

```ts
export interface DetectedColumns {
	hasHeader: boolean;
	/** Header cells when hasHeader, else the first row's values — either way,
	 *  what the mapper shows next to each column letter. */
	labels: string[];
	/** Always present. The last rule below guarantees a citation column even
	 *  when every stronger signal is silent. */
	mapping: ColumnMapping;
}

type Role = 'cite' | 'title' | 'w';

/** Rule 1's vocabulary. Matched after stripping whitespace and lowercasing,
 *  so "Reference" and "성경 구절" both land. */
const SYNONYMS: Record<Role, string[]> = {
	cite: ['장절', '구절', '성구', '참조', '성경구절', '본문장절', 'reference', 'ref', 'cite', 'verse'],
	title: ['제목', '이름', '타이틀', 'title', 'name'],
	w: ['본문', '내용', '말씀', '구절내용', '텍스트', 'text', 'body', 'w']
};

/** How many data rows the content and length probes look at. */
const PROBE_ROWS = 10;

/** Share of a column's sampled cells that must parse as a reference before
 *  that column is called the citation column. */
const CITE_SHARE = 0.5;

/** Mean cell length that separates a body from a title. Korean verses run
 *  well past this; titles are two or three words. */
const BODY_MEAN_LENGTH = 20;

function headerKey(cell: string): string {
	return cell.replace(/\s+/g, '').toLowerCase();
}

function headerRole(cell: string): Role | null {
	const key = headerKey(cell);
	if (key.length === 0) return null;
	for (const role of ['cite', 'title', 'w'] as const) {
		if (SYNONYMS[role].some((s) => headerKey(s) === key)) return role;
	}
	return null;
}

function meanLength(rows: string[][], column: number): number {
	if (rows.length === 0) return 0;
	let total = 0;
	for (const r of rows) total += (r[column] ?? '').length;
	return total / rows.length;
}

/** The column whose cells most often read as a passage reference. */
function probeCite(rows: string[][], width: number, taken: Set<number>): number | undefined {
	const sample = rows.slice(0, PROBE_ROWS);
	let best: number | undefined;
	let bestShare = 0;
	for (let i = 0; i < width; i++) {
		if (taken.has(i)) continue;
		const cells = sample.map((r) => r[i] ?? '').filter((c) => c.length > 0);
		if (cells.length === 0) continue;
		const share = cells.filter((c) => parsePassageRef(c) !== null).length / cells.length;
		if (share >= CITE_SHARE && share > bestShare) {
			best = i;
			bestShare = share;
		}
	}
	return best;
}

/** The longest remaining column, if it is long enough to be scripture. */
function probeBody(rows: string[][], width: number, taken: Set<number>): number | undefined {
	const sample = rows.slice(0, PROBE_ROWS);
	let best: number | undefined;
	let bestMean = 0;
	for (let i = 0; i < width; i++) {
		if (taken.has(i)) continue;
		const mean = meanLength(sample, i);
		if (mean >= BODY_MEAN_LENGTH && mean > bestMean) {
			best = i;
			bestMean = mean;
		}
	}
	return best;
}

/** The first remaining column short enough to be a title — and not empty,
 *  because an empty column would give every verse a blank title it never
 *  asked for. */
function probeTitle(rows: string[][], width: number, taken: Set<number>): number | undefined {
	const sample = rows.slice(0, PROBE_ROWS);
	for (let i = 0; i < width; i++) {
		if (taken.has(i)) continue;
		const mean = meanLength(sample, i);
		if (mean > 0 && mean < BODY_MEAN_LENGTH) return i;
	}
	return undefined;
}

/**
 * Guesses which column holds what, and whether the first row is a header.
 *
 * Header detection has two rules, either sufficient. Rule 1 is vocabulary:
 * a synonym in the top row. Rule 2 is shape, and it runs after the citation
 * column is known: if the first row's cell there fails to parse while the
 * rows beneath it succeed, the first row is a label row.
 *
 * Rule 2 is the one that earns its keep. `normalizeCite` deliberately keeps
 * text it cannot parse — that is what carries 토비트 3 : 1 through — so a
 * header cell survives as a citation rather than being dropped. Without rule
 * 2, a sheet headed 순번 / 암송구절 / 확인 would import its own header as a
 * verse.
 *
 * The columns are then settled in a fixed order, each role taking the first
 * rule that fires and never a column already claimed:
 *
 *   1. a header synonym
 *   2. cite only — the column whose cells read as references
 *   3. w and title — the longest remaining column, then a short one
 *   4. cite only — the leftmost unclaimed column, else column 0
 */
export function detectColumns(grid: string[][]): DetectedColumns {
	const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
	const first = grid[0] ?? [];
	const labels = Array.from({ length: width }, (_, i) => first[i] ?? '');

	const synonymHeader = first.some((c) => headerRole(c) !== null);

	const byHeader: Partial<Record<Role, number>> = {};
	if (synonymHeader) {
		for (let i = 0; i < width; i++) {
			const role = headerRole(first[i] ?? '');
			if (role && byHeader[role] === undefined) byHeader[role] = i;
		}
	}
	const taken = new Set<number>(Object.values(byHeader));

	// The citation column is settled first, because header rule 2 needs to
	// know which cell of the first row to look at.
	const certainlyData = synonymHeader ? grid.slice(1) : grid;
	let cite = byHeader.cite ?? probeCite(certainlyData, width, taken);
	if (cite === undefined) {
		cite = 0;
		for (let i = 0; i < width; i++) {
			if (!taken.has(i)) {
				cite = i;
				break;
			}
		}
	}
	taken.add(cite);

	const labelRow =
		!synonymHeader &&
		grid.length > 1 &&
		parsePassageRef(first[cite] ?? '') === null &&
		grid.slice(1, PROBE_ROWS + 1).some((r) => parsePassageRef(r[cite] ?? '') !== null);

	const hasHeader = synonymHeader || labelRow;
	const body = hasHeader ? grid.slice(1) : grid;

	const w = byHeader.w ?? probeBody(body, width, taken);
	if (w !== undefined) taken.add(w);

	const title = byHeader.title ?? probeTitle(body, width, taken);
	if (title !== undefined) taken.add(title);

	return {
		hasHeader,
		labels,
		mapping: { cite, title: title ?? null, w: w ?? null }
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/tableColumns.test.ts`
Expected: PASS, 26 tests (10 from Task 5 plus 16 here).

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/oyo/tableColumns.ts tests/unit/tableColumns.test.ts
git commit -m "feat(import): read the cells, not just the header"
```

---

### Task 7: `autofill.ts` — bodies for rows that have none

**Files:**
- Create: `src/lib/oyo/autofill.ts`
- Create: `tests/unit/autofill.test.ts`

**Interfaces:**
- Consumes: `TableDraft` (Task 5), `parsePassageRef` from `$lib/bible/index`, `fetchPassageText` from `$lib/bible/fetch`.
- Produces, from `$lib/oyo/autofill`:
  - `type RowStatus = 'ready' | 'loading' | 'no-body'`
  - `interface FillProgress { index: number; status: RowStatus; w?: string }`
  - `interface FillOptions { concurrency?: number; timeoutMs?: number; maxConsecutiveFailures?: number; signal?: AbortSignal }`
  - `interface FillSummary { filled: number; failed: number; abortedEarly: boolean }`
  - `fillMissingBodies(drafts, onProgress, opts?): Promise<FillSummary>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/autofill.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fillMissingBodies, type FillProgress } from '../../src/lib/oyo/autofill';
import { __clearChapterCacheForTest } from '../../src/lib/bible/fetch';
import type { TableDraft } from '../../src/lib/oyo/tableColumns';

function draft(cite: string, w = ''): TableDraft {
	return { row: 1, cite, title: '', w };
}

/** Stands in for bolls.life. Every chapter answers with one verse per number
 *  so a range always resolves to something. */
function stubFetch(onCall?: (url: string) => void) {
	const spy = vi.fn(async (url: string) => {
		onCall?.(url);
		const verses = Array.from({ length: 40 }, (_, i) => ({
			verse: i + 1,
			text: `절 ${i + 1}`
		}));
		return { ok: true, json: async () => verses } as unknown as Response;
	});
	vi.stubGlobal('fetch', spy);
	return spy;
}

beforeEach(() => {
	__clearChapterCacheForTest();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('fillMissingBodies', () => {
	it('leaves a row that already has a body untouched', async () => {
		const spy = stubFetch();
		const seen: FillProgress[] = [];
		const out = await fillMissingBodies([draft('요 3:16', '이미 있는 본문')], (p) => seen.push(p));
		expect(spy).not.toHaveBeenCalled();
		expect(seen).toEqual([]);
		expect(out).toEqual({ filled: 0, failed: 0, abortedEarly: false });
	});

	it('fetches one chapter however many rows point into it', async () => {
		const urls: string[] = [];
		stubFetch((u) => urls.push(u));
		const drafts = [draft('시 119:1'), draft('시 119:2'), draft('시 119:3')];
		const out = await fillMissingBodies(drafts, () => {});
		expect(urls).toHaveLength(1);
		expect(out.filled).toBe(3);
	});

	it('reports each row loading and then ready, with its text', async () => {
		stubFetch();
		const seen: FillProgress[] = [];
		await fillMissingBodies([draft('요 3:16')], (p) => seen.push(p));
		expect(seen[0]).toEqual({ index: 0, status: 'loading' });
		expect(seen[1].status).toBe('ready');
		expect(seen[1].w).toBe('절 16');
	});

	it('resolves an unparseable citation without a request', async () => {
		const spy = stubFetch();
		const seen: FillProgress[] = [];
		const out = await fillMissingBodies([draft('토비트 3 : 1')], (p) => seen.push(p));
		expect(spy).not.toHaveBeenCalled();
		expect(seen).toEqual([{ index: 0, status: 'no-body' }]);
		expect(out.failed).toBe(1);
	});

	it('marks a row no-body when its verse range is outside the chapter', async () => {
		stubFetch();
		const seen: FillProgress[] = [];
		await fillMissingBodies([draft('요 3:900')], (p) => seen.push(p));
		expect(seen.at(-1)).toEqual({ index: 0, status: 'no-body' });
	});

	it('marks a whole chapter group no-body when the chapter cannot be fetched', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response));
		const seen: FillProgress[] = [];
		const out = await fillMissingBodies([draft('요 3:16'), draft('요 3:17')], (p) => seen.push(p));
		expect(seen.filter((p) => p.status === 'no-body').map((p) => p.index)).toEqual([0, 1]);
		expect(out.failed).toBe(2);
	});

	it('gives up on a chapter that never answers', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise<Response>(() => {}))
		);
		const seen: FillProgress[] = [];
		const out = await fillMissingBodies([draft('요 3:16')], (p) => seen.push(p), {
			timeoutMs: 10
		});
		expect(seen.at(-1)).toEqual({ index: 0, status: 'no-body' });
		expect(out.failed).toBe(1);
	});

	it('stops after three chapters fail in a row and says so', async () => {
		const spy = vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response);
		vi.stubGlobal('fetch', spy);
		const drafts = [
			draft('요 1:1'),
			draft('요 2:1'),
			draft('요 3:1'),
			draft('요 4:1'),
			draft('요 5:1'),
			draft('요 6:1')
		];
		const out = await fillMissingBodies(drafts, () => {}, { concurrency: 1 });
		expect(out.abortedEarly).toBe(true);
		expect(spy.mock.calls.length).toBeLessThan(drafts.length);
		expect(out.failed).toBe(drafts.length);
	});

	it('resolves every row exactly once even when it gives up early', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response));
		const drafts = [draft('요 1:1'), draft('요 2:1'), draft('요 3:1'), draft('요 4:1')];
		const seen: FillProgress[] = [];
		await fillMissingBodies(drafts, (p) => seen.push(p), { concurrency: 1 });
		const terminal = seen.filter((p) => p.status !== 'loading').map((p) => p.index);
		expect([...terminal].sort()).toEqual([0, 1, 2, 3]);
	});

	it('stops between chapters when the signal aborts', async () => {
		const controller = new AbortController();
		const spy = vi.fn(async () => {
			controller.abort();
			const verses = [{ verse: 1, text: '절 1' }];
			return { ok: true, json: async () => verses } as unknown as Response;
		});
		vi.stubGlobal('fetch', spy);
		const drafts = [draft('요 1:1'), draft('요 2:1'), draft('요 3:1')];
		await fillMissingBodies(drafts, () => {}, { concurrency: 1, signal: controller.signal });
		expect(spy).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/autofill.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/oyo/autofill"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/oyo/autofill.ts`:

```ts
import { parsePassageRef } from '$lib/bible/index';
import { fetchPassageText } from '$lib/bible/fetch';
import type { TableDraft } from './tableColumns';

/**
 * Fills in the bodies a table did not carry.
 *
 * The shape of this module is dictated by one detail of the chapter cache in
 * `bible/fetch.ts`: it is populated *after* the await. Two rows of the same
 * chapter fired in parallel would therefore both miss it and fetch twice. So
 * rows are grouped by chapter, a group runs sequentially inside itself, and
 * parallelism is harvested only across distinct chapters. That is what makes
 * "시편 119:1–50" one request instead of fifty.
 */

export type RowStatus = 'ready' | 'loading' | 'no-body';

export interface FillProgress {
	index: number;
	status: RowStatus;
	/** Present only on 'ready'. */
	w?: string;
}

export interface FillOptions {
	/** Distinct chapters in flight at once. */
	concurrency?: number;
	/** How long to wait on one chapter before giving up on it. */
	timeoutMs?: number;
	/** How many chapters may fail back-to-back before the rest are abandoned. */
	maxConsecutiveFailures?: number;
	signal?: AbortSignal;
}

export interface FillSummary {
	filled: number;
	failed: number;
	/** True when the consecutive-failure breaker tripped. */
	abortedEarly: boolean;
}

/**
 * Stops waiting, rather than stopping the request.
 *
 * `fetchPassageText` takes no `AbortSignal`, and plumbing one through would
 * mean editing the bible module for a caller it does not otherwise know
 * about. Racing a timer leaves the request running, and if it lands late it
 * still populates the chapter cache — which makes 다시 시도 fast rather than
 * wasted.
 */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('timeout')), ms);
		work.then(
			(v) => {
				clearTimeout(timer);
				resolve(v);
			},
			(e) => {
				clearTimeout(timer);
				reject(e);
			}
		);
	});
}

export async function fillMissingBodies(
	drafts: readonly TableDraft[],
	onProgress: (p: FillProgress) => void,
	opts: FillOptions = {}
): Promise<FillSummary> {
	const {
		concurrency = 3,
		timeoutMs = 10_000,
		maxConsecutiveFailures = 3,
		signal
	} = opts;

	let filled = 0;
	let failed = 0;
	let consecutive = 0;
	const resolved = new Set<number>();

	function emit(index: number, status: RowStatus, w?: string): void {
		if (status !== 'loading') resolved.add(index);
		onProgress(w === undefined ? { index, status } : { index, status, w });
	}

	// Group the rows that need a body, and settle the hopeless ones on the way.
	const groups = new Map<string, number[]>();
	for (let i = 0; i < drafts.length; i++) {
		if (drafts[i].w.length > 0) continue;
		const parsed = parsePassageRef(drafts[i].cite);
		if (!parsed) {
			// A citation this app cannot parse has no chapter to fetch. Settled
			// here rather than sent to the network to fail.
			emit(i, 'no-body');
			failed++;
			continue;
		}
		const key = `${parsed.bookId}:${parsed.chapter}`;
		const list = groups.get(key);
		if (list) list.push(i);
		else groups.set(key, [i]);
	}

	const keys = [...groups.keys()];

	async function textFor(index: number): Promise<string> {
		// Non-null: only rows whose citation parsed were grouped.
		const parsed = parsePassageRef(drafts[index].cite)!;
		return withTimeout(fetchPassageText(parsed), timeoutMs);
	}

	function settle(index: number, text: string): void {
		if (text.trim().length === 0) {
			emit(index, 'no-body');
			failed++;
			return;
		}
		emit(index, 'ready', text);
		filled++;
	}

	async function runGroup(key: string): Promise<void> {
		const indexes = groups.get(key)!;
		for (const i of indexes) emit(i, 'loading');

		const [head, ...rest] = indexes;
		let headText: string;
		try {
			headText = await textFor(head);
		} catch {
			// The chapter itself is unreachable, so every row in the group is
			// lost — and the breaker needs to hear about it.
			for (const i of indexes) {
				emit(i, 'no-body');
				failed++;
			}
			consecutive++;
			return;
		}
		consecutive = 0;
		settle(head, headText);

		// The chapter is cached now, so anything that fails below is this row's
		// own verse range rather than the network.
		for (const i of rest) {
			try {
				settle(i, await textFor(i));
			} catch {
				emit(i, 'no-body');
				failed++;
			}
		}
	}

	let next = 0;
	async function worker(): Promise<void> {
		while (true) {
			if (signal?.aborted) return;
			if (consecutive >= maxConsecutiveFailures) return;
			const k = next++;
			if (k >= keys.length) return;
			await runGroup(keys[k]);
		}
	}

	await Promise.all(
		Array.from({ length: Math.max(1, Math.min(concurrency, keys.length)) }, worker)
	);

	const abortedEarly = consecutive >= maxConsecutiveFailures;
	// Every row gets exactly one terminal status, including the ones the
	// breaker never reached — a row left on 'loading' would spin forever.
	if (abortedEarly) {
		for (const indexes of groups.values()) {
			for (const i of indexes) {
				if (resolved.has(i)) continue;
				emit(i, 'no-body');
				failed++;
			}
		}
	}

	return { filled, failed, abortedEarly };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/autofill.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/oyo/autofill.ts tests/unit/autofill.test.ts
git commit -m "feat(import): group by chapter, because that is what the cache counts"
```

---

### Task 8: `VerseReviewList.svelte` — one row list, two doors

The deeplink screen's row markup carries a correctness note worth keeping in one place: an `<input>` inside a `<button>` is invalid HTML and steals the tap that should place a caret, which is why the check and the scripture block are two separate targets.

**Files:**
- Create: `src/lib/components/oyo/VerseReviewList.svelte`
- Create: `tests/unit/VerseReviewList.test.ts`
- Modify: `src/routes/oyo/import/+page.svelte`

**Interfaces:**
- Consumes: `RowStatus` from `$lib/oyo/autofill` (Task 7).
- Produces: `VerseReviewList` with props
  ```ts
  interface Props {
      rows: { cite: string; w: string }[];
      titles: string[];      // $bindable
      chosen: Set<number>;   // $bindable
      duplicates: Set<number>;
      statuses?: RowStatus[];
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/unit/VerseReviewList.test.ts`:

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import VerseReviewList from '../../src/lib/components/oyo/VerseReviewList.svelte';

const ROWS = [
	{ cite: '요한복음 3 : 16', w: '하나님이 세상을 이처럼 사랑하사' },
	{ cite: '창세기 12 : 1', w: '여호와께서 아브람에게 이르시되' }
];

function base(overrides: Record<string, unknown> = {}) {
	return {
		rows: ROWS,
		titles: ['', ''],
		chosen: new Set([0, 1]),
		duplicates: new Set<number>(),
		...overrides
	};
}

describe('VerseReviewList', () => {
	it('renders a row per verse, with its citation and body', () => {
		render(VerseReviewList, { props: base() });
		expect(screen.getByText('요한복음 3 : 16')).toBeInTheDocument();
		expect(screen.getByText('하나님이 세상을 이처럼 사랑하사')).toBeInTheDocument();
		expect(screen.getByText('창세기 12 : 1')).toBeInTheDocument();
	});

	it('shows a checked state for every chosen row', () => {
		render(VerseReviewList, { props: base() });
		expect(screen.getByRole('button', { name: '요한복음 3 : 16 선택' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
	});

	it('toggles a row off when its check is tapped', async () => {
		render(VerseReviewList, { props: base() });
		const check = screen.getByRole('button', { name: '요한복음 3 : 16 선택' });
		await fireEvent.click(check);
		expect(check).toHaveAttribute('aria-pressed', 'false');
	});

	it('gives each row a title field', () => {
		render(VerseReviewList, { props: base() });
		expect(screen.getByLabelText('요한복음 3 : 16 제목')).toBeInTheDocument();
	});

	it('labels a row the reader already has', () => {
		render(VerseReviewList, { props: base({ duplicates: new Set([1]) }) });
		expect(screen.getByText('이미 있음')).toBeInTheDocument();
	});

	it('says a row is loading instead of showing an empty body', () => {
		render(
			VerseReviewList,
			{
				props: base({
					rows: [{ cite: '요한복음 3 : 16', w: '' }],
					titles: [''],
					chosen: new Set<number>(),
					statuses: ['loading']
				})
			}
		);
		expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
	});

	it('disables the check on a row that has no body', () => {
		render(VerseReviewList, {
			props: base({
				rows: [{ cite: '토비트 3 : 1', w: '' }],
				titles: [''],
				chosen: new Set<number>(),
				statuses: ['no-body']
			})
		});
		expect(screen.getByText('본문 없음 · 건너뜁니다')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '토비트 3 : 1 선택' })).toBeDisabled();
	});

	it('ignores a tap on a row that has no body', async () => {
		render(VerseReviewList, {
			props: base({
				rows: [{ cite: '토비트 3 : 1', w: '' }],
				titles: [''],
				chosen: new Set<number>(),
				statuses: ['no-body']
			})
		});
		const check = screen.getByRole('button', { name: '토비트 3 : 1 선택' });
		await fireEvent.click(check);
		expect(check).toHaveAttribute('aria-pressed', 'false');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/VerseReviewList.test.ts`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Write the component**

Create `src/lib/components/oyo/VerseReviewList.svelte`:

```svelte
<script lang="ts">
	import { Check } from 'lucide-svelte';
	import type { RowStatus } from '$lib/oyo/autofill';

	interface Props {
		rows: { cite: string; w: string }[];
		/** Per-row title, edited in place. Optional: left blank, the verse is
		 *  saved unnamed and its card shows the citation where the title goes.
		 *  Storing the citation instead would turn "no title" into "titled with
		 *  its own reference", which is a different fact and one that outlives
		 *  the import. */
		titles: string[];
		chosen: Set<number>;
		duplicates: Set<number>;
		/** Absent on the deeplink screen, where every row always has a body. */
		statuses?: RowStatus[];
	}

	let {
		rows,
		titles = $bindable([]),
		chosen = $bindable(new Set<number>()),
		duplicates,
		statuses
	}: Props = $props();

	function statusOf(i: number): RowStatus {
		return statuses?.[i] ?? 'ready';
	}

	function toggle(i: number) {
		// A row with no body has nothing to memorize, so it cannot be chosen —
		// the same rule the deeplink parser applies when it drops a bodiless
		// verse rather than importing it half-formed.
		if (statusOf(i) === 'no-body') return;
		const next = new Set(chosen);
		if (!next.delete(i)) next.add(i);
		chosen = next;
	}
</script>

<ul class="mt-4 space-y-2">
	{#each rows as v, i (i)}
		{@const status = statusOf(i)}
		<li
			class="flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors {status ===
			'no-body'
				? 'border-[var(--color-border)] bg-[var(--color-card)] opacity-50'
				: chosen.has(i)
					? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
					: 'border-[var(--color-border)] bg-[var(--color-card)]'}"
		>
			<!-- The row was one big button until it grew a title field. An
			     input inside a button is invalid and unusable — the tap that
			     should place a caret toggles the row instead — so the check
			     and the scripture block are two targets now, and the field
			     between them belongs to neither. -->
			<button
				type="button"
				onclick={() => toggle(i)}
				disabled={status === 'no-body'}
				aria-pressed={chosen.has(i)}
				aria-label="{v.cite} 선택"
				class="mt-1.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border disabled:cursor-not-allowed {chosen.has(
					i
				)
					? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]'
					: 'border-[var(--color-border)]'}"
			>
				{#if chosen.has(i)}<Check size={12} strokeWidth={3} />{/if}
			</button>
			<div class="min-w-0 flex-1">
				<input
					type="text"
					bind:value={titles[i]}
					placeholder="제목 (없으면 장절)"
					aria-label="{v.cite} 제목"
					maxlength="60"
					class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1.5 text-[14px] font-semibold text-[var(--color-text)] placeholder:font-normal placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] focus:outline-none"
				/>
				<button
					type="button"
					onclick={() => toggle(i)}
					tabindex="-1"
					class="mt-0.5 block w-full px-1.5 text-left"
				>
					<span class="flex flex-wrap items-center gap-1.5">
						<span class="text-[12px] text-[var(--color-text-secondary)]">{v.cite}</span>
						{#if duplicates.has(i)}
							<span
								class="rounded-full bg-[var(--color-elevated)] px-2 py-0.5 text-[11px] text-[var(--color-text-tertiary)]"
							>
								이미 있음
							</span>
						{/if}
						{#if status === 'no-body'}
							<span
								class="rounded-full bg-[var(--color-elevated)] px-2 py-0.5 text-[11px] text-[var(--color-text-tertiary)]"
							>
								본문 없음 · 건너뜁니다
							</span>
						{/if}
					</span>
					<span class="mt-1 block text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
						{#if status === 'loading'}불러오는 중…{:else}{v.w}{/if}
					</span>
				</button>
			</div>
		</li>
	{/each}
</ul>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/VerseReviewList.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Point the deeplink screen at the component**

In `src/routes/oyo/import/+page.svelte`:

1. Add to the imports:

```ts
import VerseReviewList from '$lib/components/oyo/VerseReviewList.svelte';
```

2. Remove `Check` from the `lucide-svelte` import **only if** it is no longer used — it still is, by the `saved` screen, so leave that import alone.

3. Replace the whole `<ul class="mt-4 space-y-2"> … </ul>` block (the `{#each verses as v, i (i)}` list) with:

```svelte
		<VerseReviewList rows={verses} bind:titles bind:chosen {duplicates} />
```

4. Delete the now-unused local `toggle` function from the `<script>` block. `toggleAll` stays — the select-all control lives on the page, not in the list.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Check the deeplink screen still compiles and renders**

Run: `pnpm check`
Expected: no new errors in `src/routes/oyo/import/+page.svelte`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/components/oyo/VerseReviewList.svelte tests/unit/VerseReviewList.test.ts src/routes/oyo/import/+page.svelte
git commit -m "refactor(import): one review list, so its hard-won lesson has one home"
```

---

### Task 9: `ColumnMapper.svelte`

**Files:**
- Create: `src/lib/components/oyo/ColumnMapper.svelte`
- Create: `tests/unit/ColumnMapper.test.ts`

**Interfaces:**
- Consumes: `columnName` (Task 1), `ColumnMapping` (Task 5).
- Produces: `ColumnMapper` with props
  ```ts
  interface Props {
      labels: string[];
      mapping: ColumnMapping;
      hasHeader: boolean;
      onchange: (next: { mapping: ColumnMapping; hasHeader: boolean }) => void;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ColumnMapper.test.ts`:

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import ColumnMapper from '../../src/lib/components/oyo/ColumnMapper.svelte';

function base(overrides: Record<string, unknown> = {}) {
	return {
		labels: ['장절', '제목', '본문'],
		mapping: { cite: 0, title: 1, w: 2 },
		hasHeader: true,
		onchange: () => {},
		...overrides
	};
}

describe('ColumnMapper', () => {
	it('labels each option with its spreadsheet column letter', () => {
		render(ColumnMapper, { props: base() });
		expect(screen.getByRole('option', { name: 'A · 장절' })).toBeInTheDocument();
		expect(screen.getAllByRole('option', { name: 'C · 본문' }).length).toBeGreaterThan(0);
	});

	it('falls back to the bare letter for a column with no label', () => {
		render(ColumnMapper, { props: base({ labels: ['', ''], mapping: { cite: 0, title: null, w: 1 } }) });
		expect(screen.getAllByRole('option', { name: 'B' }).length).toBeGreaterThan(0);
	});

	it('offers 없음 for 제목 and 본문', () => {
		render(ColumnMapper, { props: base() });
		expect(screen.getAllByRole('option', { name: '없음' })).toHaveLength(2);
	});

	it('emits the whole mapping when a column is repicked', async () => {
		const onchange = vi.fn();
		render(ColumnMapper, { props: base({ onchange }) });
		await fireEvent.change(screen.getByLabelText('본문 열'), { target: { value: '1' } });
		expect(onchange).toHaveBeenCalledWith({
			mapping: { cite: 0, title: 1, w: 1 },
			hasHeader: true
		});
	});

	it('emits null when a column is set to 없음', async () => {
		const onchange = vi.fn();
		render(ColumnMapper, { props: base({ onchange }) });
		await fireEvent.change(screen.getByLabelText('제목 열'), { target: { value: '' } });
		expect(onchange).toHaveBeenCalledWith({
			mapping: { cite: 0, title: null, w: 2 },
			hasHeader: true
		});
	});

	it('emits hasHeader when the header checkbox is toggled', async () => {
		const onchange = vi.fn();
		render(ColumnMapper, { props: base({ onchange }) });
		await fireEvent.click(screen.getByLabelText('첫 행은 제목 줄'));
		expect(onchange).toHaveBeenCalledWith({
			mapping: { cite: 0, title: 1, w: 2 },
			hasHeader: false
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/ColumnMapper.test.ts`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Write the component**

Create `src/lib/components/oyo/ColumnMapper.svelte`:

```svelte
<script lang="ts">
	import { columnName } from '$lib/utils/columnName';
	import type { ColumnMapping } from '$lib/oyo/tableColumns';

	interface Props {
		/** Header cells, or the first row's values when there is no header. */
		labels: string[];
		mapping: ColumnMapping;
		hasHeader: boolean;
		onchange: (next: { mapping: ColumnMapping; hasHeader: boolean }) => void;
	}

	let { labels, mapping, hasHeader, onchange }: Props = $props();

	// A · 장절 rather than just 장절: the letter is what the reader sees in
	// Excel, and a table with two columns headed 본문 is otherwise ambiguous.
	const options = $derived(
		labels.map((label, i) => ({
			value: String(i),
			text: label ? `${columnName(i)} · ${label}` : columnName(i)
		}))
	);

	function pickCite(value: string) {
		onchange({ mapping: { ...mapping, cite: Number(value) }, hasHeader });
	}

	function pickOptional(role: 'title' | 'w', value: string) {
		onchange({
			mapping: { ...mapping, [role]: value === '' ? null : Number(value) },
			hasHeader
		});
	}
</script>

<div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
	<div class="space-y-2.5">
		<div class="flex items-center gap-3">
			<span class="w-9 shrink-0 text-[13px] text-[var(--color-text-secondary)]">장절</span>
			<select
				aria-label="장절 열"
				value={String(mapping.cite)}
				onchange={(e) => pickCite(e.currentTarget.value)}
				class="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1.5 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
			>
				<!-- No 없음 here: without a citation there is nothing to import. -->
				{#each options as o (o.value)}
					<option value={o.value}>{o.text}</option>
				{/each}
			</select>
		</div>

		<div class="flex items-center gap-3">
			<span class="w-9 shrink-0 text-[13px] text-[var(--color-text-secondary)]">제목</span>
			<select
				aria-label="제목 열"
				value={mapping.title === null ? '' : String(mapping.title)}
				onchange={(e) => pickOptional('title', e.currentTarget.value)}
				class="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1.5 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
			>
				<option value="">없음</option>
				{#each options as o (o.value)}
					<option value={o.value}>{o.text}</option>
				{/each}
			</select>
		</div>

		<div class="flex items-center gap-3">
			<span class="w-9 shrink-0 text-[13px] text-[var(--color-text-secondary)]">본문</span>
			<select
				aria-label="본문 열"
				value={mapping.w === null ? '' : String(mapping.w)}
				onchange={(e) => pickOptional('w', e.currentTarget.value)}
				class="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1.5 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
			>
				<option value="">없음</option>
				{#each options as o (o.value)}
					<option value={o.value}>{o.text}</option>
				{/each}
			</select>
		</div>
	</div>

	<!--
		The escape hatch for both directions detection can be wrong. Taking the
		first verse for a header loses a verse in silence; taking a header for a
		verse leaves a junk row in the preview. Header rule 2 catches most of
		both, and this catches the rest.
	-->
	<label class="mt-3 flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
		<input
			type="checkbox"
			checked={hasHeader}
			onchange={(e) => onchange({ mapping, hasHeader: e.currentTarget.checked })}
			class="h-[15px] w-[15px] rounded border-[var(--color-border)] accent-[var(--color-accent)]"
		/>
		첫 행은 제목 줄
	</label>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/ColumnMapper.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/oyo/ColumnMapper.svelte tests/unit/ColumnMapper.test.ts
git commit -m "feat(import): three selects and the checkbox that saves a verse"
```

---

### Task 10: The table import screen

**Files:**
- Create: `src/routes/oyo/import/table/+page.svelte`
- Create: `tests/unit/tableImportPage.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–9, plus `createOyoVerse`, `listOyoVerses`, `seedOyoPackageIfMissing` from `$lib/db/oyo`, and `Header` from `$lib/components/nav/Header.svelte`.
- Produces: the route `/oyo/import/table`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tableImportPage.test.ts`:

```ts
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TableImportPage from '../../src/routes/oyo/import/table/+page.svelte';
import { __clearChapterCacheForTest } from '../../src/lib/bible/fetch';

const created: { cite: string; title: string; w: string }[] = [];

vi.mock('../../src/lib/db/oyo', () => ({
	OYO_PACKAGE_ID: 'oyo',
	seedOyoPackageIfMissing: vi.fn(async () => {}),
	listOyoVerses: vi.fn(async () => []),
	createOyoVerse: vi.fn(async (input: { cite: string; title: string; w: string }) => {
		created.push(input);
		return { package_id: 'oyo', no: created.length, i: created.length, ...input };
	})
}));

function stubFetch() {
	const spy = vi.fn(async () => {
		const verses = Array.from({ length: 40 }, (_, i) => ({ verse: i + 1, text: `절 ${i + 1}` }));
		return { ok: true, json: async () => verses } as unknown as Response;
	});
	vi.stubGlobal('fetch', spy);
	return spy;
}

/** Types a table into the paste box and reads it. */
async function paste(text: string) {
	await fireEvent.input(screen.getByLabelText('표 붙여넣기'), { target: { value: text } });
	await fireEvent.click(screen.getByRole('button', { name: '표 읽기' }));
}

beforeEach(() => {
	created.length = 0;
	__clearChapterCacheForTest();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('table import screen', () => {
	it('shows the confirm step after reading a pasted table', async () => {
		stubFetch();
		render(TableImportPage);
		await paste('장절\t제목\n요 3:16\t영생');
		expect(await screen.findByText('이렇게 읽었습니다. 맞나요?')).toBeInTheDocument();
		expect(screen.getByLabelText('장절 열')).toBeInTheDocument();
	});

	it('makes no request while the reader is still choosing columns', async () => {
		const spy = stubFetch();
		render(TableImportPage);
		await paste('장절\t제목\n요 3:16\t영생');
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		await fireEvent.change(screen.getByLabelText('본문 열'), { target: { value: '1' } });
		await fireEvent.change(screen.getByLabelText('제목 열'), { target: { value: '' } });
		expect(spy).not.toHaveBeenCalled();
	});

	it('repaints the summary when a column is repicked', async () => {
		stubFetch();
		render(TableImportPage);
		await paste(
			'요 3:16\t하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니\n창 12:1\t여호와께서 아브람에게 이르시되 너는 너의 본토를 떠나'
		);
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		// The long second column was read as the body, so nothing needs fetching.
		expect(screen.getByText('구절 2개')).toBeInTheDocument();
		// Say it is not the body, and both rows now need one.
		await fireEvent.change(screen.getByLabelText('본문 열'), { target: { value: '' } });
		expect(
			await screen.findByText('구절 2개 · 본문 없는 2개는 성경에서 가져옵니다')
		).toBeInTheDocument();
	});

	it('disables 계속 when the mapping yields no rows', async () => {
		stubFetch();
		render(TableImportPage);
		await paste('요 3:16\t\n창 12:1\t');
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		await fireEvent.change(screen.getByLabelText('장절 열'), { target: { value: '1' } });
		await waitFor(() =>
			expect(screen.getByRole('button', { name: '맞아요, 계속' })).toBeDisabled()
		);
		expect(screen.getByText('이 설정으로는 가져올 구절이 없습니다')).toBeInTheDocument();
	});

	it('starts fetching bodies only once the columns are confirmed', async () => {
		const spy = stubFetch();
		render(TableImportPage);
		await paste('장절\n요 3:16');
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		expect(spy).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: '맞아요, 계속' }));
		await waitFor(() => expect(spy).toHaveBeenCalled());
		expect(await screen.findByText('절 16')).toBeInTheDocument();
	});

	it('refuses an .xlsx with a message that names the way out', async () => {
		stubFetch();
		render(TableImportPage);
		const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'verses.xlsx');
		await fireEvent.change(screen.getByLabelText('CSV 파일 선택'), { target: { files: [file] } });
		expect(
			await screen.findByText(/엑셀 파일은 아직 직접 읽지 못합니다/)
		).toBeInTheDocument();
	});

	it('goes back from review to the confirm step', async () => {
		stubFetch();
		render(TableImportPage);
		await paste('장절\t본문\n요 3:16\t하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니');
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		await fireEvent.click(screen.getByRole('button', { name: '맞아요, 계속' }));
		await screen.findByRole('button', { name: /나의 구절에 담기/ });
		await fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
		expect(await screen.findByText('이렇게 읽었습니다. 맞나요?')).toBeInTheDocument();
	});

	it('saves the chosen rows and says how many landed', async () => {
		stubFetch();
		render(TableImportPage);
		await paste('장절\t제목\t본문\n요 3:16\t영생\t하나님이 세상을 이처럼 사랑하사 독생자를');
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		await fireEvent.click(screen.getByRole('button', { name: '맞아요, 계속' }));
		await fireEvent.click(await screen.findByRole('button', { name: /나의 구절에 담기/ }));
		expect(await screen.findByText('1개 구절을 나의 구절에 담았습니다')).toBeInTheDocument();
		expect(created).toEqual([
			{ cite: '요한복음 3 : 16', title: '영생', w: '하나님이 세상을 이처럼 사랑하사 독생자를' }
		]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tableImportPage.test.ts`
Expected: FAIL — cannot resolve `+page.svelte`.

- [ ] **Step 3: Write the page**

Create `src/routes/oyo/import/table/+page.svelte`:

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import Header from '$lib/components/nav/Header.svelte';
	import ColumnMapper from '$lib/components/oyo/ColumnMapper.svelte';
	import VerseReviewList from '$lib/components/oyo/VerseReviewList.svelte';
	import { BookPlus, Check, RotateCw } from 'lucide-svelte';
	import { decodeTableFile, TableFileError } from '$lib/oyo/tableText';
	import { parseDelimited } from '$lib/oyo/tableParse';
	import {
		applyMapping,
		detectColumns,
		type ColumnMapping,
		type TableDraft
	} from '$lib/oyo/tableColumns';
	import { duplicateIndexes } from '$lib/oyo/cite';
	import { fillMissingBodies, type RowStatus } from '$lib/oyo/autofill';
	import { createOyoVerse, listOyoVerses, seedOyoPackageIfMissing } from '$lib/db/oyo';

	type Screen =
		| { kind: 'pick'; error: string | null }
		| { kind: 'confirm' }
		| { kind: 'review' }
		| { kind: 'saved'; count: number };

	let screen = $state<Screen>({ kind: 'pick', error: null });

	// Set once the grid is parsed and kept for the life of the screen: the
	// mapper edits the mapping, never the grid, so re-deriving is free.
	let grid = $state<string[][]>([]);
	let labels = $state<string[]>([]);
	let hasHeader = $state(false);
	let mapping = $state<ColumnMapping>({ cite: 0, title: null, w: null });
	let drafts = $state<TableDraft[]>([]);
	let truncated = $state(false);

	// Populated on confirm.
	let titles = $state<string[]>([]);
	let chosen = $state<Set<number>>(new Set());
	let duplicates = $state<Set<number>>(new Set());
	let statuses = $state<RowStatus[]>([]);
	let filling = $state(false);
	let fillTotal = $state(0);
	let fillDone = $state(0);
	let networkDown = $state(false);
	let saving = $state(false);
	// Kept out of the Screen union: a failed save must not cost the reader the
	// bodies the fill just fetched, so it stays on `review` and says so here.
	let saveError = $state<string | null>(null);

	let pasteText = $state('');
	let fillRun: AbortController | null = null;

	const FILE_ERRORS: Record<string, string> = {
		'too-large': '파일이 너무 큽니다 (2MB까지).',
		xlsx: '엑셀 파일은 아직 직접 읽지 못합니다. 엑셀에서 셀을 복사해 아래에 붙여넣거나, CSV로 저장해주세요.',
		empty: '표를 읽지 못했습니다. 파일을 확인해주세요.'
	};

	const missingBodies = $derived(drafts.filter((d) => d.w.length === 0).length);
	const hasNoBody = $derived(statuses.some((s) => s === 'no-body'));
	const saveCount = $derived([...chosen].filter((i) => statuses[i] !== 'no-body').length);
	/** Rows that could be chosen at all. A bodiless row is not one of them, so
	 *  the select-all control has to measure against this rather than against
	 *  the whole list — otherwise it never reads 전체 해제. */
	const selectable = $derived(drafts.map((_, i) => i).filter((i) => statuses[i] !== 'no-body'));
	const allSelected = $derived(selectable.length > 0 && chosen.size === selectable.length);

	/** Re-reads the grid through the current mapping. Pure, instant, and the
	 *  only thing a mapper change does — the network is on the far side of
	 *  the confirm button. */
	function rederive() {
		const out = applyMapping(grid, hasHeader, mapping);
		drafts = out.drafts;
		truncated = out.truncated;
	}

	function readGrid(text: string) {
		const parsed = parseDelimited(text);
		if (parsed.length === 0) {
			screen = { kind: 'pick', error: '가져올 구절이 없습니다.' };
			return;
		}
		grid = parsed;
		const detected = detectColumns(parsed);
		labels = detected.labels;
		hasHeader = detected.hasHeader;
		mapping = detected.mapping;
		rederive();
		screen = { kind: 'confirm' };
	}

	async function onFileChosen(e: Event) {
		const el = e.target as HTMLInputElement;
		const file = el.files?.[0];
		if (!file) return;
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			readGrid(decodeTableFile(bytes).text);
		} catch (err) {
			const kind = err instanceof TableFileError ? err.kind : 'empty';
			screen = { kind: 'pick', error: FILE_ERRORS[kind] };
		} finally {
			// Reset so re-picking the same file still fires a change event.
			el.value = '';
		}
	}

	function onPasteRead() {
		if (pasteText.trim().length === 0) return;
		readGrid(pasteText);
	}

	function onMapperChange(next: { mapping: ColumnMapping; hasHeader: boolean }) {
		mapping = next.mapping;
		hasHeader = next.hasHeader;
		rederive();
	}

	async function confirm() {
		if (drafts.length === 0) return;
		const existing = await listOyoVerses().catch(() => []);
		duplicates = duplicateIndexes(
			drafts,
			existing.map((v) => v.cite)
		);
		titles = drafts.map((d) => d.title);
		// Everything the reader does not already have starts checked: they
		// built this table on purpose, so the screen should not make them
		// choose again — only reconsider the ones already on file.
		chosen = new Set(drafts.map((_, i) => i).filter((i) => !duplicates.has(i)));
		statuses = drafts.map((d) => (d.w.length > 0 ? 'ready' : 'loading'));
		screen = { kind: 'review' };
		await runFill();
	}

	async function runFill() {
		const pending = drafts.filter((d) => d.w.length === 0).length;
		if (pending === 0) return;
		fillRun?.abort();
		const run = new AbortController();
		fillRun = run;
		fillTotal = pending;
		fillDone = 0;
		networkDown = false;
		filling = true;
		try {
			const summary = await fillMissingBodies(
				drafts,
				(p) => {
					if (run.signal.aborted) return;
					// The fetched body is written back into the draft, so `drafts`
					// stays the live row data. That is what lets 다시 시도 re-run
					// over the whole list and touch only what is still missing.
					if (p.status === 'ready' && p.w !== undefined) drafts[p.index].w = p.w;
					statuses[p.index] = p.status;
					if (p.status !== 'loading') fillDone++;
					// Reassigned rather than mutated: Svelte 5 proxies arrays and
					// objects but not Sets, so `chosen.delete(i)` would drop the
					// row from the set and never repaint the check that shows it.
					if (p.status === 'no-body')
						chosen = new Set([...chosen].filter((c) => c !== p.index));
				},
				{ signal: run.signal }
			);
			if (!run.signal.aborted) networkDown = summary.abortedEarly;
		} finally {
			if (!run.signal.aborted) filling = false;
		}
	}

	function back() {
		if (screen.kind === 'review') {
			fillRun?.abort();
			filling = false;
			screen = { kind: 'confirm' };
			return;
		}
		if (screen.kind === 'confirm') {
			screen = { kind: 'pick', error: null };
			return;
		}
		goto('/library/oyo');
	}

	async function save() {
		if (saving || saveCount === 0) return;
		saving = true;
		saveError = null;
		try {
			// Seeded first: a reader who has never opened 나의 구절 has no OYO
			// package row, and the verses would land in a package the library
			// cannot render.
			await seedOyoPackageIfMissing();
			// Sequential, not Promise.all: createOyoVerse reads max(no) + 1 to
			// pick the next number, so parallel writes would all read the same
			// max and collide on the primary key.
			const order = [...chosen].filter((i) => statuses[i] !== 'no-body').sort((a, b) => a - b);
			for (const i of order) {
				await createOyoVerse({ cite: drafts[i].cite, w: drafts[i].w, title: titles[i].trim() });
			}
			screen = { kind: 'saved', count: order.length };
		} catch {
			saveError = '구절을 저장하지 못했습니다. 다시 시도해주세요.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>표에서 가져오기 · MemScripture</title></svelte:head>

<Header
	title="표에서 가져오기"
	onBack={back}
	showVerseToggle={false}
	showFontScale={false}
	showSearch={false}
/>

<main class="mx-auto max-w-2xl px-5 pb-8 pt-6">
	{#if screen.kind === 'pick'}
		<label
			class="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] px-4 py-8 text-center transition-colors hover:border-[var(--color-accent)]"
		>
			<span class="text-[14px] font-semibold text-[var(--color-text)]">CSV 파일 선택</span>
			<span class="text-[12px] text-[var(--color-text-tertiary)]">.csv · .tsv · .txt · 2MB까지</span>
			<input
				type="file"
				accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
				aria-label="CSV 파일 선택"
				onchange={onFileChosen}
				class="sr-only"
			/>
		</label>

		{#if screen.error}
			<p class="mt-3 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
				{screen.error}
			</p>
		{/if}

		<p class="mt-6 text-[13px] text-[var(--color-text-secondary)]">
			또는 엑셀·구글시트에서 셀을 복사해 붙여넣으세요
		</p>
		<textarea
			bind:value={pasteText}
			aria-label="표 붙여넣기"
			rows="5"
			class="mt-2 w-full resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
		></textarea>
		<div class="mt-2 flex justify-end">
			<button
				type="button"
				onclick={onPasteRead}
				disabled={pasteText.trim().length === 0}
				class="rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-[var(--color-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-40"
			>
				표 읽기
			</button>
		</div>
	{:else if screen.kind === 'confirm'}
		<h2 class="text-[15px] font-semibold text-[var(--color-text)]">이렇게 읽었습니다. 맞나요?</h2>

		<div class="mt-3">
			<ColumnMapper {labels} {mapping} {hasHeader} onchange={onMapperChange} />
		</div>

		<h3 class="mt-5 text-[13px] font-semibold text-[var(--color-text-secondary)]">미리보기</h3>
		<ul class="mt-2 space-y-1.5">
			{#each drafts.slice(0, 3) as d (d.row)}
				<li class="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
					<span class="text-[var(--color-text)]">{d.cite}</span>
					·
					{d.title || '—'}
					·
					{#if d.w}{d.w}{:else}<span class="text-[var(--color-text-tertiary)]"
							>(성경에서 가져옵니다)</span
						>{/if}
				</li>
			{/each}
		</ul>

		<p class="mt-4 text-[13px] text-[var(--color-text-secondary)]">
			{#if drafts.length === 0}
				이 설정으로는 가져올 구절이 없습니다
			{:else}
				구절 {drafts.length}개{#if missingBodies > 0}
					· 본문 없는 {missingBodies}개는 성경에서 가져옵니다{/if}{#if truncated}
					· 앞 200개만 가져옵니다{/if}
			{/if}
		</p>

		<button
			type="button"
			onclick={confirm}
			disabled={drafts.length === 0}
			class="mt-5 inline-flex w-full items-center justify-center rounded-full bg-[var(--color-accent)] px-4 py-2.5 text-[14px] font-semibold text-[var(--color-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-40"
		>
			맞아요, 계속
		</button>
	{:else if screen.kind === 'review'}
		<div class="flex items-baseline justify-between gap-3">
			<h2 class="text-[15px] font-semibold text-[var(--color-text)]">
				구절 {drafts.length}개
			</h2>
			{#if filling}
				<span class="text-[12px] text-[var(--color-text-tertiary)]">
					본문 불러오는 중 {fillDone}/{fillTotal}
				</span>
			{:else}
				<button
					type="button"
					onclick={() => (chosen = allSelected ? new Set() : new Set(selectable))}
					class="text-[12px] font-medium text-[var(--color-accent)] hover:underline"
				>
					{allSelected ? '전체 해제' : '전체 선택'}
				</button>
			{/if}
		</div>

		{#if networkDown}
			<p class="mt-2 text-[12px] text-[var(--color-text-secondary)]">
				본문을 가져오지 못했습니다. 네트워크를 확인해주세요.
			</p>
		{/if}

		<VerseReviewList rows={drafts} bind:titles bind:chosen {duplicates} {statuses} />

		{#if hasNoBody && !filling}
			<div class="mt-3 flex justify-end">
				<button
					type="button"
					onclick={runFill}
					class="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
				>
					<RotateCw size={13} strokeWidth={1.75} />
					다시 시도
				</button>
			</div>
		{/if}

		{#if saveError}
			<p class="mt-3 text-[13px] text-[var(--color-text-secondary)]">{saveError}</p>
		{/if}

		<button
			type="button"
			disabled={saving || filling || saveCount === 0}
			onclick={save}
			class="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2.5 text-[14px] font-semibold text-[var(--color-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-40"
		>
			<BookPlus size={16} strokeWidth={2} />
			{saving ? '담는 중…' : `나의 구절에 담기 (${saveCount})`}
		</button>
	{:else}
		<div class="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text)]">
			<Check size={18} strokeWidth={2.25} class="text-[var(--color-success)]" />
			{screen.count}개 구절을 나의 구절에 담았습니다
		</div>
		<a
			href="/library/oyo"
			class="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[var(--color-on-accent)] transition-opacity hover:opacity-90"
		>
			나의 구절 보기
		</a>
	{/if}
</main>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/tableImportPage.test.ts`
Expected: PASS, 8 tests.

(`Header.svelte` labels its back control `aria-label="뒤로"`, which is what the back test selects on.)

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm check`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/oyo/import/table/+page.svelte tests/unit/tableImportPage.test.ts
git commit -m "feat(import): pick, confirm, review — the table door"
```

---

### Task 11: The 가져오기 menu on 나의 구절

There are now two unrelated things called 가져오기, and one button cannot mean both.

**Files:**
- Modify: `src/routes/library/oyo/+page.svelte`
- Create: `tests/unit/oyoImportMenu.test.ts`

**Interfaces:**
- Consumes: the route `/oyo/import/table` (Task 10).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/oyoImportMenu.test.ts`:

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import OyoPage from '../../src/routes/library/oyo/+page.svelte';

vi.mock('../../src/lib/db/oyo', () => ({
	OYO_PACKAGE_ID: 'oyo',
	listOyoVerses: vi.fn(async () => []),
	createOyoVerse: vi.fn(async () => ({})),
	updateOyoVerse: vi.fn(async () => {}),
	deleteOyoVerse: vi.fn(async () => null),
	restoreOyoVerse: vi.fn(async () => {})
}));

vi.mock('../../src/lib/db/verseRatings', () => ({
	getVerseRating: vi.fn(async () => null),
	setStartDifficulty: vi.fn(async () => {}),
	setFullDifficulty: vi.fn(async () => {})
}));

describe('나의 구절 — 가져오기 menu', () => {
	it('offers both doors instead of going straight to a file picker', async () => {
		render(OyoPage);
		await fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
		expect(screen.getByRole('menuitem', { name: /표에서 가져오기/ })).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: /백업에서 복원/ })).toBeInTheDocument();
	});

	it('points the table door at its route', async () => {
		render(OyoPage);
		await fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
		expect(screen.getByRole('menuitem', { name: /표에서 가져오기/ })).toHaveAttribute(
			'href',
			'/oyo/import/table'
		);
	});

	it('closes the menu on Escape', async () => {
		render(OyoPage);
		await fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(screen.queryByRole('menu', { name: '가져오기 방법' })).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/oyoImportMenu.test.ts`
Expected: FAIL — no `menuitem` roles; the button opens a file picker instead.

- [ ] **Step 3: Add the menu state to the script block**

In `src/routes/library/oyo/+page.svelte`, replace the existing `handleImport` function:

```ts
	function handleImport() {
		fileInputEl?.click();
	}
```

with:

```ts
	let importMenuOpen = $state(false);

	function handleImport() {
		importMenuOpen = !importMenuOpen;
	}

	function chooseBackupRestore() {
		importMenuOpen = false;
		fileInputEl?.click();
	}

	// Escape and an outside click both close the menu, because a popover that
	// only closes by choosing something traps a reader who opened it by mistake.
	$effect(() => {
		if (!importMenuOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') importMenuOpen = false;
		};
		const onDown = () => (importMenuOpen = false);
		window.addEventListener('keydown', onKey);
		// Deferred a tick: the click that opened the menu is still propagating.
		const timer = setTimeout(() => window.addEventListener('pointerdown', onDown), 0);
		return () => {
			clearTimeout(timer);
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('pointerdown', onDown);
		};
	});
```

- [ ] **Step 4: Render the menu**

In the same file, find the 가져오기 button's wrapper — the `<div class="group relative">` that contains the `FolderInput` button and its tooltip. Replace that whole `<div class="group relative"> … </div>` block with:

```svelte
			<div class="group relative">
				<button
					type="button"
					onclick={handleImport}
					aria-label="가져오기"
					aria-haspopup="menu"
					aria-expanded={importMenuOpen}
					class="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
				>
					<FolderInput size={16} strokeWidth={1.75} />
				</button>
				{#if !importMenuOpen}
					<span
						role="tooltip"
						class="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--color-text)] px-2 py-1 text-[11px] font-medium text-[var(--color-card)] opacity-0 transition-opacity group-hover:opacity-100"
					>
						가져오기
					</span>
				{/if}
				{#if importMenuOpen}
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<div
						role="menu"
						aria-label="가져오기 방법"
						onpointerdown={(e) => e.stopPropagation()}
						class="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-lg"
					>
						<a
							role="menuitem"
							href="/oyo/import/table"
							class="block px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-elevated)]"
						>
							<span class="block text-[13px] font-medium text-[var(--color-text)]">
								표에서 가져오기
							</span>
							<span class="block text-[11px] text-[var(--color-text-tertiary)]">
								CSV · 엑셀 붙여넣기
							</span>
						</a>
						<button
							type="button"
							role="menuitem"
							onclick={chooseBackupRestore}
							class="block w-full border-t border-[var(--color-border)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-elevated)]"
						>
							<span class="block text-[13px] font-medium text-[var(--color-text)]">
								백업에서 복원
							</span>
							<span class="block text-[11px] text-[var(--color-text-tertiary)]">JSON</span>
						</button>
					</div>
				{/if}
			</div>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/oyoImportMenu.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `pnpm test`
Expected: PASS.

Run: `pnpm check`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/library/oyo/+page.svelte tests/unit/oyoImportMenu.test.ts
git commit -m "feat(oyo): one button cannot mean two kinds of 가져오기"
```

---

### Task 12: End-to-end — paste, confirm, fill, save

**Files:**
- Create: `tests/e2e/table-import.spec.ts`

**Interfaces:**
- Consumes: everything. Nothing depends on this.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/table-import.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('표에서 가져오기', () => {
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
		await page.waitForLoadState('networkidle');

		// Stand in for bolls.life so the run neither depends on that host being
		// up nor pays for its latency. One verse per number, so any range in
		// the fixture resolves.
		await page.route('https://bolls.life/get-text/**', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(
					Array.from({ length: 40 }, (_, i) => ({ verse: i + 1, text: `본문 ${i + 1}` }))
				)
			})
		);
	});

	test('paste → confirm → fill → save', async ({ page }) => {
		await page.goto('/library/oyo');

		// The 가져오기 button now offers two doors.
		await page.getByRole('button', { name: '가져오기' }).click();
		await page.getByRole('menuitem', { name: /표에서 가져오기/ }).click();
		await expect(page).toHaveURL(/\/oyo\/import\/table$/);

		// A three-row table with no bodies at all — the fill has to supply them.
		await page
			.getByLabel('표 붙여넣기')
			.fill('장절\t제목\n요 3:16\t영생\n창 12:1\t부르심\n시 23:1\t목자');
		await page.getByRole('button', { name: '표 읽기' }).click();

		// Step one: the guess, shown before anything is fetched.
		await expect(page.getByText('이렇게 읽었습니다. 맞나요?')).toBeVisible();
		await expect(page.getByText('본문 없는 3개는 성경에서 가져옵니다')).toBeVisible();

		await page.getByRole('button', { name: '맞아요, 계속' }).click();

		// Step two: the bodies land and the save button counts them.
		await expect(page.getByText('본문 16')).toBeVisible();
		const save = page.getByRole('button', { name: /나의 구절에 담기 \(3\)/ });
		await expect(save).toBeEnabled();
		await save.click();

		await expect(page.getByText('3개 구절을 나의 구절에 담았습니다')).toBeVisible();

		// And they are really there.
		await page.getByRole('link', { name: '나의 구절 보기' }).click();
		await expect(page).toHaveURL(/\/library\/oyo$/);
		await expect(page.getByText('요한복음 3 : 16')).toBeVisible();
		await expect(page.getByText('창세기 12 : 1')).toBeVisible();
		await expect(page.getByText('시편 23 : 1')).toBeVisible();
	});

	test('an .xlsx is refused with a way out', async ({ page }) => {
		await page.goto('/oyo/import/table');
		await page.getByLabel('CSV 파일 선택').setInputFiles({
			name: 'verses.xlsx',
			mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])
		});
		await expect(page.getByText(/엑셀 파일은 아직 직접 읽지 못합니다/)).toBeVisible();
	});
});
```

- [ ] **Step 2: Run the spec**

Run: `pnpm test:e2e tests/e2e/table-import.spec.ts`
Expected: PASS, 2 tests.

(The three saved verses all carry titles, so `citeShownSeparately` is true and `VerseCard` prints the citation as plain text — which is what the final assertions select on.)

- [ ] **Step 3: Run every suite**

Run: `pnpm test`
Expected: PASS.

Run: `pnpm test:e2e`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/table-import.spec.ts
git commit -m "test(e2e): a pasted table becomes three verses"
```

---

## Verification Checklist

Run after Task 12, before opening a PR:

- [ ] `pnpm test` — all unit tests pass
- [ ] `pnpm test:e2e` — all Playwright specs pass
- [ ] `pnpm check` — no new svelte-check errors
- [ ] `pnpm build` — the app builds
- [ ] Manual: `/oyo/import` (the deeplink door) still renders and imports — it now borrows `VerseReviewList`, and no page test covers it
- [ ] Manual: a CSV saved from Excel as plain CSV (CP949, not "CSV UTF-8") imports with readable Korean
