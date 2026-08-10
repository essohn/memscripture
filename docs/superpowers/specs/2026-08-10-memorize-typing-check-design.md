# Memorize Typing Check — Design

**Status:** Approved (2026-08-10) · single-phase delivery.

## Problem

Tapping 암송 on a verse card enters memorize mode, where the reader drags a
curtain to reveal the verse one word at a time. It is a rehearsal aid with
no result: nothing is tested, and nothing is recorded.

Separately, the two difficulty ratings (`첫 시작` and `전체 암송`) are set by
hand from a picker. Since the home event counter now reads those ratings to
decide what counts as memorized, every count depends on the reader
remembering to tap two badges.

This spec adds a **typing check** below the verse: type the verse from
memory against a timer, and have both ratings proposed from the result.

## Non-Goals

- **Replacing the curtain.** It stays exactly as it is and becomes the hint
  when the reader gets stuck. Yes, revealing the whole verse and copying it
  scores 100% — this is a personal study tool whose ratings the reader sets
  by hand today, so nothing is gained by policing it.
- **Speech or handwriting input.** Typing only.
- **Partial verses.** The check is the whole verse. The median is 61
  characters and the longest is 224, so this is not onerous.
- **Scoring history.** Only the two resulting ratings are stored. Attempts,
  times, and accuracies are not persisted.

## User-facing behavior

암송 opens memorize mode as it does today, and a check panel appears inside
the card, directly under the verse body:

```
┌─ VerseCard ─────────────────────┐
│ 양육            [난이도] [✕]     │
│ 출애굽기 18 : 20                  │
│ ░░░░░ ░░░░ ░░░░░░ ░░░░░  ← 커튼   │
├─────────────────────────────────┤
│ ⏱ 0:12                          │
│ ┌─────────────────────────────┐ │
│ │ 그들에게 율례와│              │ │
│ └─────────────────────────────┘ │
│                        [제출]    │
└─────────────────────────────────┘
```

The timer starts when the panel opens. 제출 grades the attempt.

## Grading — 전체 암송 난이도

Both texts are normalized first: every character outside Hangul, Latin
letters, and digits is dropped. Across all 1495 shipped verses that removes
spaces, 291 `*` verse-boundary markers, two commas and one pair of
parentheses — so in practice it means **spacing and punctuation do not
count**. Korean spacing is a spelling problem, not a recall failure, and
counting it would make the proposal feel unfair and untrustworthy.

Accuracy is Levenshtein distance over the normalized strings:

```
accuracy = 1 − distance / max(expected.length, actual.length)
```

Dividing by the longer of the two keeps a rambling over-long answer from
scoring above a terse one. At 224 characters worst case the matrix is
trivial to compute.

| accuracy | rating |
|----------|--------|
| 100%     | 5 xEasy |
| ≥ 95%    | 4 Easy |
| ≥ 85%    | 3 Normal |
| ≥ 70%    | 2 Hard |
| below    | 1 xHard |

## Timing — 첫 시작 난이도

Measured from the panel opening until the reader has correctly typed the
verse's **first two words**. The opening is compared under the same
normalization as the score, so hesitation and corrected typos are inside the
measured window but spacing is not. Verses shorter than two words fall back
to what they have, so the clock can always stop.

Two words rather than `extractFirstClause()`'s 3–8: that function sizes a
*hint* for the daily review card, which is a different job. By the second
word the reader has plainly recalled how the verse starts, and waiting for
up to eight turned this rating into a measure of typing speed on long
verses.

`첫 시작 난이도` means the difficulty of recalling how a verse *begins*,
which barely varies with the verse's total length — so these are absolute
seconds rather than a rate.

| elapsed | rating |
|---------|--------|
| ≤ 5s    | 5 xEasy |
| ≤ 10s   | 4 Easy |
| ≤ 20s   | 3 Normal |
| ≤ 40s   | 2 Hard |
| beyond  | 1 xHard |

If the opening is never typed correctly, no start rating is proposed and
that badge is left for the reader to set.

Both tables are named constants in one place. They will be wrong on the
first try — mobile typing is slow, and the right numbers only emerge from
use.

