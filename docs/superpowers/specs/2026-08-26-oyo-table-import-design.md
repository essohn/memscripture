# 표로 구절 가져오기 (Table Import) — Design Spec

**Date:** 2026-08-26
**Status:** Draft → User review
**Scope:** New `oyo/cite.ts`, `oyo/tableText.ts`, `oyo/tableParse.ts`, `oyo/tableColumns.ts`, `oyo/autofill.ts`, `utils/columnName.ts`, new `components/oyo/VerseReviewList.svelte`, `components/oyo/ColumnMapper.svelte`, new route `routes/oyo/import/table/+page.svelte`. Modifies `oyo/importLink.ts`, `export/xlsx.ts`, `routes/oyo/import/+page.svelte`, `routes/library/oyo/+page.svelte`.

## Goal

Adding a verse to 나의 구절(OYO) is one card at a time: open the sheet, type 장절, wait for the body to autofill, name it, save. A leader handing out a year's memorization plan, or a reader migrating a list they already keep in a spreadsheet, has thirty or eighty of those to do.

This adds a second door. Hand the app a table — a CSV file, or cells copied straight out of Excel or Google Sheets — and it becomes a reviewed batch of OYO verses.

The table may carry only 장절. Everything else the app can supply: 본문 comes from the same KRV lookup `VerseEditSheet` already uses, and 제목 is optional by design — an unnamed verse shows its citation where the title goes.

## Non-goals

- **Reading `.xlsx` binaries.** `export/zip.ts` writes STORE-only entries because writing needs no compression; Excel always DEFLATEs, so reading a real workbook means a zip central-directory reader, `DecompressionStream('deflate-raw')`, and a `sharedStrings.xml` parser — a new subsystem serving a user who can reach the same place with 복사 → 붙여넣기. The picker rejects `.xlsx` with a message that points at those two routes. Revisit if paste proves insufficient in practice.
- **Editing 본문 on the review screen.** The screen settles 제목 and which rows to keep. A body that came out wrong is repaired in 나의 구절, where the edit sheet already does that job.
- **Importing into packages other than OYO.** Published packages are read-only content; OYO is the user's own notebook.
- **Writing tables.** This reads them. `db/oyoBackup.ts` owns export, in a format that survives a restore exactly.
- **Tags, difficulty, bookmarks, or order from the table.** Verses only. Imported rows get `no` from `createOyoVerse` in table order.

## User Experience

### Entry point

`/library/oyo`'s 가져오기 (`FolderInput`) button opens a file picker for a JSON backup today. It becomes a two-item menu, because there are now two unrelated things called "가져오기" and a button cannot mean both:

```
┌────────────────────────────────┐
│  표에서 가져오기                │  → /oyo/import/table
│  CSV · 엑셀 붙여넣기            │
├────────────────────────────────┤
│  백업에서 복원                  │  → 기존 JSON 파일 선택 (동작 그대로)
│  JSON                          │
└────────────────────────────────┘
```

The menu closes on selection, on Escape, and on a click outside. 백업에서 복원 keeps the existing `fileInputEl` click and `onFileChosen` handler untouched.

### The table screen — picking

```
표에서 가져오기                                    ← Header, onBack → /library/oyo

┌─────────────────────────────────────────────┐
│                                             │
│           CSV 파일 선택                      │
│      .csv · .tsv · .txt · 2MB까지            │
│                                             │
└─────────────────────────────────────────────┘

또는 엑셀·구글시트에서 셀을 복사해 붙여넣으세요

┌─────────────────────────────────────────────┐
│                                             │
│                                             │
└─────────────────────────────────────────────┘
                                    [ 표 읽기 ]
```

A file pick parses immediately — choosing a file is already an explicit confirming gesture. The textarea does not: it waits for 표 읽기 (disabled while empty), so a half-finished paste never yanks the reader onto another screen.

Errors here render inline, under whichever control produced them, and the screen stays put. That differs from the deeplink screen's terminal `failed` state on purpose: a bad link cannot be fixed where it is displayed, but a bad file can be — the next file is one tap away.

### The table screen — confirming the columns

Detection decides everything it can — which column holds 장절, which holds 제목, which holds 본문, and whether the first row is a header — and then shows its work and asks.

