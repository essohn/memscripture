# 암송 DAY Excel Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Download every verse of the active memorization event as a single `.xlsx`, with optional colour-filled difficulty columns and optional canonical scripture ordering.

**Architecture:** Three dependency-ordered layers — a STORE-only ZIP writer, a generic OOXML sheet writer that consumes a domain-free sheet model, and a pure builder that turns verses + ratings + options into that model. UI sits on top and does the I/O.

**Tech Stack:** SvelteKit 2 (runes), TypeScript, Vitest + @testing-library/svelte, Dexie. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-08-10-amsong-day-excel-export-design.md`

## Global Constraints

- **No new npm dependencies.** The whole point of hand-rolling the writer is to keep the 103 KB gzipped bundle intact.
- Korean user-facing copy; English code comments — matches the existing codebase.
- Tab indentation, single quotes, semicolons (existing Prettier config).
- Comments explain **why**, not what. Match the density of `src/lib/sync/snapshot.ts`.
- Every task ends green: `pnpm test` passes and `pnpm check` reports **0 errors** (5 pre-existing warnings in `bookmarks/+page.svelte` and `today/+page.svelte` are expected and must not grow).
- Import via `$lib/...` inside `src/`; tests import via relative paths (`../../src/lib/...`), matching existing tests.

---

### Task 1: Citation sort key, book alias, data typos

**Files:**
- Modify: `src/lib/bible/index.ts`
- Modify: `static/data/900_krv.json` (2 lines)
- Test: `tests/unit/bible.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `citationSortKey(cite: string): CitationSortKey | null` where `CitationSortKey = { bookId: number; chapter: number; verse: number }`. Task 5 sorts with it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/bible.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { citationSortKey } from '../../src/lib/bible/index';

describe('citationSortKey', () => {
	it('reads a plain citation', () => {
		expect(citationSortKey('창세기 1 : 1')).toEqual({ bookId: 1, chapter: 1, verse: 1 });
	});

	// The curated data uses four different range separators. Ordering only
	// needs the leading verse, so all four collapse to the same key.
	it.each(['잠언 10 : 4-5', '잠언 10 : 4~5', '잠언 10 : 4∼5', '잠언 10 : 4,5'])(
		'takes the leading verse from %s',
		(cite) => {
			expect(citationSortKey(cite)).toEqual({ bookId: 20, chapter: 10, verse: 4 });
		}
	);

	it('ignores a 상/하 half-verse suffix', () => {
		expect(citationSortKey('역대하 16 : 9상')).toEqual({ bookId: 14, chapter: 16, verse: 9 });
	});

	it('treats a chapter-only citation as verse 0', () => {
		expect(citationSortKey('시편 23')).toEqual({ bookId: 19, chapter: 23, verse: 0 });
	});

	it('returns null for an unknown book', () => {
		expect(citationSortKey('없는책 1 : 1')).toBeNull();
	});

	// 900_krv writes 느헤미야, 242_krv writes 느헤미아. Both are in shipped
	// data, so both must resolve — this is an alias, not a correction.
	it('accepts both spellings of 느헤미야', () => {
		expect(getBookOrdinal('느헤미아')).toBe(16);
		expect(getBookOrdinal('느헤미야')).toBe(16);
	});
});

