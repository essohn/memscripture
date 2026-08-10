# 암송 DAY Excel Export — Design

**Status:** Approved (2026-08-10) · single-phase delivery.

## Problem

The home dashboard shows an active memorization event ("2026 여름 암송
DAY") as a set of range cards. A user preparing for the event has no way
to take the verse list off the device — to print a checklist, to study
away from the phone, or to hand the list to someone else.

This spec adds a **download button on the event header** that produces a
single `.xlsx` file containing every verse in the event, with two opt-in
formatting choices.

## Non-Goals

- **CSV.** Cannot carry background colors, which the difficulty columns
  require. A colorless list is not what was asked for.
- **Per-range downloads.** The unit is the event. Splitting per range was
  considered and rejected: it forces two downloads and a manual merge for
  the common case (the whole event).
- **Editing / re-import.** Export is one-way. Nothing reads the file back.
- **Other events.** The button exports the event it sits on. There is no
  event picker.

## User-facing behavior

A download icon sits in the event section header, beside the D-day badge.
Tapping it opens a sheet with two checkboxes and a confirm button:

- **☑ 난이도 열 포함 (시작 · 전체)** — default **on**
- **☐ 장절 순서로 정렬** — default **off**

Confirming downloads `<event title>-<YYYY-MM-DD>.xlsx`.

## Sheet layout

One worksheet, named after the event. Header row is bold on a light grey
fill and frozen, so it stays visible while scrolling 149 rows.

Excel constrains sheet names: 31 characters maximum, and none of
`[ ] : * ? / \`. The event title is sanitized against both before use —
"2026 여름 암송 DAY" passes untouched, but the rule belongs in code rather
than in an assumption about which events exist. An empty result after
sanitizing falls back to `Sheet1`.

`구분` holds the package abbreviation (`PackageMeta.abbreviation`, e.g.
"900구절"), falling back to the package id when absent — not the range
label ("900구절 127–162"), which repeats the range bounds on all 149 rows
and does not fit a 10-wide column.

Columns, left to right. The two difficulty columns lead deliberately: the
file is meant to be printed and scanned as a checklist, and difficulty is
what the reader looks for first.

| 시작 | 전체 | 구분 | 번호 | 제목 | 장절 | 본문 |
|------|------|------|------|------|------|------|
| 4.5  | 4.5  | 10   | 6    | 14   | 18   | 60   |

`시작`/`전체`/`번호` are centered; the rest are left-aligned. When the
difficulty option is off, both columns are omitted entirely and the sheet
starts at `구분` — they are not emitted blank.

### Difficulty cells

The cell holds the bare number 1–5. A number, not a label: it survives
black-and-white printing, keeps the column narrow, and stays sortable and
averageable in Excel.

The colour is **conditional formatting over both columns**, not a fill on
each cell. Static fills go stale the moment the reader retypes a level in
the spreadsheet — the number would say 1 while the cell stayed green. Five
`cellIs equal` rules over the body range of columns A:B mean the colour
follows the value instead.

| 1 | 2 | 3 | 4 | 5 | unrated |
|---|---|---|---|---|---------|
| `#F4573F` | `#F79A3E` | `#F5D14E` | `#A8CE5C` | `#5CB85C` | empty cell, matches no rule |

Discrete `cellIs` rules rather than a three-colour scale: a scale
interpolates its midpoints and would not reproduce these five exact
colours. Cell fills remain in use elsewhere — the header's grey is fixed
formatting, since nothing about it depends on a value.

Two OOXML details this depends on, both easy to get wrong silently:

- A `dxf`'s solid fill paints from **`bgColor`**, the opposite of a cell
  style's `fgColor`. With `fgColor` the rules match and paint nothing.
- `dxfs` follows `cellXfs` and `cellStyles` in the `CT_Stylesheet`
  sequence, and `conditionalFormatting` follows `sheetData` in
  `CT_Worksheet`. Out of order, Excel rejects the part.

Text stays black on every tier, so each fill must stay light enough to
read against. This ramp is **intentionally different** from the in-app
`DIFFICULTY_COLORS` (red–amber–grey–green–blue), which is tuned for small
dots on a dark-capable canvas rather than for print. The two palettes are
separate constants; neither should be derived from the other.

## Sorting

Default order is the app's own: `구분` (package, in event-range order),
then `번호` ascending.

With 장절 정렬 on, rows sort by canonical scripture order —
`(bookId, chapter, verse)` — deliberately interleaving the two ranges,
which is the point: 창세기 → 계시록 across the whole event.

Sorting uses a **new, separate** `citationSortKey(cite)` in
`src/lib/bible/index.ts`, not the existing `parsePassageRef()`:

```ts
citationSortKey('고린도전서 12 : 4∼6') // → { bookId: 46, chapter: 12, verse: 4 }
citationSortKey('요한복음 1 : 1,14')   // → { bookId: 43, chapter: 1, verse: 1 }
citationSortKey('역대하 16 : 9상')     // → { bookId: 14, chapter: 16, verse: 9 }
```

`parsePassageRef()` is left untouched. It exists to resolve a reference
for fetching verse text in the OYO autofill flow, and it rejects 30 of the
1495 shipped citations because they use conventions its `{startVerse,
endVerse}` model cannot represent honestly — `1 : 1,14` means verses 1
*and* 14, not the range 1–14. Widening it would change what OYO autofill
fetches. Sorting needs only the first verse number, so it gets its own
lenient reader: tolerate `-`, `~`, `∼`, `,`, and the 상/하 suffixes, and
take the leading verse.

Ties fall back to input order, so the sort is stable.

**Verses whose citation yields no key are appended at the end** in default
order rather than dropped. With the rules above no shipped verse hits this
path today; it exists so future bad data surfaces instead of vanishing.

## Data corrections

All 1495 citations across every shipped package were checked against the
existing parser. 32 fail, but only 2 are defects — the rest are ordinary
Korean citation conventions the parser does not accept, and are handled by
`citationSortKey` above rather than by editing data.

| cause | count | verdict |
|-------|-------|---------|
| `∼` / `~` as the range separator (`12 : 4∼6`) | 22 | valid — reader must accept |
| comma-separated verses (`1 : 1,14`) | 6 | valid — reader must accept |
| `느헤미야` not in the book table | 4 | vocabulary gap — add alias |
| 상/하 suffix (`16 : 9상`) | 3 | valid — reader must accept |
| `고리도전서` | 1 | **data typo** |
| `잠엄` | 1 | **data typo** |

**Vocabulary gap** — `BOOK_FULL_NAMES` lists only `느헤미아`, so
`느헤미야` (4 verses in `900_krv`) does not resolve. The data uses **both**
spellings: `242_krv` no.103 is `느헤미아`. So `느헤미야` is added as an
accepted **alias**, not a replacement — swapping the table entry would
break the 242 verse instead.

**Data typos** — `static/data/900_krv.json`:

| no. | current | correct |
|-----|---------|---------|
| 335 | `고리도전서 14 : 20` | `고린도전서 14 : 20` |
| 512 | `잠엄 10 : 4-5` | `잠언 10 : 4-5` |

These two are user-visible today: `cite` renders on every verse card, so
the misspellings are on screen regardless of this feature.

A guard test asserts `citationSortKey` returns a key for every `cite` in
every shipped package — all 1495 rows, verified to pass under the rules
above. Future data or vocabulary drift then fails the suite instead of
silently sorting to the tail.

## Architecture

Three layers, each knowing only the one below it. The split exists so the
domain logic — which is where the interesting decisions live — can be
tested as a pure function, with no ZIP or XML in sight.

| Module | Knows | Does not know |
|--------|-------|---------------|
| `src/lib/export/zip.ts` | ZIP container: STORE entries, CRC32, central directory | Excel, verses |
| `src/lib/export/xlsx.ts` | OOXML; consumes a generic sheet model | Verses, events |
| `src/lib/export/eventWorkbook.ts` | Verses, ratings, options → sheet model | ZIP, XML |
| `src/lib/components/home/EventExportSheet.svelte` | The options UI | File generation |

The trigger — a download icon button — goes in the existing
`EventSection.svelte` header row, beside the D-day badge.

`RangeCardVM` must gain `packageId` and `verseNos`. It currently exposes
only `{label, done, total, href}`, so the component has no way to name the
verses it would export — the numbers are encoded inside the `href` query
string, and parsing them back out would be absurd. `buildEventCards()`
already computes both (`r.packageId`, and `verseNos` from
`resolveRangeVerseNos`) and then discards them; widening the view model is
a two-line change and avoids a second resolve pass at download time.

The model `xlsx.ts` accepts carries no domain vocabulary:

```ts
interface SheetCell {
  v: string | number | null;
  fill?: string;      // 'F4573F' — RGB, no '#'
  bold?: boolean;
  align?: 'center';
}
interface Sheet {
  name: string;
  cols: { width: number }[];
  rows: SheetCell[][];
  freezeRows: number;
}
```

### Why a hand-rolled writer

The app ships 309 KB of JS (103 KB gzipped). ExcelJS would add roughly
280 KB gzipped — tripling the bundle to render one 149-row table — and an
offline-first PWA would have to cache it for the button to work offline.
SheetJS's community build is understood not to write cell styles at all
(a Pro feature), which rules it out for the colored columns; the
`xlsx-js-style` fork restores them at similar weight.

An `.xlsx` is a ZIP of six small XML parts, and the feature set needed
here is fixed and narrow: solid fills, column widths, alignment, one
frozen row. Writing it directly costs ~250 lines and about 3 KB of
bundle, and the output is directly assertable in tests.

The real risk is OOXML correctness — a malformed part makes Excel offer
to "repair" the file. That is covered by tests plus one manual open, not
by tests alone.

### Files produced

```
[Content_Types].xml
_rels/.rels
xl/workbook.xml
xl/_rels/workbook.xml.rels
xl/styles.xml
xl/worksheets/sheet1.xml
```

Strings are written inline (`t="inlineStr"`) rather than through a shared
string table. At 149 rows the deduplication is not worth a seventh part
and a second pass.

ZIP entries use STORE (no compression). The resulting file is larger than
a deflated one but well under any size that matters here, and it removes
a compression dependency entirely.

## Data flow

1. Read the verse numbers straight off the widened `RangeCardVM` — they
   were already resolved for the card, and `resolveRangeVerseNos()`
   already skipped uninstalled packages there.
2. Load each referenced package once via `loadPackageData()`.
3. Bulk-read `verseRatings` per package — one query each, matching the
   library page, rather than one per verse.
4. `buildEventSheet(verses, ratings, options)` → `Sheet`.
5. `writeXlsx(sheet)` → `Uint8Array`.
6. `Blob` → `createObjectURL` → `a.download` → `revokeObjectURL`, the
   same shape as the existing OYO backup download.

## Error handling

- **Uninstalled package** — its range is skipped, mirroring how the home
  cards already render. The rest of the event still exports.
- **Nothing resolved** — no file is produced; a toast explains why. An
  empty spreadsheet would look like a successful export of nothing.
- **Unparseable citation** — never fatal. Sorted to the tail (above).
- **Unrated verse** — empty cell with no fill, distinct from a rating.

## Testing

| Target | What is asserted |
|--------|------------------|
| `zip.ts` | CRC32 against known vectors; local header and central-directory offsets of a multi-entry archive |
| `xlsx.ts` | Generated parts re-read: cell addresses, style indices, column widths, freeze pane |
| `eventWorkbook.ts` | Sort order both ways; keyless cite lands last; unrated cell empty; 1–5 → fill mapping; difficulty columns absent when off |
| `bible` | `citationSortKey` handles `-` `~` `∼` `,` and 상/하; `느헤미아` and `느헤미야` both resolve; all 1495 shipped citations yield a key |

One **manual check**, not automated: open the produced file in Excel and
in Numbers and confirm neither offers to repair it. This is the one risk
the hand-rolled approach carries that unit tests cannot retire.

## Open questions

None.