```
이렇게 읽었습니다. 맞나요?

  장절   [ A · 장절         ▾ ]
  제목   [ C · 제목         ▾ ]
  본문   [ D · 내용         ▾ ]
  ☑ 첫 행은 제목 줄

미리보기
  요한복음 3 : 16  · 사랑 · 하나님이 세상을 이처럼 사랑하사…
  로마서 8 : 28   · 소망 · (성경에서 가져옵니다)
  시편 23 : 1     · —    · (성경에서 가져옵니다)

구절 24개 · 본문 없는 12개는 성경에서 가져옵니다

              [ 맞아요, 계속 ]
```

**This screen makes no network requests.** Every control on it is pure computation over the grid already in memory: changing a `<select>` or the checkbox re-derives the drafts and repaints the preview instantly. The body fill — the only expensive thing this feature does — starts when 맞아요, 계속 is tapped, and so it never runs against columns the reader has not agreed to.

- Each `<select>` lists every column as `A · <헤더 또는 첫 행 값>`. 제목 and 본문 also offer 없음. 장절 does not: without it there is nothing to import, and detection always names one.
- 첫 행은 제목 줄 reflects what detection decided and can be overturned. Unchecking it turns a row the app took for a header back into a verse.
- The preview shows the first three derived rows, each as `장절 · 제목 · 본문`. A row whose body is empty reads (성경에서 가져옵니다) — a promise about step two, not a value. A missing title reads —.
- The summary line counts what will be imported and how many bodies will be fetched. It also carries 앞 200개만 가져옵니다 when the table was truncated.
- 맞아요, 계속 is disabled when the current mapping yields no rows, and the summary reads 이 설정으로는 가져올 구절이 없습니다. The reader fixes it here rather than being sent back to the file picker.

### The table screen — review

```
구절 24개                    본문 불러오는 중 7/12
                                    [전체 해제]

 ☑  [제목_____________]
    요한복음 3 : 16
    하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니…

 ☑  [소망______________]
    로마서 8 : 28
    불러오는 중…

 ☐  [제목_____________]                      이미 있음
    창세기 12 : 1
    여호와께서 아브람에게 이르시되…

 ☐  [제목_____________]              본문 없음 · 건너뜁니다
    토비트 3 : 1
                                          [ 다시 시도 ]

        [ 나의 구절에 담기 (22) ]
```

- The row list, the 전체 선택/해제 control, the per-row 제목 input, the 이미 있음 badge and the save button behave exactly as on the deeplink screen — they are the same component.
- Back from here returns to the confirm screen rather than leaving, so a mapping mistake spotted while reading the bodies is one tap from being fixed. Going back aborts any fill in flight; re-confirming re-runs it, and the chapter cache makes everything already fetched free the second time.
- 본문 불러오는 중 n/m appears only while a fill is running. The save button is disabled for its duration.
- A row that ends with no body is dimmed, its checkbox disabled, and it is removed from the selection. The 다시 시도 button appears whenever at least one row is in that state and no fill is running; it re-runs the fill over the whole list, which touches only the rows still missing a body.

### Saved

Identical to the deeplink screen: a check, `{n}개 구절을 나의 구절에 담았습니다`, and a 나의 구절 보기 link.

## Architecture

```
파일 선택  또는  표 붙여넣기(textarea + 표 읽기)
      │
      ├─ 파일이면: decodeTableFile(bytes)
      │     UTF-8 strict → 실패 시 EUC-KR → BOM 제거
      ▼  텍스트
parseDelimited(text)  ─────────────────▶  string[][]
      ▼
detectColumns(grid)  ──────────────────▶  { hasHeader, labels, mapping }
      ▼                                    ▲
applyMapping(grid, hasHeader, mapping) ─▶  { drafts, truncated }
      ▼                                    │ ColumnMapper가 덮어쓰면
   〈확인 화면 · 네트워크 0회〉  ────────────┘ 여기까지 즉시 다시 계산
      │  [맞아요, 계속]
      ▼
duplicateIndexes(drafts, 기존 cite)  ───▶  "이미 있음"
      ▼
fillMissingBodies(drafts, onProgress) ─▶  행별 RowStatus
      ▼
VerseReviewList  ──────────────────────▶  createOyoVerse 순차 저장
```

The confirm gate is load-bearing, not decorative. Everything above it is pure and instant, so the mapper can be edited freely; everything below it costs network and time, so it runs once, against columns a person has agreed to.

