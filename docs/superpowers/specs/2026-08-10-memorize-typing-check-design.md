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
- **A completed-verses view.** History is shown per verse in the panel, not
  as a separate screen.

## User-facing behavior

**Tapping the card body** opens memorize mode, as does the 암송 button. The
card tap is the primary route: memorize is available on every screen that
shows a verse, while multi-select lives on one, so the largest target serves
the more frequent action. Taps landing on the bookmark ribbon, a difficulty
badge or a tag still reach that control.

Two exceptions. The verse detail page opts out (`tapToMemorize={false}`) —
its card fills the screen, so any stray tap would trigger it. And while the
package list is in selection mode, the tap belongs to selection; the toolbar
shows which mode is on, so it is never a guess.

A check panel appears inside the card, directly under the verse body:

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

The timer starts on the **first keystroke**, not when the panel opens. Since
any card tap now opens the panel, a stray tap while scrolling would otherwise
start timing a check nobody began — and 첫 시작 난이도 would already be
spoiled by the time the reader noticed. 제출 grades the attempt.

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

A flawless attempt scores 5 however long it took — accuracy is what this
rating is about, and a careful correct recitation is not worse than a hurried
one. **Anything less is capped at 3**, however small the slip, and typing pace
lowers it from there.

| accuracy | pace (normalized chars/sec) | rating |
|----------|------------------------------|--------|
| 100%     | any                          | 5 xEasy |
| < 100%   | ≥ 1.5                        | 3 Normal |
| < 100%   | ≥ 0.8                        | 2 Hard |
| < 100%   | below                        | 1 xHard |

Pace, not elapsed seconds: the corpus runs from short verses to 224
characters, and a long verse must not be marked down for taking longer to
type. This does mean time now feeds both ratings — 첫 시작 from when the
opening was recalled, 전체 from the pace across the whole verse. They measure
different things, but a slow day moves both.

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

**Accuracy 100%** — both ratings save immediately and the panel reports what
it stored. A perfect recitation should not need a dialog.

Recording a result also ends the check: the curtain lifts, so the reader can
compare the verse against what they typed, and 닫기 returns the card to its
ordinary state. 다시 stays available for another attempt on the same verse.
Hiding the verse after it has been graded serves nothing.

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

The panel shows **both**: the reader's attempt with their own wrong words
marked, and the verse below it marking what they missed.

An earlier version showed only the verse, on the reasoning that the reader
needs the correct text to see their error against. That answered "what does
it say" and never "what did I write" — which is the actual question after a
failed attempt. Both readings come from `markMismatchedWords` with the
arguments swapped: walking the attempt and checking each word against the
verse is the mirror of walking the verse.

### 취소 — a clean slate

취소 returns to the typing view without writing anything, and clears the
attempt with it: the text, the opening-recall timestamp and the panel's start
time all reset, so the next check begins fresh.

An earlier version kept them, on the theory that a flawed attempt is usually
one wrong word worth editing rather than retyping. In use that read as a
stuck panel — a reader who rejects a grade wants another go, not an edit of
the try they just rejected. And keeping the clock was actively wrong: a
resubmit made after reading the marked answer would still have been timed
from the original open, flattering it against an honest single attempt.

## Check history

Each saved check is recorded: when, both ratings, the accuracy and the elapsed
time. The panel shows the last **10** for that verse — collapsed to a one-line
summary above the input, expandable on tap. Collapsed by default because the
input is what the reader came for, and ten rows above it would push the
textarea off a phone screen.

Only a saved result is recorded, so 취소 leaves nothing behind: the list reads
as "checks I finished", not "times I opened the panel". Older entries are
pruned as new ones land — this is a glance at recent form, not an audit trail,
and 900 verses times an unbounded log would ride along in every sync snapshot.

Storage is a new `checkHistory` table at schema **v7**, additive so Dexie
migrates existing databases without a data callback. It is included in the
Drive sync snapshot, since progress, ratings and activity all are and history
is the same class of data; `checkHistory` is optional on the snapshot type so
a file written by a v6 device still imports.

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