describe('shipped package citations', () => {
	const files = readdirSync('static/data').filter((f) => f.endsWith('_krv.json'));

	it('finds package files to check', () => {
		expect(files.length).toBeGreaterThan(0);
	});

	// Guards the whole corpus: any future data or vocabulary drift fails here
	// instead of silently sorting to the tail of the export.
	it.each(files)('every citation in %s yields a sort key', (file) => {
		const verses = JSON.parse(readFileSync(`static/data/${file}`, 'utf-8')) as {
			i: number;
			cite: string;
		}[];
		const unreadable = verses.filter((v) => citationSortKey(v.cite) === null);
		expect(unreadable.map((v) => `no.${v.i} ${v.cite}`)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/unit/bible.test.ts`
Expected: FAIL — `citationSortKey is not a function`.

- [ ] **Step 3: Add the alias to `getBookOrdinal`**

In `src/lib/bible/index.ts`, add above `getBookOrdinal`:

```ts
/** Spellings present in the curated data that the canonical table does not
 *  carry. 900_krv writes '느헤미야' (the standard form) while 242_krv writes
 *  the table's '느헤미아', so both must resolve — replacing the table entry
 *  would simply break the other package. */
const BOOK_ALIASES: Record<string, string> = {
	느헤미야: '느헤미아'
};
```

Then change the first line of `getBookOrdinal` from `const t = name.trim();` to:

```ts
	const raw = name.trim();
	const t = BOOK_ALIASES[raw] ?? raw;
```

- [ ] **Step 4: Add `citationSortKey`**

Append to `src/lib/bible/index.ts`:

```ts
/** Ordering key for a verse list. `verse` is 0 when the citation names
 *  only a chapter, which sorts it ahead of that chapter's verses. */
export interface CitationSortKey {
	bookId: number;
	chapter: number;
	verse: number;
}

// Prefix match, not a full-string match: everything after the first verse
// number is deliberately ignored.
const SORT_KEY_RE = /^(.*?)\s*([0-9]+)(?:\s*:\s*([0-9]+))?/;

/**
 * Lenient reader used only to order verse lists by scripture sequence.
 *
 * Deliberately separate from parsePassageRef. That function resolves a
 * reference for fetching verse text, and its {startVerse, endVerse} model
 * cannot honestly represent '요한복음 1 : 1,14' — verses 1 AND 14, not the
 * range 1–14. Widening it would change what OYO's autofill downloads.
 *
 * Ordering needs only the leading verse, so this tolerates every separator
 * the curated data actually uses ('-', '~', '∼', ',') and the 상/하
 * half-verse suffixes, by ignoring whatever follows the first verse number.
 *
 * Returns null when the leading token is not a known book.
 */
export function citationSortKey(cite: string): CitationSortKey | null {
	const m = SORT_KEY_RE.exec(cite.trim());
	if (!m) return null;
	const bookId = getBookOrdinal(m[1].trim());
	if (bookId === null) return null;
	return {
		bookId,
		chapter: parseInt(m[2], 10),
		verse: m[3] ? parseInt(m[3], 10) : 0
	};
}
```

- [ ] **Step 5: Fix the two data typos**

In `static/data/900_krv.json`:
- the entry with `"i": 335` — `"고리도전서 14 : 20"` → `"고린도전서 14 : 20"`
- the entry with `"i": 512` — `"잠엄 10 : 4-5"` → `"잠언 10 : 4-5"`

Change only the `cite` values. Leave `i`, `title`, and `w` untouched.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/bible.test.ts`
Expected: PASS. The corpus guard covers 1495 citations across 7 packages.

- [ ] **Step 7: Commit**

```bash
git add src/lib/bible/index.ts static/data/900_krv.json tests/unit/bible.test.ts
git commit -m "feat(bible): add citationSortKey and guard every shipped citation

Ordering a verse list by scripture sequence needs only the leading verse
number, so it gets its own lenient reader rather than a widened
parsePassageRef — that function resolves references for OYO's text
autofill, and '요한복음 1 : 1,14' means verses 1 and 14, which its
{startVerse, endVerse} model cannot represent.

Checking all 1495 shipped citations turned up 32 the old parser rejects.
Only two are defects (고리도전서, 잠엄, both on screen today via the verse
card's cite line); the rest are ordinary conventions — '∼'/'~' separators,
comma lists, 상/하 suffixes — that the new reader accepts.

'느헤미야' is added as an alias rather than a correction: 900_krv uses it
while 242_krv uses the table's '느헤미아', so both spellings ship."
```

---

### Task 2: Minimal ZIP writer

**Files:**
- Create: `src/lib/export/zip.ts`
- Test: `tests/unit/zip.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `crc32(bytes: Uint8Array): number` and `zipStore(entries: ZipEntry[]): Uint8Array` where `ZipEntry = { name: string; bytes: Uint8Array }`. Task 3 calls `zipStore`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/zip.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { crc32, zipStore } from '../../src/lib/export/zip';

const enc = new TextEncoder();

function u32(b: Uint8Array, o: number): number {
	return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}
function u16(b: Uint8Array, o: number): number {
	return b[o] | (b[o + 1] << 8);
}

describe('crc32', () => {
	// Published CRC-32/ISO-HDLC check vectors.
	it('matches known vectors', () => {
		expect(crc32(enc.encode(''))).toBe(0);
		expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
		expect(crc32(enc.encode('a'))).toBe(0xe8b7be43);
	});
});

describe('zipStore', () => {
	const entries = [
		{ name: 'hello.txt', bytes: enc.encode('hello') },
		{ name: 'dir/second.xml', bytes: enc.encode('<a/>') }
	];

	it('starts with a local file header', () => {
		expect(u32(zipStore(entries), 0)).toBe(0x04034b50);
	});

	it('ends with an end-of-central-directory record naming every entry', () => {
		const z = zipStore(entries);
		const eocd = z.length - 22;
		expect(u32(z, eocd)).toBe(0x06054b50);
		expect(u16(z, eocd + 10)).toBe(2); // total entries
		const dirOffset = u32(z, eocd + 16);
		const dirSize = u32(z, eocd + 12);
		expect(u32(z, dirOffset)).toBe(0x02014b50); // central directory header
		expect(dirOffset + dirSize).toBe(eocd);
	});

	// The central directory's stated offset for each entry must actually land
	// on that entry's local header — the single easiest thing to get wrong,
	// and the one that makes Excel offer to "repair" the file.
	it('points each central directory record at its local header', () => {
		const z = zipStore(entries);
		const eocd = z.length - 22;
		let p = u32(z, eocd + 16);
		for (const entry of entries) {
			expect(u32(z, p)).toBe(0x02014b50);
			const nameLen = u16(z, p + 28);
			const localOffset = u32(z, p + 42);
			expect(u32(z, localOffset)).toBe(0x04034b50);
			const localNameLen = u16(z, localOffset + 26);
			const name = new TextDecoder().decode(
				z.subarray(localOffset + 30, localOffset + 30 + localNameLen)
			);
			expect(name).toBe(entry.name);
			const dataStart = localOffset + 30 + localNameLen + u16(z, localOffset + 28);
			expect(z.subarray(dataStart, dataStart + entry.bytes.length)).toEqual(entry.bytes);
			p += 46 + nameLen;
		}
	});

	it('stores entries uncompressed with matching sizes', () => {
		const z = zipStore(entries);
		expect(u16(z, 8)).toBe(0); // compression method: STORE
		expect(u32(z, 18)).toBe(u32(z, 22)); // compressed size === uncompressed
		expect(u32(z, 14)).toBe(crc32(entries[0].bytes));
	});

	it('is deterministic', () => {
		expect(zipStore(entries)).toEqual(zipStore(entries));
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/unit/zip.test.ts`
Expected: FAIL — cannot resolve `../../src/lib/export/zip`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/export/zip.ts`:

```ts
/**
 * Minimal ZIP writer — exactly enough container for the .xlsx export.
 *
 * Every entry is STORED (uncompressed). A 149-row workbook is tens of
 * kilobytes either way, and skipping DEFLATE removes a compression
 * dependency and a second code path with it.
 */

const CRC_TABLE = /* @__PURE__ */ (() => {
	const t = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[i] = c >>> 0;
	}
	return t;
})();

/** CRC-32/ISO-HDLC, the variant ZIP requires. */
export function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
	name: string;
	bytes: Uint8Array;
}

// A fixed 1980-01-01 stamp keeps output byte-identical across runs, which is
// what lets the tests compare whole archives. An all-zero DOS date is not a
// legal date and upsets some readers, so use the epoch of the format itself.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

// Bit 11 declares that names are UTF-8. All names here are ASCII, but saying
// so costs nothing and keeps the door open for non-ASCII entry names.
const FLAG_UTF8 = 0x0800;

class ByteWriter {
	private buf = new Uint8Array(1024);
	private len = 0;

	private grow(n: number): void {
		if (this.len + n <= this.buf.length) return;
		let cap = this.buf.length * 2;
		while (cap < this.len + n) cap *= 2;
		const next = new Uint8Array(cap);
		next.set(this.buf.subarray(0, this.len));
		this.buf = next;
	}

	u16(v: number): void {
		this.grow(2);
		this.buf[this.len++] = v & 0xff;
		this.buf[this.len++] = (v >>> 8) & 0xff;
	}

	u32(v: number): void {
		this.grow(4);
		for (let i = 0; i < 4; i++) this.buf[this.len++] = (v >>> (i * 8)) & 0xff;
	}

	raw(b: Uint8Array): void {
		this.grow(b.length);
		this.buf.set(b, this.len);
		this.len += b.length;
	}

	get offset(): number {
		return this.len;
	}

	take(): Uint8Array {
		return this.buf.slice(0, this.len);
	}
}

export function zipStore(entries: ZipEntry[]): Uint8Array {
	const w = new ByteWriter();
	const enc = new TextEncoder();
	const dir: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];

	for (const e of entries) {
		const name = enc.encode(e.name);
		const crc = crc32(e.bytes);
		const offset = w.offset;
		w.u32(0x04034b50); // local file header
		w.u16(20); // version needed to extract
		w.u16(FLAG_UTF8);
		w.u16(0); // method: STORE
		w.u16(DOS_TIME);
		w.u16(DOS_DATE);
		w.u32(crc);
		w.u32(e.bytes.length); // compressed size — equal, because STORE
		w.u32(e.bytes.length); // uncompressed size
		w.u16(name.length);
		w.u16(0); // extra field length
		w.raw(name);
		w.raw(e.bytes);
		dir.push({ name, crc, size: e.bytes.length, offset });
	}

	const dirStart = w.offset;
	for (const d of dir) {
		w.u32(0x02014b50); // central directory header
		w.u16(20); // version made by
		w.u16(20); // version needed
		w.u16(FLAG_UTF8);
		w.u16(0);
		w.u16(DOS_TIME);
		w.u16(DOS_DATE);
		w.u32(d.crc);
		w.u32(d.size);
		w.u32(d.size);
		w.u16(d.name.length);
		w.u16(0); // extra length
		w.u16(0); // comment length
		w.u16(0); // disk number start
		w.u16(0); // internal attributes
		w.u32(0); // external attributes
		w.u32(d.offset);
		w.raw(d.name);
	}
	const dirSize = w.offset - dirStart;

	w.u32(0x06054b50); // end of central directory
	w.u16(0); // this disk
	w.u16(0); // disk with central directory
	w.u16(dir.length); // entries on this disk
	w.u16(dir.length); // entries total
	w.u32(dirSize);
	w.u32(dirStart);
	w.u16(0); // comment length
	return w.take();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/zip.test.ts`
Expected: PASS (9 assertions across 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/export/zip.ts tests/unit/zip.test.ts
git commit -m "feat(export): add a STORE-only ZIP writer

An .xlsx is a ZIP of small XML parts, so the export needs a container. At
149 rows the archive is tens of kilobytes whether deflated or not, so it
stores entries uncompressed and avoids a compression dependency and the
second code path that comes with it.

Output is deterministic (fixed 1980-01-01 DOS stamp) so tests can compare
whole archives. The central-directory offsets are asserted against the
local headers they claim to point at — the failure that makes Excel offer
to repair a file."
```

---

### Task 3: OOXML sheet writer

**Files:**
- Create: `src/lib/export/xlsx.ts`
- Test: `tests/unit/xlsx.test.ts`

**Interfaces:**
- Consumes: `zipStore`, `ZipEntry` from Task 2.
- Produces:
  - `interface SheetCell { v: string | number | null; fill?: string; bold?: boolean; align?: 'center' }` — `fill` is `RRGGBB`, no `#`.
  - `interface Sheet { name: string; cols: { width: number }[]; rows: SheetCell[][]; freezeRows: number }`
  - `writeXlsx(sheet: Sheet): Uint8Array`
  - `columnName(index0: number): string`, `sanitizeSheetName(raw: string): string`
  - Task 5 builds a `Sheet`; Task 6 calls `writeXlsx`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/xlsx.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { columnName, sanitizeSheetName, writeXlsx, type Sheet } from '../../src/lib/export/xlsx';

/** Reads back a STORE archive produced by zipStore — enough to assert on
 *  the XML we wrote without depending on an unzip binary. */
function readZip(z: Uint8Array): Map<string, string> {
	const dec = new TextDecoder();
	const u16 = (o: number) => z[o] | (z[o + 1] << 8);
	const u32 = (o: number) => (z[o] | (z[o + 1] << 8) | (z[o + 2] << 16) | (z[o + 3] << 24)) >>> 0;
	const eocd = z.length - 22;
	const out = new Map<string, string>();
	let p = u32(eocd + 16);
	for (let i = 0; i < u16(eocd + 10); i++) {
		const nameLen = u16(p + 28);
		const local = u32(p + 42);
		const size = u32(p + 24);
		const localNameLen = u16(local + 26);
		const start = local + 30 + localNameLen + u16(local + 28);
		out.set(
			dec.decode(z.subarray(local + 30, local + 30 + localNameLen)),
			dec.decode(z.subarray(start, start + size))
		);
		p += 46 + nameLen;
	}
	return out;
}

const sheet: Sheet = {
	name: 'Test',
	cols: [{ width: 4.5 }, { width: 20 }],
	rows: [
		[
			{ v: '시작', bold: true, fill: 'EFEFEF', align: 'center' },
			{ v: '장절', bold: true, fill: 'EFEFEF' }
		],
		[
			{ v: 3, fill: 'F5D14E', align: 'center' },
			{ v: '창세기 1 : 1 <&>' }
		],
		[{ v: null }, { v: '느헤미야 8 : 8' }]
	],
	freezeRows: 1
};

describe('columnName', () => {
	it('counts in spreadsheet base-26', () => {
		expect(columnName(0)).toBe('A');
		expect(columnName(25)).toBe('Z');
		expect(columnName(26)).toBe('AA');
		expect(columnName(27)).toBe('AB');
	});
});

describe('sanitizeSheetName', () => {
	it('keeps a normal title unchanged', () => {
		expect(sanitizeSheetName('2026 여름 암송 DAY')).toBe('2026 여름 암송 DAY');
	});

	it('strips the characters Excel rejects', () => {
		expect(sanitizeSheetName('a[b]c:d*e?f/g\\h')).toBe('a b c d e f g h');
	});

	it('truncates to 31 characters', () => {
		expect(sanitizeSheetName('x'.repeat(40))).toHaveLength(31);
	});

	it('falls back when nothing survives', () => {
		expect(sanitizeSheetName('///')).toBe('Sheet1');
	});
});

describe('writeXlsx', () => {
	const parts = readZip(writeXlsx(sheet));

	it('emits every part Excel requires', () => {
		expect([...parts.keys()].sort()).toEqual([
			'[Content_Types].xml',
			'_rels/.rels',
			'xl/_rels/workbook.xml.rels',
			'xl/styles.xml',
			'xl/workbook.xml',
			'xl/worksheets/sheet1.xml'
		]);
	});

	it('names the sheet', () => {
		expect(parts.get('xl/workbook.xml')).toContain('name="Test"');
	});

	it('writes column widths', () => {
		const xml = parts.get('xl/worksheets/sheet1.xml')!;
		expect(xml).toContain('<col min="1" max="1" width="4.5" customWidth="1"/>');
		expect(xml).toContain('<col min="2" max="2" width="20" customWidth="1"/>');
	});

	it('freezes the header row', () => {
		expect(parts.get('xl/worksheets/sheet1.xml')).toContain(
			'<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
		);
	});

	it('writes numbers as numbers and strings inline', () => {
		const xml = parts.get('xl/worksheets/sheet1.xml')!;
		expect(xml).toMatch(/<c r="A2"[^>]*><v>3<\/v><\/c>/);
		expect(xml).toContain('t="inlineStr"');
	});

	it('escapes XML metacharacters in cell text', () => {
		expect(parts.get('xl/worksheets/sheet1.xml')).toContain('창세기 1 : 1 &lt;&amp;&gt;');
	});

	// A null cell must be absent, not an empty <c> — an empty styled cell
	// would paint a fill on an unrated verse.
	it('omits null cells entirely', () => {
		expect(parts.get('xl/worksheets/sheet1.xml')).not.toContain('r="A3"');
		expect(parts.get('xl/worksheets/sheet1.xml')).toContain('r="B3"');
	});

	it('reserves Excel fill slots 0 and 1 before its own', () => {
		const xml = parts.get('xl/styles.xml')!;
		const fills = xml.slice(xml.indexOf('<fills'), xml.indexOf('</fills>'));
		expect(fills.indexOf('patternType="none"')).toBeLessThan(fills.indexOf('patternType="gray125"'));
		expect(fills.indexOf('patternType="gray125"')).toBeLessThan(fills.indexOf('FFEFEFEF'));
		expect(fills).toContain('<fgColor rgb="FFF5D14E"/>');
	});

	it('reuses one style record for identically styled cells', () => {
		const xml = parts.get('xl/styles.xml')!;
		const count = Number(/<cellXfs count="(\d+)"/.exec(xml)![1]);
		// Four distinct styles across six cells: the default (both plain
		// strings share it), bold+fill+centre, bold+fill, and fill+centre.
		expect(count).toBe(4);
		// Two user fills — the header grey and the level-3 yellow — on top of
		// the two reserved slots.
		expect(xml).toContain('<fills count="4">');
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/unit/xlsx.test.ts`
Expected: FAIL — cannot resolve `../../src/lib/export/xlsx`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/export/xlsx.ts`:

```ts
import { zipStore, type ZipEntry } from './zip';

/** `fill` is RRGGBB without '#'. A null `v` emits no cell at all. */
export interface SheetCell {
	v: string | number | null;
	fill?: string;
	bold?: boolean;
	align?: 'center';
}

export interface Sheet {
	name: string;
	cols: { width: number }[];
	rows: SheetCell[][];
	/** Rows held on screen while scrolling. 0 disables the frozen pane. */
	freezeRows: number;
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function xmlEscape(s: string): string {
	return s.replace(/[&<>"']/g, (c) =>
		c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&apos;'
	);
}

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

/** Excel rejects sheet names longer than 31 characters or containing any of
 *  []:*?/\ — it refuses to open the file rather than sanitizing for you. */
export function sanitizeSheetName(raw: string): string {
	const cleaned = raw
		.replace(/[[\]:*?/\\]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 31);
	return cleaned || 'Sheet1';
}

/** One <xf> per distinct (bold, fill, align) combination in the sheet. */
function styleKey(c: SheetCell): string {
	return `${c.bold ? 'b' : ''}|${c.fill ?? ''}|${c.align ?? ''}`;
}

const PLAIN = '||';

function buildStyles(rows: SheetCell[][]) {
	const userFills: string[] = [];
	const xfs: { bold: boolean; fillId: number; align?: 'center' }[] = [];
	const index = new Map<string, number>([[PLAIN, 0]]);

	for (const row of rows) {
		for (const c of row) {
			if (c.v === null) continue;
			const key = styleKey(c);
			if (index.has(key)) continue;
			let fillId = 0;
			if (c.fill) {
				let at = userFills.indexOf(c.fill);
				if (at === -1) at = userFills.push(c.fill) - 1;
				// Slots 0 and 1 are reserved by the format for 'none' and
				// 'gray125'; Excel misreads the table if they are displaced.
				fillId = at + 2;
			}
			index.set(key, xfs.length + 1);
			xfs.push({ bold: !!c.bold, fillId, align: c.align });
		}
	}

	const fillsXml = [
		'<fill><patternFill patternType="none"/></fill>',
		'<fill><patternFill patternType="gray125"/></fill>',
		...userFills.map(
			(f) =>
				`<fill><patternFill patternType="solid"><fgColor rgb="FF${f}"/><bgColor indexed="64"/></patternFill></fill>`
		)
	].join('');

	const xfsXml = [
		'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
		...xfs.map((x) => {
			const applyFill = x.fillId ? ' applyFill="1"' : '';
			const applyFont = x.bold ? ' applyFont="1"' : '';
			return x.align
				? `<xf numFmtId="0" fontId="${x.bold ? 1 : 0}" fillId="${x.fillId}" borderId="0" xfId="0"${applyFont}${applyFill} applyAlignment="1"><alignment horizontal="center"/></xf>`
				: `<xf numFmtId="0" fontId="${x.bold ? 1 : 0}" fillId="${x.fillId}" borderId="0" xfId="0"${applyFont}${applyFill}/>`;
		})
	].join('');

	const xml =
		`${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
		'<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
		'<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
		`<fills count="${userFills.length + 2}">${fillsXml}</fills>` +
		'<borders count="1"><border/></borders>' +
		'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
		`<cellXfs count="${xfs.length + 1}">${xfsXml}</cellXfs></styleSheet>`;

	return { xml, indexOf: (c: SheetCell) => index.get(styleKey(c)) ?? 0 };
}

function buildSheetXml(sheet: Sheet, styleIndex: (c: SheetCell) => number): string {
	const cols = sheet.cols
		.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`)
		.join('');

	const pane =
		sheet.freezeRows > 0
			? `<pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`
			: '';

	const rows = sheet.rows
		.map((row, r) => {
			const cells = row
				.map((c, i) => {
					if (c.v === null) return '';
					const ref = `${columnName(i)}${r + 1}`;
					const s = styleIndex(c);
					const sAttr = s === 0 ? '' : ` s="${s}"`;
					// Inline strings rather than a shared-string table: at this
					// row count the dedup would not pay for a seventh part.
					return typeof c.v === 'number'
						? `<c r="${ref}"${sAttr}><v>${c.v}</v></c>`
						: `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(c.v)}</t></is></c>`;
				})
				.join('');
			return `<row r="${r + 1}">${cells}</row>`;
		})
		.join('');

	return (
		`${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
		`<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
		`<cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`
	);
}

export function writeXlsx(sheet: Sheet): Uint8Array {
	const styles = buildStyles(sheet.rows);
	const enc = new TextEncoder();
	const part = (name: string, xml: string): ZipEntry => ({ name, bytes: enc.encode(xml) });

	return zipStore([
		part(
			'[Content_Types].xml',
			`${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
				'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
				'<Default Extension="xml" ContentType="application/xml"/>' +
				'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
				'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
				'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
				'</Types>'
		),
		part(
			'_rels/.rels',
			`${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
				'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
				'</Relationships>'
		),
		part(
			'xl/workbook.xml',
			`${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
				'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
				`<sheets><sheet name="${xmlEscape(sanitizeSheetName(sheet.name))}" sheetId="1" r:id="rId1"/></sheets></workbook>`
		),
		part(
			'xl/_rels/workbook.xml.rels',
			`${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
				'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
				'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
				'</Relationships>'
		),
		part('xl/styles.xml', styles.xml),
		part('xl/worksheets/sheet1.xml', buildSheetXml(sheet, styles.indexOf))
	]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/xlsx.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/export/xlsx.ts tests/unit/xlsx.test.ts
git commit -m "feat(export): add a minimal OOXML worksheet writer

Emits the six parts Excel needs for a single styled sheet: fills, column
widths, centre alignment, a frozen header row. The sheet model it accepts
carries no domain vocabulary, so the verse-specific logic can be a pure
function tested without XML in sight.

Fill slots 0 and 1 are reserved by the format for 'none' and 'gray125';
displacing them makes Excel misread the whole style table, so user fills
start at 2. Strings are written inline rather than through a shared-string
table — at 149 rows the dedup does not pay for a seventh part."
```

---

### Task 4: Widen the event range view model

**Files:**
- Modify: `src/lib/db/events.ts:93-98` (`RangeCardVM`), `src/lib/db/events.ts:125` (the `ranges.push` call)
- Test: `tests/unit/events.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `RangeCardVM` gains `packageId: string` and `verseNos: number[]`. Task 6 reads both.

- [ ] **Step 1: Update the existing assertion to expect the new fields**

`tests/unit/events.test.ts:174` currently asserts the whole range card with
`toEqual`, which is an exact match — widening the view model breaks it.
That is the assertion to change, not a new one to add alongside. Its
fixture is `5_krv` with verses `[1, 2]`.

Replace that block with:

```ts
		// The export button needs to name the verses it exports. They are
		// already resolved here for the progress count, so the card carries
		// them rather than making the UI re-parse them out of the href.
		expect(cards[0].ranges[0]).toEqual({
			label: '시편 23편',
			done: 1,
			total: 2,
			href: '/library/5_krv?sel=1%2C2',
			packageId: '5_krv',
			verseNos: [1, 2]
		});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/unit/events.test.ts`
Expected: FAIL — received object is missing `packageId` and `verseNos`.

- [ ] **Step 3: Widen the interface**

In `src/lib/db/events.ts`, change `RangeCardVM` to:

```ts
export interface RangeCardVM {
	label: string;
	done: number;
	total: number;
	href: string;
	/** Carried for the Excel export, which needs to name the verses it
	 *  exports. buildEventCards resolves these anyway for the progress
	 *  count; the alternative is re-parsing them out of `href`. */
	packageId: string;
	verseNos: number[];
}
```

- [ ] **Step 4: Populate the new fields**

In `buildEventCards`, change the `ranges.push(...)` call to:

```ts
				ranges.push({
					label: await rangeLabel(r, verseNos),
					done,
					total,
					href: rangeHref(r, verseNos),
					packageId: r.packageId,
					verseNos
				});
```

- [ ] **Step 5: Fix the typed fixture in `EventSection.test.ts`**

`tests/unit/EventSection.test.ts:10` declares a `const card: EventCardVM`,
so widening the interface makes it fail type-check. Change that line to:

```ts
	ranges: [
		{
			label: '시편 23편',
			done: 3,
			total: 5,
			href: '/library/60_krv?sel=1%2C2',
			packageId: '60_krv',
			verseNos: [1, 2]
		}
	]
```

- [ ] **Step 6: Run the full suite**

Run: `pnpm test && pnpm check`
Expected: all tests PASS; `pnpm check` reports **0 errors**. If any other
file constructs a `RangeCardVM`, it will surface here — fix it the same way.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/events.ts tests/unit/events.test.ts tests/unit/EventSection.test.ts
git commit -m "refactor(events): carry packageId and verseNos on RangeCardVM

The export button needs to name the verses it exports, and the view model
exposed only {label, done, total, href} — putting the numbers solely
inside an href query string. buildEventCards already resolves both for the
progress count and then discarded them."
```

---

### Task 5: Event sheet builder

**Files:**
- Create: `src/lib/export/eventWorkbook.ts`
- Test: `tests/unit/eventWorkbook.test.ts`

**Interfaces:**
- Consumes: `Sheet`, `SheetCell` (Task 3); `citationSortKey` (Task 1); `DifficultyLevel` from `$lib/db/verseRatings`.
- Produces:
  - `interface ExportVerse { packageAbbreviation: string; no: number; title: string; cite: string; body: string; startDifficulty: DifficultyLevel | null; fullDifficulty: DifficultyLevel | null }`
  - `interface ExportOptions { includeDifficulty: boolean; sortByScripture: boolean }`
  - `buildEventSheet(eventTitle: string, verses: ExportVerse[], options: ExportOptions): Sheet`
  - `DIFFICULTY_FILLS: Record<DifficultyLevel, string>`
  - Task 6 calls `buildEventSheet`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/eventWorkbook.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
	buildEventSheet,
	DIFFICULTY_FILLS,
	type ExportVerse
} from '../../src/lib/export/eventWorkbook';

function verse(over: Partial<ExportVerse> = {}): ExportVerse {
	return {
		packageAbbreviation: '900구절',
		no: 127,
		title: '양  육',
		cite: '출애굽기 18 : 20',
		body: '그들에게 율례와 법도를 가르쳐서',
		startDifficulty: null,
		fullDifficulty: null,
		...over
	};
}

const BOTH_OFF = { includeDifficulty: false, sortByScripture: false };
const DIFF_ON = { includeDifficulty: true, sortByScripture: false };

describe('buildEventSheet columns', () => {
	it('leads with the two difficulty columns when they are on', () => {
		const s = buildEventSheet('2026 여름 암송 DAY', [verse()], DIFF_ON);
		expect(s.rows[0].map((c) => c.v)).toEqual([
			'시작',
			'전체',
			'구분',
			'번호',
			'제목',
			'장절',
			'본문'
		]);
		expect(s.cols.map((c) => c.width)).toEqual([4.5, 4.5, 10, 6, 14, 18, 60]);
	});

	it('omits them entirely when they are off', () => {
		const s = buildEventSheet('t', [verse()], BOTH_OFF);
		expect(s.rows[0].map((c) => c.v)).toEqual(['구분', '번호', '제목', '장절', '본문']);
		expect(s.cols).toHaveLength(5);
	});

	it('freezes the header row and names the sheet after the event', () => {
		const s = buildEventSheet('2026 여름 암송 DAY', [verse()], BOTH_OFF);
		expect(s.freezeRows).toBe(1);
		expect(s.name).toBe('2026 여름 암송 DAY');
	});
});

describe('difficulty cells', () => {
	it('writes the level as a number with its fill', () => {
		const s = buildEventSheet('t', [verse({ startDifficulty: 1, fullDifficulty: 5 })], DIFF_ON);
		expect(s.rows[1][0]).toMatchObject({ v: 1, fill: DIFFICULTY_FILLS[1], align: 'center' });
		expect(s.rows[1][1]).toMatchObject({ v: 5, fill: DIFFICULTY_FILLS[5], align: 'center' });
	});

	// An unrated verse must be a truly empty cell — a fill here would read as
	// a rating the user never gave.
	it('leaves an unrated cell null and unfilled', () => {
		const s = buildEventSheet('t', [verse()], DIFF_ON);
		expect(s.rows[1][0].v).toBeNull();
		expect(s.rows[1][0].fill).toBeUndefined();
	});

	it('runs red at 1 through green at 5', () => {
		expect(DIFFICULTY_FILLS).toEqual({
			1: 'F4573F',
			2: 'F79A3E',
			3: 'F5D14E',
			4: 'A8CE5C',
			5: '5CB85C'
		});
	});
});

describe('sorting', () => {
	const rows = [
		verse({ no: 1, packageAbbreviation: '242구절', cite: '요한복음 3 : 16' }),
		verse({ no: 2, packageAbbreviation: '242구절', cite: '창세기 1 : 1' }),
		verse({ no: 3, packageAbbreviation: '900구절', cite: '창세기 1 : 27' }),
		verse({ no: 4, packageAbbreviation: '900구절', cite: '알수없는책 2 : 2' })
	];

	it('keeps input order by default', () => {
		const s = buildEventSheet('t', rows, BOTH_OFF);
		expect(s.rows.slice(1).map((r) => r[1].v)).toEqual([1, 2, 3, 4]);
	});

	it('orders by book, chapter, then verse when asked', () => {
		const s = buildEventSheet('t', rows, { includeDifficulty: false, sortByScripture: true });
		// 창세기 1:1, 창세기 1:27, 요한복음 3:16, then the unreadable one.
		expect(s.rows.slice(1).map((r) => r[1].v)).toEqual([2, 3, 1, 4]);
	});

	it('appends citations it cannot read rather than dropping them', () => {
		const s = buildEventSheet('t', rows, { includeDifficulty: false, sortByScripture: true });
		expect(s.rows).toHaveLength(5);
		expect(s.rows.at(-1)![3].v).toBe('알수없는책 2 : 2');
	});
});

describe('body rows', () => {
	it('writes the verse fields in column order', () => {
		const s = buildEventSheet('t', [verse()], BOTH_OFF);
		expect(s.rows[1].map((c) => c.v)).toEqual([
			'900구절',
			127,
			'양  육',
			'출애굽기 18 : 20',
			'그들에게 율례와 법도를 가르쳐서'
		]);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/unit/eventWorkbook.test.ts`
Expected: FAIL — cannot resolve `../../src/lib/export/eventWorkbook`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/export/eventWorkbook.ts`:

```ts
import { citationSortKey } from '$lib/bible/index';
import type { DifficultyLevel } from '$lib/db/verseRatings';
import type { Sheet, SheetCell } from './xlsx';

export interface ExportVerse {
	packageAbbreviation: string;
	no: number;
	title: string;
	cite: string;
	body: string;
	startDifficulty: DifficultyLevel | null;
	fullDifficulty: DifficultyLevel | null;
}

export interface ExportOptions {
	includeDifficulty: boolean;
	sortByScripture: boolean;
}

/**
 * Print-tuned ramp, 1 (hardest) → 5 (easiest).
 *
 * Deliberately NOT DIFFICULTY_COLORS from db/verseRatings: that ramp
 * (red–amber–grey–green–blue) is tuned for small dots on a canvas that may
 * be dark. These are backgrounds for black text on paper, so every tier
 * stays light enough to read against. Neither should be derived from the
 * other.
 */
export const DIFFICULTY_FILLS: Record<DifficultyLevel, string> = {
	1: 'F4573F',
	2: 'F79A3E',
	3: 'F5D14E',
	4: 'A8CE5C',
	5: '5CB85C'
};

const HEADER_FILL = 'EFEFEF';

const DIFFICULTY_COLUMNS = [
	{ header: '시작', width: 4.5 },
	{ header: '전체', width: 4.5 }
];

const BASE_COLUMNS = [
	{ header: '구분', width: 10 },
	{ header: '번호', width: 6 },
	{ header: '제목', width: 14 },
	{ header: '장절', width: 18 },
	{ header: '본문', width: 60 }
];

/**
 * Canonical scripture order, stable within ties. Verses whose citation
 * yields no key are appended in input order rather than dropped — no
 * shipped verse hits that path today, but silently losing a row would be
 * far worse than an out-of-place one.
 */
function sortByScripture(verses: ExportVerse[]): ExportVerse[] {
	const keyed = verses.map((v, i) => ({ v, i, key: citationSortKey(v.cite) }));
	const readable = keyed.filter((k) => k.key !== null);
	const rest = keyed.filter((k) => k.key === null);
	readable.sort(
		(a, b) =>
			a.key!.bookId - b.key!.bookId ||
			a.key!.chapter - b.key!.chapter ||
			a.key!.verse - b.key!.verse ||
			a.i - b.i
	);
	return [...readable, ...rest].map((k) => k.v);
}

function difficultyCell(level: DifficultyLevel | null): SheetCell {
	// null, not an empty string: an unrated verse must produce no cell at
	// all, so no fill can imply a rating the user never gave.
	if (level === null) return { v: null };
	return { v: level, fill: DIFFICULTY_FILLS[level], align: 'center' };
}

export function buildEventSheet(
	eventTitle: string,
	verses: ExportVerse[],
	options: ExportOptions
): Sheet {
	const columns = options.includeDifficulty
		? [...DIFFICULTY_COLUMNS, ...BASE_COLUMNS]
		: BASE_COLUMNS;

	const header: SheetCell[] = columns.map((c) => ({
		v: c.header,
		bold: true,
		fill: HEADER_FILL,
		align: c.width <= 6 ? 'center' : undefined
	}));

	const ordered = options.sortByScripture ? sortByScripture(verses) : verses;

	const body = ordered.map((v) => {
		const base: SheetCell[] = [
			{ v: v.packageAbbreviation },
			{ v: v.no, align: 'center' },
			{ v: v.title },
			{ v: v.cite },
			{ v: v.body }
		];
		return options.includeDifficulty
			? [difficultyCell(v.startDifficulty), difficultyCell(v.fullDifficulty), ...base]
			: base;
	});

	return {
		name: eventTitle,
		cols: columns.map((c) => ({ width: c.width })),
		rows: [header, ...body],
		freezeRows: 1
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/eventWorkbook.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/export/eventWorkbook.ts tests/unit/eventWorkbook.test.ts
git commit -m "feat(export): build the event sheet model from verses and ratings

A pure function: verses plus options in, a domain-free sheet model out. All
the decisions worth testing — column order, scripture sort, unrated cells,
the colour ramp — are reachable without touching XML or ZIP.

The difficulty columns lead the sheet because the file is meant to be
printed and scanned as a checklist. Their ramp is a separate constant from
the in-app DIFFICULTY_COLORS: these are backgrounds for black text on
paper, not dots on a dark-capable canvas."
```

---

### Task 6: Export orchestration and UI

**Files:**
- Create: `src/lib/export/eventExport.ts`
- Create: `src/lib/components/home/EventExportSheet.svelte`
- Modify: `src/lib/components/home/EventSection.svelte`
- Test: `tests/unit/eventExport.test.ts`, `tests/unit/EventExportSheet.test.ts`

**Interfaces:**
- Consumes: `RangeCardVM` (Task 4), `buildEventSheet` / `ExportVerse` / `ExportOptions` (Task 5), `writeXlsx` (Task 3).
- Produces: `collectEventVerses(ranges: RangeCardVM[]): Promise<ExportVerse[]>`, `exportFileName(eventTitle: string, dayKey: string): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/eventExport.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/local';
import { collectEventVerses, exportFileName } from '../../src/lib/export/eventExport';

beforeEach(async () => {
	await db.delete();
	await db.open();
	await db.packages.put({
		id: '900_krv',
		name: '무장 900구절',
		abbreviation: '900구절'
	} as never);
	await db.verses.bulkPut([
		{ package_id: '900_krv', no: 127, i: 127, title: '양  육', cite: '출애굽기 18 : 20', w: '본문1' },
		{ package_id: '900_krv', no: 128, i: 128, title: '양  육', cite: '신명기 6 : 7', w: '본문2' }
	] as never);
	await db.verseRatings.put({
		id: '900_krv:127',
		packageId: '900_krv',
		verseNo: 127,
		startDifficulty: 2,
		fullDifficulty: 4
	} as never);
});

describe('collectEventVerses', () => {
	const ranges = [
		{ label: '900구절', done: 0, total: 2, href: '', packageId: '900_krv', verseNos: [127, 128] }
	];

	it('resolves verses with their ratings', async () => {
		const out = await collectEventVerses(ranges);
		expect(out).toHaveLength(2);
		expect(out[0]).toMatchObject({
			packageAbbreviation: '900구절',
			no: 127,
			cite: '출애굽기 18 : 20',
			body: '본문1',
			startDifficulty: 2,
			fullDifficulty: 4
		});
	});

	it('reports null difficulty for an unrated verse', async () => {
		const out = await collectEventVerses(ranges);
		expect(out[1].startDifficulty).toBeNull();
		expect(out[1].fullDifficulty).toBeNull();
	});

	it('skips verse numbers with no matching row', async () => {
		const out = await collectEventVerses([{ ...ranges[0], verseNos: [127, 9999] }]);
		expect(out.map((v) => v.no)).toEqual([127]);
	});
});

describe('exportFileName', () => {
	it('joins the event title and the day', () => {
		expect(exportFileName('2026 여름 암송 DAY', '2026-08-10')).toBe(
			'2026 여름 암송 DAY-2026-08-10.xlsx'
		);
	});

	it('strips characters that are illegal in filenames', () => {
		expect(exportFileName('a/b:c*d', '2026-08-10')).toBe('a-b-c-d-2026-08-10.xlsx');
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/unit/eventExport.test.ts`
Expected: FAIL — cannot resolve `../../src/lib/export/eventExport`.

- [ ] **Step 3: Write the orchestration module**

Create `src/lib/export/eventExport.ts`:

```ts
import { db } from '$lib/db/local';
import type { RangeCardVM } from '$lib/db/events';
import type { DifficultyLevel } from '$lib/db/verseRatings';
import type { ExportVerse } from './eventWorkbook';

function isLevel(v: unknown): v is DifficultyLevel {
	return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
}

/**
 * Resolves an event's ranges into flat export rows.
 *
 * Ranges arrive already filtered — buildEventCards drops uninstalled
 * packages before the card is rendered — so anything here is installed.
 * Verse numbers with no matching row are skipped rather than emitted blank;
 * that only happens if a package was renumbered under the user.
 */
export async function collectEventVerses(ranges: RangeCardVM[]): Promise<ExportVerse[]> {
	const out: ExportVerse[] = [];
	for (const range of ranges) {
		// One bulk read per table per package, not per verse — the library
		// page resolves its rows the same way.
		const [pkg, verses, ratings] = await Promise.all([
			db.packages.get(range.packageId),
			db.verses.where('package_id').equals(range.packageId).toArray(),
			db.verseRatings.where('packageId').equals(range.packageId).toArray()
		]);
		const abbreviation = pkg?.abbreviation ?? range.packageId;
		const byNo = new Map(verses.map((v) => [v.no, v]));
		const ratingByNo = new Map(ratings.map((r) => [r.verseNo, r]));

		for (const no of range.verseNos) {
			const v = byNo.get(no);
			if (!v) continue;
			const rating = ratingByNo.get(no);
			out.push({
				packageAbbreviation: abbreviation,
				no: v.no,
				title: v.title,
				cite: v.cite,
				body: v.w,
				startDifficulty: isLevel(rating?.startDifficulty) ? rating.startDifficulty : null,
				fullDifficulty: isLevel(rating?.fullDifficulty) ? rating.fullDifficulty : null
			});
		}
	}
	return out;
}

/** Filename-illegal characters differ from the sheet-name set: this also has
 *  to survive Windows, which rejects " < > | as well. */
export function exportFileName(eventTitle: string, dayKey: string): string {
	const safe = eventTitle
		.replace(/[/\\:*?"<>|]/g, '-')
		.replace(/-+/g, '-')
		.trim();
	return `${safe}-${dayKey}.xlsx`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/eventExport.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the options sheet component test**

Create `tests/unit/EventExportSheet.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
// fireEvent, not user-event: the latter is not a dependency of this project
// and the no-new-dependencies constraint applies to devDependencies too.
// Every existing component test uses fireEvent — see BookmarkControl.test.ts.
import { fireEvent, render, screen } from '@testing-library/svelte';
import EventExportSheet from '../../src/lib/components/home/EventExportSheet.svelte';

const props = { eventTitle: '2026 여름 암송 DAY', busy: false };

describe('EventExportSheet', () => {
	it('defaults to difficulty on and scripture sort off', () => {
		render(EventExportSheet, { ...props, onConfirm: vi.fn(), onCancel: vi.fn() });
		expect(screen.getByLabelText(/난이도 열 포함/)).toBeChecked();
		expect(screen.getByLabelText(/장절 순서/)).not.toBeChecked();
	});

	it('reports the chosen options on confirm', async () => {
		const onConfirm = vi.fn();
		render(EventExportSheet, { ...props, onConfirm, onCancel: vi.fn() });
		await fireEvent.click(screen.getByLabelText(/장절 순서/));
		await fireEvent.click(screen.getByRole('button', { name: '다운로드' }));
		expect(onConfirm).toHaveBeenCalledWith({
			includeDifficulty: true,
			sortByScripture: true
		});
	});

	it('disables the confirm button while a download is running', () => {
		render(EventExportSheet, { ...props, busy: true, onConfirm: vi.fn(), onCancel: vi.fn() });
		expect(screen.getByRole('button', { name: /다운로드/ })).toBeDisabled();
	});
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm vitest run tests/unit/EventExportSheet.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 7: Write the component**

Create `src/lib/components/home/EventExportSheet.svelte`. Match the bottom-sheet styling of the existing selection bar in `src/routes/library/[packageId]/+page.svelte` (rounded-2xl, `var(--color-card)`, `shadow-lg`) and the confirm-button styling from `ConfirmDialog.svelte`:

```svelte
<script lang="ts">
	import type { ExportOptions } from '$lib/export/eventWorkbook';

	interface Props {
		eventTitle: string;
		busy: boolean;
		onConfirm: (options: ExportOptions) => void;
		onCancel: () => void;
	}
	let { eventTitle, busy, onConfirm, onCancel }: Props = $props();

	// Difficulty on by default: it is the reason the export exists. Scripture
	// sort off by default so the file opens in the same order as the app.
	let includeDifficulty = $state(true);
	let sortByScripture = $state(false);
</script>

<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/30 px-5 pb-5">
	<button type="button" class="absolute inset-0" aria-label="닫기" onclick={onCancel}></button>
	<div
		class="relative w-full max-w-2xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4 shadow-lg"
		role="dialog"
		aria-label="{eventTitle} 엑셀 다운로드"
	>
		<h2 class="text-[15px] font-semibold text-[var(--color-text)]">엑셀로 다운로드</h2>
		<p class="mt-1 text-[12px] text-[var(--color-text-secondary)]">{eventTitle}</p>

		<label class="mt-4 flex items-center gap-2.5 text-[14px] text-[var(--color-text)]">
			<input type="checkbox" bind:checked={includeDifficulty} class="h-4 w-4 accent-[var(--color-accent)]" />
			난이도 열 포함 (시작 · 전체)
		</label>
		<label class="mt-2.5 flex items-center gap-2.5 text-[14px] text-[var(--color-text)]">
			<input type="checkbox" bind:checked={sortByScripture} class="h-4 w-4 accent-[var(--color-accent)]" />
			장절 순서로 정렬
		</label>

		<div class="mt-5 flex items-center justify-end gap-2">
			<button
				type="button"
				onclick={onCancel}
				class="rounded-full px-4 py-1.5 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-elevated)]"
			>
				취소
			</button>
			<button
				type="button"
				disabled={busy}
				onclick={() => onConfirm({ includeDifficulty, sortByScripture })}
				class="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{busy ? '만드는 중…' : '다운로드'}
			</button>
		</div>
	</div>
</div>
```

- [ ] **Step 8: Run to verify it passes**

Run: `pnpm vitest run tests/unit/EventExportSheet.test.ts`
Expected: PASS.

- [ ] **Step 9: Wire the trigger into `EventSection.svelte`**

Add to the `<script>` block:

```ts
	import { Download } from 'lucide-svelte';
	import EventExportSheet from './EventExportSheet.svelte';
	import { collectEventVerses, exportFileName } from '$lib/export/eventExport';
	import { buildEventSheet, type ExportOptions } from '$lib/export/eventWorkbook';
	import { writeXlsx } from '$lib/export/xlsx';
	import { todayLocalKey } from '$lib/db/activity';

	let exporting = $state<EventCardVM | null>(null);
	let busy = $state(false);

	async function runExport(ev: EventCardVM, options: ExportOptions) {
		busy = true;
		try {
			const verses = await collectEventVerses(ev.ranges);
			// An empty workbook would look like a successful export of nothing.
			if (verses.length === 0) {
				onEmpty?.();
				return;
			}
			const bytes = writeXlsx(buildEventSheet(ev.eventTitle, verses, options));
			const url = URL.createObjectURL(
				new Blob([bytes], {
					type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
				})
			);
			const a = document.createElement('a');
			a.href = url;
			a.download = exportFileName(ev.eventTitle, todayLocalKey());
			a.click();
			URL.revokeObjectURL(url);
			exporting = null;
		} finally {
			busy = false;
		}
	}
```

Extend `Props` with `onEmpty?: () => void` so the page can raise a toast, and add the button to the header row, immediately before the D-day badge:

```svelte
					<button
						type="button"
						onclick={() => (exporting = ev)}
						aria-label="{ev.eventTitle} 엑셀로 다운로드"
						class="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
					>
						<Download size={15} strokeWidth={1.75} />
					</button>
```

At the end of the `{#each}` body, render the sheet:

```svelte
				{#if exporting?.eventId === ev.eventId}
					<EventExportSheet
						eventTitle={ev.eventTitle}
						{busy}
						onConfirm={(options) => runExport(ev, options)}
						onCancel={() => (exporting = null)}
					/>
				{/if}
```

In `src/routes/+page.svelte`, pass the handler:

```svelte
	<EventSection events={eventCards} onEmpty={() => (toast = { message: '내보낼 구절이 없습니다' })} />
```

- [ ] **Step 10: Run the full suite and type check**

Run: `pnpm test && pnpm check`
Expected: all tests PASS; `pnpm check` reports **0 errors**.

- [ ] **Step 11: Manual verification — required, cannot be automated**

```bash
pnpm dev
```

Open `http://localhost:5173/`, tap the download icon on the event header, confirm with both checkboxes on. Then:

1. Open the file in **Excel** and in **Numbers**. Neither may offer to repair it. This is the one risk a hand-rolled OOXML writer carries that unit tests cannot retire.
2. Difficulty columns are the two leftmost, narrow, centred, coloured red→green by level; unrated cells are blank and uncoloured.
3. The header row stays visible while scrolling.
4. With 장절 순서 on, rows run 창세기 → 요한계시록 and the two packages interleave.

- [ ] **Step 12: Commit**

```bash
git add src/lib/export/eventExport.ts src/lib/components/home/EventExportSheet.svelte src/lib/components/home/EventSection.svelte src/routes/+page.svelte tests/unit/eventExport.test.ts tests/unit/EventExportSheet.test.ts
git commit -m "feat(home): download the event's verses as an Excel file

A download icon on the event header opens a sheet with two choices —
difficulty columns (on by default, since they are the point) and canonical
scripture ordering (off, so the file matches the app's order).

Verses and ratings are read one bulk query per table per package rather
than per verse. An event that resolves to no verses raises a toast instead
of downloading an empty workbook, which would look like a successful
export of nothing."
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| Download button on event header | 6 |
| Two checkboxes, stated defaults | 6 |
| Sheet layout, widths, alignment, frozen header | 3 (mechanism), 5 (values) |
| Sheet-name sanitizing | 3 |
| `구분` = package abbreviation | 5, 6 |
| Difficulty cells: number + fill, unrated blank | 5 |
| Colour ramp separate from `DIFFICULTY_COLORS` | 5 |
| `citationSortKey`, `parsePassageRef` untouched | 1 |
| Stable sort, keyless citations appended | 5 |
| `느헤미야` alias, two data typos | 1 |
| 1495-citation guard test | 1 |
| Hand-rolled writer, no new dependency | 2, 3 + Global Constraints |
| Six OOXML parts, inline strings, STORE | 2, 3 |
| `RangeCardVM` widened | 4 |
| Data flow, bulk reads, blob download | 6 |
| Empty-result toast | 6 |
| Uninstalled package skipped | 6 (already filtered upstream — noted in the module comment) |
| Testing table | 1, 2, 3, 5, 6 |
| Manual Excel/Numbers open | 6 Step 11 |

No gaps.

**Placeholders:** none — every code step carries the code.

**Type consistency:** `SheetCell` / `Sheet` defined in Task 3 and consumed unchanged in Task 5. `ExportVerse` / `ExportOptions` defined in Task 5, consumed in Task 6. `RangeCardVM` widened in Task 4 and consumed in Task 6. `citationSortKey` defined in Task 1, consumed in Task 5. `DifficultyLevel` imported from the existing `$lib/db/verseRatings` throughout.

**Note on Task 6 fixtures:** Task 4 Step 5 warns that `EventSection.test.ts` fixtures may need the two new `RangeCardVM` fields. Do that there, not in Task 6.