### `src/lib/oyo/cite.ts` — new

`normalizeCite`, `duplicateIndexes` and `MAX_IMPORT_VERSES` move here verbatim from `importLink.ts`, which then imports them. They were never link-specific: normalising a citation and spotting one the reader already has are what *any* import door needs. `importLink.ts` keeps the protocol — the base64 envelope, the version check, `buildImportLink`.

One signature change on the way: `duplicateIndexes` loses its dependency on `ImportVerse` and takes `readonly { cite: string }[]`. Keeping the concrete type would make `cite.ts` import from `importLink.ts` while `importLink.ts` imports from `cite.ts`.

`MAX_IMPORT_VERSES` (200) stays a single constant shared by both doors. It reads as "the most verses one import may carry", which is as true of a pasted table as of a tapped link.

### `src/lib/oyo/tableText.ts` — new

```ts
export interface DecodedTable {
	text: string;
	encoding: 'utf-8' | 'euc-kr';
}

/** Throws `TableFileError` with a `kind` the screen can turn into a message. */
export function decodeTableFile(bytes: Uint8Array): DecodedTable;
```

Korean Excel's plain "CSV 저장" writes CP949, not UTF-8, and `File.text()` assumes UTF-8 — which turns 요한복음 into mojibake with no error anywhere. So: decode with `new TextDecoder('utf-8', { fatal: true })` and fall back to `new TextDecoder('euc-kr')` when it throws. Both labels are required by the Encoding Standard, so this costs no dependency. A UTF-8 BOM is stripped after decoding.

The `encoding` field exists for the tests, not the UI; nothing on screen mentions it.

`TableFileError` kinds:

| kind | raised when |
|---|---|
| `too-large` | more than 2 MB |
| `xlsx` | bytes begin `50 4B 03 04` (a zip — almost always a picked `.xlsx`) |
| `empty` | zero bytes, or nothing but whitespace after decoding |

`xlsx` earns its own kind because it is the most likely wrong file and the most fixable: the message names both ways out (셀 복사 → 붙여넣기, 또는 CSV로 저장).

### `src/lib/oyo/tableParse.ts` — new

```ts
export function parseDelimited(text: string): string[][];
export function detectDelimiter(text: string): ',' | '\t';
```

RFC 4180 quoting, because bodies are full of commas: `"…"` wraps a field, `""` is a literal quote inside one, and a quoted field may contain newlines. CRLF, CR and LF all end a row. Rows that are entirely empty are dropped. Every cell is squeezed through the same `\s+ → ' '` + trim rule the deeplink parser uses, so a verse looks the same whichever door it came through.

`detectDelimiter` counts tabs and commas outside quotes across the first five rows and picks tab when tabs win. Spreadsheet clipboard data is always tab-separated, so a paste resolves correctly without asking.

### `src/lib/oyo/tableColumns.ts` — new

```ts
export interface ColumnMapping {
	cite: number;
	title: number | null;
	w: number | null;
}

export interface DetectedColumns {
	hasHeader: boolean;
	/** Header cells when hasHeader, else the first row's values — either way,
	 *  what the mapper shows next to each column letter. */
	labels: string[];
	/** Always present. Rule 4 below guarantees a citation column even when
	 *  every stronger signal is silent, and the confirm screen is where a
	 *  wrong guess gets corrected. */
	mapping: ColumnMapping;
}

export interface TableDraft {
	/** 1-based row number in the source table. */
	row: number;
	cite: string;
	title: string;
	w: string;
}

export function detectColumns(grid: string[][]): DetectedColumns;
export function applyMapping(
	grid: string[][],
	hasHeader: boolean,
	mapping: ColumnMapping
): { drafts: TableDraft[]; truncated: boolean };
```

`truncated` is returned rather than inferred, because the screen cannot tell the two reasons a row went missing apart: `applyMapping` drops citation-less rows *and* cuts the list at `MAX_IMPORT_VERSES`, so comparing input and output lengths would report a truncation that never happened.

**Header detection.** The first row is a header when at least one of its cells matches a synonym:

| role | synonyms (case-insensitive, whitespace-stripped) |
|---|---|
| `cite` | 장절, 구절, 성구, 참조, 성경구절, 본문장절, reference, ref, cite, verse |
| `title` | 제목, 이름, 타이틀, title, name |
| `w` | 본문, 내용, 말씀, 구절내용, 텍스트, text, body, w |