## Confirmation

**Accuracy 100%** — both ratings save immediately, with a toast naming
them. A perfect recitation should not need a dialog.

**Anything less** — a confirmation panel opens showing the proposed
ratings, the **verse text with the words the reader missed marked**, and both
`DifficultyBadge` pickers so the reader can adjust before saving. 취소 closes
the confirmation and writes nothing — see below for what it leaves alone.

The asymmetry is the point: the app may declare success on its own, but it
may not decide that a flawed attempt was nonetheless "easy".

Mismatches are marked **per word** even though the score is per character.
A character-level diff highlights fragments of syllables, which is unreadable;
word-level marking answers the question the reader actually has, which is
"which words did I get wrong". Score and highlight therefore run on
different granularities, deliberately.

The marked text is the **verse**, not the reader's attempt: `markMismatchedWords`
maps over the verse's words and checks each against the attempt's word at the
same position. A word the reader typed that has no counterpart in the verse
(an insertion, or a guess that doesn't line up) never gets its own marked
entry — there is nothing in the correct text for it to attach to. This is
deliberate: the reader already has their own attempt in the textarea above;
what they need from the confirmation view is the *correct* text with their
mistakes highlighted, so they know what to fix. Marking the attempt instead
would show the reader their own guesses with no indication of what the verse
actually says at each spot.

### 취소 — what survives

취소 returns to the typing view without calling `onResult`, but it does not
reset the attempt in progress: the typed text, the opening-recall timestamp,
and the panel's start time are all left as they were. Two reasons:

- **The text.** A flawed attempt is usually one wrong word, not a wrong
  verse. Clearing the textarea on 취소 would force retyping the whole thing
  to fix a single typo.
- **The clock.** The elapsed time is measured from when the reader actually
  started, and resetting it on 취소 would let a second submission look
  faster than the recall really was — flattering a "cancel and immediately
  resubmit" over an honest single attempt.

So "취소 discards the attempt" means: nothing is written to storage. It does
not mean the in-progress state is cleared.

## Architecture

The graded logic is pure and lives outside the component, because the
thresholds and the normalization are the parts worth testing exhaustively.

| Module | Responsibility |
|--------|----------------|
| `src/lib/memorize/grade.ts` | Normalization, Levenshtein, accuracy → rating, word-level mismatch marking. Pure. |
| `src/lib/memorize/timing.ts` | Elapsed → rating; "has the opening been typed" test. Pure. |
| `src/lib/components/card/MemorizeCheckPanel.svelte` | Timer, input, submit, confirmation UI |
| `src/lib/components/card/VerseCard.svelte` | Mounts the panel under the body in memorize mode |

The panel reports results upward through callbacks (`onPickStartDifficulty`,
`onPickFullDifficulty`) that `VerseCard` already receives, so no page needs
new wiring and the ratings persist through the path they already use.

## Error handling

- **Empty submission** — 제출 stays disabled until something is typed.
- **Opening never matched** — full rating still proposed, start left unset.
- **Panel closed mid-attempt** (✕ or navigating away) — nothing is written.
- **Verse with no gradeable body** — the panel does not render. Guarded on
  the normalized text, not a raw non-empty check: a body of pure punctuation
  (reachable on user-authored OYO verses) normalizes to the empty string,
  and two empty strings would otherwise score a meaningless attempt 100%.

## Testing

| Target | What is asserted |
|--------|------------------|
| `grade.ts` | Spacing and punctuation ignored; `*` stripped; a wrong word counts; each accuracy band maps to its rating; over-long answers do not score high; word-level marking picks the right words |
| `timing.ts` | Each band maps to its rating; boundary values land on the intended side; the opening matches under normalization |
| `MemorizeCheckPanel` | 100% saves without a dialog; a flawed attempt opens confirmation and writes nothing until 저장; 취소 writes nothing; submit disabled while empty |
| `VerseCard` | Panel appears in memorize mode and not in read mode; the curtain still works |

## Open questions

None. The threshold tables are expected to be tuned after real use; they
are isolated so that is an edit, not a redesign.
