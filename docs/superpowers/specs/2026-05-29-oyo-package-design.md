# OYO ("Only Your Own") Package — Design

**Status:** Approved (2026-05-29) · phased delivery, Phase 1 first.

## Problem

MemScripture's library is built from JSON packages curated by the maintainer.
A user can pick a package and memorize its verses, but can't add a verse of
their own — neither for ad-hoc memos nor for verses outside any shipped
package. We want a single user-owned package, called **OYO ("Only Your
Own")**, where the user can:

1. Freely add / edit / delete their own verses.
2. Define and assign flat tags to organize them.
3. Back up and restore the data as a portable JSON file.

This is a **personal notebook**, not a curated-package builder. The data
shape and editorial UX are deliberately lighter than the built-in packages.

## Non-Goals

- Multiple user-created packages. OYO is a single reserved package.
- Hierarchical (series / group) tag structure like the built-in packages.
  Flat tags only.
- Structured citation parsing (e.g. book picker + chapter / verse spinner).
  Citation stays free-text.
- Cross-device sync via a backend. Backup is a portable file the user moves
  themselves (AirDrop, Drive, etc.).
- Integration with the SRS / Today flow. Today is currently disabled
  (`commit 31c1a2c`); when re-enabled, OYO verses can be wired in then.

## Recommended Approach

A reserved `package_id = 'oyo'` row in the existing `packages` /
`verses` tables, plus two new tables for user-defined tags and verse↔tag
assignments. Editing is gated to OYO only; everything else (bookmarks, Eye
toggle, memorize mode, prev/next nav) reuses existing components unchanged.

### Why not "full package builder" (alternative considered)

Mirroring built-in packages would require multiple user packages, a
two-level tag hierarchy (series → groups), and an editorial layer that
roughly doubles the implementation cost. The framing ("자유롭고 쉽게",
"내 구절 노트북") and the way the rest of the app is tuned for low-friction
single-user use both point toward the lightweight model.

## Architecture

### Package model

- `package_id = 'oyo'` is reserved. On first app launch, seed Dexie's
  `packages` table with:
  ```
  { id: 'oyo', name: '내 구절', abbreviation: 'OYO',
    translation: 'krv', translation_name: '사용자', language: 'kor',
    kind: 'user', source: '', version: 1, default: false, … }
  ```
- Add a `kind: 'builtin' | 'user'` field to `PackageMeta`. All shipped
  packages get `kind: 'builtin'`; OYO gets `'user'`. The library list
  uses this to decide whether to show an edit affordance.
  - Note: `source` was the natural name for this discriminator, but
    `PackageMeta.source` already exists as the JSON file path for
    curated packages. Using `kind` avoids the collision.
- Built-in package loaders ignore `package_id = 'oyo'` (no JSON file to
  install). The package always exists in Dexie regardless of how many
  verses it contains.

### Data model

Reuse the existing `verses` table for OYO verses — the shape (`no`, `i`,
`title`, `cite`, `w`) is a clean match. Distinguish by `package_id` value.

Two new Dexie tables:

```ts
userTags: {
  id: string;          // ULID
  name: string;        // free-form ("감사", "기도", …)
  createdAt: number;
}

verseTagAssignments: {
  // composite id so a verse+tag pair is unique
  id: string;          // `${packageId}:${verseNo}:${tagId}`
  packageId: 'oyo';    // future-proof if we ever add more user packages
  verseNo: number;
  tagId: string;
}
```

Why a separate join table instead of extending `IndexGroup`:

- `IndexGroup` carries `level: 1 | 2` + `index: number[]` for the curated
  series / group hierarchy. Reusing it would mean shoehorning flat user
  tags into a structure that doesn't model them.
- The N:N join is the natural shape for flat tags and is easy to mutate
  (insert/delete one row at a time as the user edits).
- The existing `tagsForVerse` abstraction stays for built-in packages;
  a new `userTagsForVerse(packageId, verseNo)` covers OYO. The library
  detail page picks whichever applies by package source.

### Verse number allocation

- `no = max(existing OYO verses' no, 0) + 1` on create. Monotonically
  increases; never reused.
- `i = no` (simple sort key).
- Deletion creates a hole in the `no` sequence. The verse-detail page's
  prev/next nav already handles sparse numbering (sorted by `no`).

### Build-time vs runtime separation

- Built-in packages are installed from `static/data/*_krv.json` into Dexie
  on first access (existing `installPackage` flow). Idempotent.
- OYO has no JSON source — its data is born in Dexie from user actions.
  `installPackage('oyo')` is a no-op; instead a `seedOyoPackageIfMissing()`
  utility ensures the `packages` row exists.

## UI / UX

### Library list

- OYO card sits at the top of the package list (above curated packages),
  marked visually as user content — e.g. a `사용자 정의` chip and slightly
  dimmer chrome so it doesn't get confused with curated content.
- Tapping the card navigates to `/library/oyo` like any other package.

### OYO package detail (`/library/oyo`)

- Same shell as built-in package detail, plus a header action row:
  - `+ 구절 추가` — primary CTA, opens the verse-add sheet.
  - `태그 관리` — secondary, opens the tag-management modal.
- Each verse card surfaces a `…` overflow menu (edit / delete) only when
  the package is OYO.

### Verse add / edit sheet

A bottom sheet (mobile-friendly) with:

| Field | Type | Notes |
|---|---|---|
| 인용 (cite) | free text | e.g. `요한복음 3:16`. No parser. Required. |
| 제목 (title) | short text | optional memo. |
| 본문 (w) | multiline | required. |
| 태그 | multi-select chips | + `새 태그` inline create. |

Submit creates / updates and closes the sheet. Delete from the overflow
menu shows the existing undo toast pattern (commit `3228e5e`) so the
destructive action is reversible.

### Tag management modal

- List of current tags with rename and delete actions.
- Delete: cascade-removes `verseTagAssignments` for that tag id; the
  verses themselves stay. Confirm phrasing: "X태그가 사용된 N개 구절에서
  태그만 제거됩니다."
- Add new from inside the verse sheet OR from this modal — both write to
  the same `userTags` table.

### Filtering by tag on the detail page

Reuse `CategoryTag.svelte` and the existing tag-pill filter UX on the
library detail page. For OYO, the pills come from `userTags` joined to
`verseTagAssignments`, not from `IndexGroup`.

### Settings page

Add a "내 구절 백업/복원" section to the (currently empty) settings page.
Two actions:

- **내보내기**: builds a JSON blob and triggers a download via `<a download>`.
  Filename pattern: `oyo-backup-YYYY-MM-DD.json`.
- **복원**: `<input type="file" accept="application/json">` →
  parse → preview ("N개 구절, M개 태그") → choice between **병합** and
  **덮어쓰기**. Overwrite confirms via the existing toast pattern.

## Backup file format

```jsonc
{
  "version": 1,
  "exportedAt": "2026-05-29T13:40:00Z",
  "packageId": "oyo",
  "verses": [
    { "no": 1, "i": 1, "title": "…", "cite": "…", "w": "…" }
  ],
  "tags": [
    { "id": "01J…", "name": "감사", "createdAt": 1748… }
  ],
  "assignments": [
    { "verseNo": 1, "tagId": "01J…" }
  ]
}
```

- `version: 1` is a single integer so future upgraders can branch on it.
- Tag `id`s are preserved across export → import so assignments survive
  round-trips on the same device. On import-into-different-device,
  `verseTagAssignments` are re-keyed using the imported `tagId`s, which
  are fresh from the source device — collisions are vanishingly unlikely
  with ULID.

### Merge vs overwrite semantics

| Mode | Verses | Tags |
|---|---|---|
| 병합 | append imported verses (new `no` allocations on the receiving device); skip exact duplicates by `(cite, w)` | dedupe by `name` case-sensitive; reuse existing tag ids when names match |
| 덮어쓰기 | delete all existing OYO verses, then insert imported | replace `userTags` and `verseTagAssignments` wholesale |

## Integration with existing features

- **Bookmarks**: `BookmarkControl` keys off `(packageId, verseNo)`, so
  OYO verses bookmark and surface in `/bookmarks` naturally. No change.
- **Eye toggle**: same global setting (commit `4b641c2`).
- **Memorize mode + prev/next**: unchanged; the prev/next nav already
  handles sparse `no` sequences.
- **SRS / Today**: out of scope. Today is disabled (`commit 31c1a2c`);
  when re-enabled, OYO verses can be added as queue candidates with no
  schema change.

## Phasing

| Phase | Scope | Shippable value |
|---|---|---|
| 1 | OYO package seed + verse CRUD (no tags, no backup) | User can immediately start jotting verses |
| 2 | User-defined tags + filter integration on detail | Verses can be organized |
| 3 | Backup / restore JSON | Data safety net + device transfer |

Each phase is independently shippable. Phase 1 is the minimum useful
slice; Phase 3 is the safety net to add before the dataset gets big
enough that loss would matter.

## Risks and Open Questions

- **Dexie schema migration**: adding `userTags` and `verseTagAssignments`
  bumps the Dexie schema version. The migration is additive only (no
  changes to existing tables), so risk is low — but the v-bump must land
  with Phase 2.
- **`kind` field on `PackageMeta`**: shipped packages don't have it in
  their JSON. Handled by defaulting to `'builtin'` when absent — backfill
  during `listPackages`.
- **Citation parsing**: deferred. If users start writing inconsistent
  citations, we may revisit with a parser/picker, but free text is a
  reasonable first cut.
- **OYO card placement and visual treatment**: needs a quick pass during
  Phase 1 to make sure it's clearly user-owned without feeling
  second-class. Will iterate from a first cut.

## What Phase 1 covers

1. `kind` field on `PackageMeta` + backfill on existing installs.
2. `seedOyoPackageIfMissing()` runs on app startup.
3. Library list: OYO card with `사용자 정의` chip; tap goes to `/library/oyo`.
4. `/library/oyo` page: list of OYO verses sorted by `no`, `+ 구절 추가`
   CTA, per-verse overflow menu (edit / delete).
5. Verse add/edit sheet with cite / title / body fields.
6. Delete uses the existing undo toast pattern.
7. Unit + Playwright coverage for the new CRUD flow.

Phase 1 explicitly does NOT include tags or backup. The verse sheet's
태그 multi-select stays out until Phase 2.