**Choosing columns**, in order, each role taking the first rule that fires and never a column already taken:

1. **Header synonym.**
2. **Content probe (`cite` only).** Among the first ten data rows, the column with the greatest share of cells that `parsePassageRef` accepts, provided that share is at least half. Cell content is stronger evidence than a header word the sheet's author invented; a leader's "순번 / 암송구절 / 확인" sheet resolves correctly this way even when 암송구절 is not in the table above.
3. **Length probe (`w` and `title`).** Among the columns still free, `w` takes the one with the greatest mean cell length if that mean is at least 20 characters; `title` then takes the first remaining column whose mean is under 20. Bodies are long and titles are short, and this is the only thing that reliably separates them without a header.
4. **Positional fallback.** `cite` takes column 0. `title` and `w` take nothing — an unassigned `w` is not a loss, because the fill supplies it.

> **On the two-column case.** Brainstorming settled on "two columns → 1=장절, 2=본문". Rule 3 refines it in one direction: a short second column becomes 제목 and its body is fetched, rather than becoming a body of two words that blocks the fetch. A long second column still becomes 본문. The confirm screen keeps the stakes low either way — every one of these rules is a *guess shown to a person* before anything is fetched or saved, which is why the heuristics can afford to be opinionated.

**`applyMapping`** reads each data row, normalises the citation through `normalizeCite`, and drops any row whose citation is empty. That is the deeplink rule, for the deeplink reason: a verse with no reference cannot be found again. A row missing only its body is kept — the fill exists for exactly that row. The result is truncated to `MAX_IMPORT_VERSES` and the screen says so when it truncates.

### `src/lib/oyo/autofill.ts` — new

```ts
export type RowStatus = 'ready' | 'loading' | 'no-body';

export interface FillProgress {
	index: number;
	status: RowStatus;
	/** Present only on 'ready'. */
	w?: string;
}

export interface FillOptions {
	concurrency?: number; // default 3
	timeoutMs?: number; // default 10_000
	maxConsecutiveFailures?: number; // default 3
	signal?: AbortSignal;
}

export interface FillSummary {
	filled: number;
	failed: number;
	/** True when the consecutive-failure breaker tripped. */
	abortedEarly: boolean;
}

export async function fillMissingBodies(
	drafts: readonly TableDraft[],
	onProgress: (p: FillProgress) => void,
	opts?: FillOptions
): Promise<FillSummary>;
```

Rows whose `w` is already set are never touched. The rest are grouped by `${bookId}:${chapter}` from `parsePassageRef`; a citation that will not parse resolves to `no-body` immediately, without a request.

**Groups are the unit of concurrency, and a group runs sequentially inside itself.** `fetchChapter` populates its cache *after* the await, so two rows of the same chapter fired in parallel would both miss it and fetch twice. Grouping is what makes the cache real: "시편 119:1–50" costs one request, and parallelism is harvested only across distinct chapters, three at a time.

Two guards keep the screen from hanging on a bad network:

- **Per-chapter timeout.** `Promise.race` against a 10-second timer. `fetchPassageText` takes no `AbortSignal`, and plumbing one through would mean editing the bible module for a caller it does not otherwise know about; racing stops the *waiting* without touching it. The request keeps running, and if it lands late it still populates the chapter cache — which makes 다시 시도 fast rather than wasted.
- **Consecutive-failure breaker.** After three chapter groups fail in a row, the remaining groups are abandoned and reported `no-body` without requests, and `abortedEarly` is true. Without it, 200 rows across 200 dead chapters would take eleven minutes to admit the network is down.

`opts.signal` is checked between groups so leaving the page stops the work.

### `src/lib/components/oyo/VerseReviewList.svelte` — new

The `<ul>` of review rows, lifted out of `/oyo/import/+page.svelte` unchanged and given one new optional prop.

```ts
interface Props {
	rows: { cite: string; w: string }[];
	titles: string[]; // bindable
	chosen: Set<number>; // bindable
	duplicates: Set<number>;
	/** Absent on the deeplink screen, where every row always has a body. */
	statuses?: RowStatus[];
}
```

A `loading` row shows 불러오는 중… where the body goes. A `no-body` row is dimmed, shows 본문 없음 · 건너뜁니다, and its checkbox is disabled.

Extraction rather than duplication is the point: this markup carries a hard-won correctness note — an `<input>` inside a `<button>` is invalid HTML and steals the tap that should place a caret, which is why the check and the scripture block are two targets with the title field belonging to neither. Copied, that lesson goes stale in one of the two copies.

### `src/lib/components/oyo/ColumnMapper.svelte` — new

Three labelled `<select>`s and a `첫 행은 제목 줄` checkbox. Emits a whole `ColumnMapping` and `hasHeader` on change; owns no parsing and no preview — the confirm screen derives those from what it emits, so the component stays a control rather than a screen.

The checkbox closes a one-sided hole. Mistaking a header for data is self-healing — the literal word 장절 does not parse as a passage reference, so that row is dropped as citation-less and nothing is lost. Mistaking the *first verse* for a header loses a verse in silence, and silence is the part that erodes trust. The checkbox lets the reader put it back.

Column letters come from `columnName`, which moves from `export/xlsx.ts` to `src/lib/utils/columnName.ts` so both callers can have it. It is eight pure lines implementing bijective base-26 — the same A/B/AA the reader sees in Excel — and `export/xlsx.ts` imports it from its new home. Importing it out of the xlsx writer instead would drag a zip encoder into the dependency graph of a dropdown label.

### `src/routes/oyo/import/table/+page.svelte` — new

```ts
type Screen =
	| { kind: 'pick'; error: string | null }
	| { kind: 'confirm' }
	| { kind: 'review' }
	| { kind: 'saved'; count: number };
```

Table state spans `confirm` and `review` and lives beside the union: `grid`, `hasHeader`, `labels`, `mapping`, `drafts`, `truncated`, and — populated on confirm — `titles`, `chosen`, `duplicates`, `statuses`, `filling`.

**Back stack**: `pick → confirm → review → saved`, with the Header's back arrow walking it in reverse — `review` back to `confirm`, `confirm` back to `pick`, `pick` out to `/library/oyo`.

**When the screen advances to `confirm`**: as soon as parsing yields a grid with at least one data row. Nothing about the mapping gates it — even a mapping that currently yields zero rows lands here, because this is the only screen where it can be fixed. Bouncing the reader back to the file picker to solve a column problem would be sending them to the wrong room.

Save is sequential over the chosen indexes in ascending order, after `seedOyoPackageIfMissing()` — the same reasoning as the deeplink screen, since `createOyoVerse` reads `max(no) + 1` and parallel writes would collide on the primary key. A save failure keeps the reader on `review` with an inline message rather than discarding the fetched bodies.

`mapping` is never null and needs no unset state. `detectColumns` always names a citation column — its last rule falls back to column 0 — so the confirm screen always has something concrete to show, and a bad guess is corrected the same way any other one is. That removes a nullable path from every consumer downstream.

## Data Flow

**Re-mapping.** Changing a `<select>` or the header checkbox re-derives `drafts` from the in-memory `grid` synchronously and repaints the preview. That is the whole operation — no debounce, no request, no cancellation of anything in flight.

An earlier draft of this design put the mapper on the review screen and re-ran the fill 400 ms after every change. The confirm gate deletes that machinery outright: there is no in-flight fill to race, and no titles or selections to preserve, because neither exists until the reader has agreed to the columns. Moving one decision earlier removed a debounce, a re-entrancy hazard and a rule about discarding the reader's typing.

**Entering review.** Confirming computes `duplicates` once, seeds `titles` from the mapped 제목 column, checks everything that is not a duplicate, and starts the fill. Coming back from review and confirming again repeats all of it from the drafts — the chapter cache means only chapters not already seen cost a request.

**Where a fetched body lands.** A successful fill writes back into `drafts[i].w`, so `drafts` is always the live row data and `statuses[i]` only says how it got there. That is what makes 다시 시도 a single rule instead of two: `fillMissingBodies` skips any row that already has a body, so re-running it over the whole list retries exactly the failures and keeps every index aligned with `titles`, `chosen` and `statuses`. Handing it a filtered sub-list would misalign all four.

**Default selection.** Every row starts checked except duplicates, which start unchecked but remain selectable — the deeplink screen's rule, for the same reason: the reader chose these rows, so the screen labels a duplicate rather than deciding for them. Rows that resolve to `no-body` are removed from the selection and cannot be re-added.

**What gets saved.** Only checked rows, and a `no-body` row can never be checked — so no verse is ever stored with an empty body. `title` is saved trimmed, and an empty title is stored as `''`, which `verseTitle` renders as the citation.

## Error Handling & Edge Cases

| Situation | Behaviour |
|---|---|
| File over 2 MB | Inline: 파일이 너무 큽니다 (2MB까지). |
| `.xlsx` picked | Inline: 엑셀 파일은 아직 직접 읽지 못합니다. 엑셀에서 셀을 복사해 아래에 붙여넣거나, CSV로 저장해주세요. |
| File decodes to nothing | Inline: 표를 읽지 못했습니다. 파일을 확인해주세요. |
| Grid parses but yields no data rows | Inline: 가져올 구절이 없습니다. |
| Detection guessed the 장절 column wrong | The preview shows it — citations that are not citations, or none at all. The reader re-picks on the confirm screen; nothing has been fetched or saved. |
| Mapping yields zero rows | Confirm screen; summary reads 이 설정으로는 가져올 구절이 없습니다 and 맞아요, 계속 stays disabled. |
| More than 200 rows | First 200 imported; a note reads 앞 200개만 가져옵니다. |
| One chapter fetch fails or times out | That group's rows become `no-body`; the rest continue. |
| Three chapter groups fail in a row | Remaining rows become `no-body`; a note reads 본문을 가져오지 못했습니다. 네트워크를 확인해주세요. |
| Reader leaves mid-fill | `AbortSignal` fires from the effect's cleanup; no state is written after unmount. |
| Save throws | Stays on `review` with an inline 구절을 저장하지 못했습니다. 다시 시도해주세요. Leaving the screen would discard every body the fill just fetched. |
| A citation this app cannot parse (e.g. 토비트 3 : 1) | Kept verbatim, as `normalizeCite` already does. It cannot be filled, so it lands in `no-body` and is skipped. |
| Duplicate rows *within* the pasted table | Both shown. Only the existing-verse check flags a row; a within-table twin is the reader's to uncheck. Detecting it would need a second rule, and a table that repeats a verse usually means it on purpose. |

## Testing

Unit tests under `tests/unit/`, written test-first.

| File | Covers |
|---|---|
| `tableText.test.ts` | UTF-8 passthrough, EUC-KR fallback from CP949 bytes, BOM strip, `too-large`, `xlsx` magic bytes, `empty` |
| `tableParse.test.ts` | quoted commas, quoted newlines, `""` escapes, CRLF/CR/LF, tab vs comma detection, empty-row drop, whitespace squeeze |
| `tableColumns.test.ts` | header synonyms per role; content probe beating an unknown header; length probe splitting 제목 from 본문; two-column short/long cases; positional fallback; citation-less rows dropped; `MAX_IMPORT_VERSES` truncation; `applyMapping` under a user-supplied mapping |
| `autofill.test.ts` | one request per chapter for many rows (via `__setChapterCacheForTest`); unparseable citation resolves without a request; timeout yields `no-body`; breaker trips after three consecutive failures and reports `abortedEarly`; `AbortSignal` stops between groups |
| `cite.test.ts` | `normalizeCite` and `duplicateIndexes` cases moved from `importLink.test.ts`, plus the widened `{ cite: string }` signature |
| `VerseReviewList.test.ts` | toggle, select-all, title binding, 이미 있음 badge, `loading` body, `no-body` disabled and unselectable |
| `ColumnMapper.test.ts` | labels render as `A · 장절`; changing a select emits the whole mapping; 장절 offers no 없음; toggling 첫 행은 제목 줄 emits `hasHeader` |
| `tableImportPage.test.ts` | the confirm gate: the preview repaints on a mapping change with **zero** `fetch` calls; 맞아요, 계속 is disabled when the mapping yields zero rows; confirming starts the fill; back from review returns to confirm and aborts it |
| `importLink.test.ts` | unchanged assertions still pass after the move |
| `xlsx.test.ts` / `eventWorkbook.test.ts` | existing `columnName` coverage still passes from its new home |

An E2E case in `tests/e2e/` pastes a three-row table, confirms the columns, waits for the fill, saves, and asserts the verses appear in 나의 구절. It intercepts `bolls.life/get-text/**` with a fixture via `page.route`, so the run neither depends on that host being up nor pays for its latency.

## Open Questions

None.
