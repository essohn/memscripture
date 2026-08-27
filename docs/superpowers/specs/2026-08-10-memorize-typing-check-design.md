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

Two modes, and each takes the whole card. They answer different questions and
running both at once made the first the answer key to the second.

| Entry | Mode | What it shows |
|---|---|---|
| 암송 button | **연습** | The curtain. Drag left→right to uncover one word at a time. |
| 점검 button, or a card tap | **점검** | The typing panel. The verse body is hidden outright. |

**Tapping the card body** opens 점검. The card tap is the primary route:
checking is available on every screen that shows a verse, while multi-select
lives on one, so the largest target serves the more frequent action. Taps
landing on the bookmark ribbon, a difficulty badge or a tag still reach that
control.

Two exceptions. The verse detail page opts out (`tapToCheck={false}`) — its
card fills the screen, so any stray tap would trigger it. And while the package
list is in selection mode, the tap belongs to selection; the toolbar shows
which mode is on, so it is never a guess.

The panel replaces the verse body rather than sitting under it:

```
┌─ VerseCard ─────────────────────┐
│ 양육                       [✕]   │
│ 출애굽기 18 : 20                  │
│                     ← 원문 숨김   │
├─────────────────────────────────┤
│ ⏱ 0:12      지난 점검 3회 · 4·5 ▾ │
│ ┌─────────────────────────────┐ │
│ │ 그들에게 율례와│              │ │
│ └─────────────────────────────┘ │
│ 다음: 법□□                       │
│ [힌트] [포기]           [제출]    │
└─────────────────────────────────┘
```

The verse stays hidden until a result is recorded or the reader gives up — a
legible verse turns typing it from memory into copying it.

The timer starts on the **first keystroke**, not when the panel opens. Since
any card tap now opens the panel, a stray tap while scrolling would otherwise
start timing a check nobody began — and 첫 시작 난이도 would already be
spoiled by the time the reader noticed. 제출 grades the attempt.

### 힌트 — a character at a time

Where the reader is stuck is not computed: `markMismatchedWords` already walks
the verse in order and stops matching at exactly that point, so **the first
unmatched word is the answer**. Reusing it also keeps the hint and the
post-submit marking from ever disagreeing about the same attempt.

Each press opens one more character of that word — `가□□□` → `가르□□` → …  —
and rolls on to the following word once it is fully open. Typing past the stuck
word **resets the count and clears the line**, so the next word starts from one
character and only when asked again. Without the reset, credit spent on one
word would carry into the next and, word after word, feed the reader the whole
verse without another press.

The hint row is always rendered, empty or not. 힌트 is pressed repeatedly, and
a line that appeared on the first press shoved the button out from under the
finger already on it.

Presses do not affect the proposed rating — the reader sets that themselves
anyway. They are recorded on the history row instead: a 5 reached with eight
nudges is not the same 5 as one reached cold, and only that column can say so.

### 포기 — the answer, but not a score

Reveals the verse and hands both ratings over untouched. **No automatic level**:
a reader who blanked on one word and a reader who knew none of it both press
this button, and flattening them into one score would destroy the only signal
the next check has to read. 저장 stays disabled until 전체 난이도 is picked,
since saving without one would write an empty check. Elapsed time and whatever
was typed are still recorded, so the history keeps the shape of the attempt.

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

A flawless attempt is judged on accuracy alone, however long it took — a
careful correct recitation is not worse than a hurried one. It does not jump
to 5, though: a verse the reader has been rating 1 does not become effortless
because it went well once, so a perfect run **climbs one step** and reaches 5
across several checks. A verse with no rating yet has nothing to climb from
and takes the 5.

**Anything less is capped at 2 (Hard)**, however small the slip. Within that
ceiling both how much went wrong and how slowly it came can lower it further,
so the two remaining levels still mean something: one dropped syllable and
half a verse lost are not the same miss.

| accuracy | pace (normalized chars/sec) | rating |
|----------|------------------------------|--------|
| 100%, unrated verse | any               | 5 xEasy |
| 100%, rated *n*     | any               | min(*n* + 1, 5) |
| 80–99%   | ≥ 1.2                        | 2 Hard |
| 80–99%   | below 1.2                    | 1 xHard |
| < 80%    | any                          | 1 xHard |

Two ceilings then override whatever that produced, both landing on 2 (Hard).
**Assistance** — a hint revealed, or the verse played aloud before the attempt
— because that tests recognition rather than recall, and rating it easy is how
a verse stops coming back for review while still being unknown. **A miss
anywhere in the same check session**, which is the one piece of state 다시
deliberately does not clear: a retry made after reading the marked answer is
not an independent attempt, and the climb must not run on a verse this very
check already showed was shaky. 포기 counts as a miss too, even though it
proposes no rating of its own.

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

The band is where this rating starts, not where it ends. It climbs one step
per check the same way 전체 does, and the session's miss caps it at 2 the same
way — a verse whose opening came in three seconds and whose middle was lost is
not an easy verse. Only the climb is limited: a verse that has gone cold is
allowed to fall to its band in a single check.

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

The panel shows **both**: the verse first, 원문, marking the words the attempt
never produced, and the reader's own 입력한 내용 below it, marking the words
they wrote that the verse cannot account for.

An earlier version showed only the verse, on the reasoning that the reader
needs the correct text to see their error against. That answered "what does
it say" and never "what did I write" — which is the actual question after a
failed attempt.

The two readings walk the same forward scan (`markMismatchedWords` and
`markAttemptWords`), so they can never disagree about which words were
produced. What the 입력한 내용 block does **not** do is restore the words that
were skipped. A version between the two put them back in place, dashed, where
the verse picked up again; on a bad check that filled the block with verse the
reader never typed — most of what they were reading back was not theirs, and
an omission is already marked on the 원문 directly above. The attempt block is
their own hand and nothing else.

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

Each saved check is recorded: when, both ratings, the accuracy, the elapsed
time and the 힌트 presses. The panel shows the last **10** for that verse — collapsed to a one-line
summary above the input, expandable on tap. Collapsed by default because the
input is what the reader came for, and ten rows above it would push the
textarea off a phone screen.

Only a saved result is recorded, so 취소 leaves nothing behind: the list reads
as "checks I finished", not "times I opened the panel". Older entries are
pruned as new ones land — this is a glance at recent form, not an audit trail,
and 900 verses times an unbounded log would ride along in every sync snapshot.

Storage is a new `checkHistory` table at schema **v7**, additive so Dexie
migrates existing databases without a data callback. `hints` is optional on
the record — rows written before hints existed have none, and absent is not
the same as zero — so it needs no version bump of its own. It is included in the
Drive sync snapshot, since progress, ratings and activity all are and history
is the same class of data; `checkHistory` is optional on the snapshot type so
a file written by a v6 device still imports.

## Architecture

The graded logic is pure and lives outside the component, because the
thresholds and the normalization are the parts worth testing exhaustively.

| Module | Responsibility |
|--------|----------------|
| `src/lib/memorize/grade.ts` | Normalization, Levenshtein, accuracy → rating, word-level mismatch marking, next-hint lookup. Pure. |
| `src/lib/memorize/timing.ts` | Elapsed → rating; "has the opening been typed" test. Pure. |
| `src/lib/components/card/MemorizeCheckPanel.svelte` | Timer, input, 힌트, 포기, submit, confirmation UI |
| `src/lib/components/card/VerseCard.svelte` | Owns the `read`/`rehearse`/`check` mode; mounts the panel in check mode |

The panel reports results upward through callbacks (`onPickStartDifficulty`,
`onPickFullDifficulty`) that `VerseCard` already receives, so no page needs
new wiring and the ratings persist through the path they already use.

## Error handling

- **Empty submission** — 제출 stays disabled until something is typed.
- **Opening never matched** — full rating still proposed, start left unset.
- **Panel closed mid-attempt** (✕ or navigating away) — nothing is written.
- **Verse with no gradeable body** — 점검 is not offered at all, and a card
  tap does nothing. Guarded on the normalized text, not a raw non-empty check:
  a body of pure punctuation (reachable on user-authored OYO verses)
  normalizes to the empty string, and two empty strings would otherwise score
  a meaningless attempt 100%. 암송 still works — a curtain needs no grading.
- **힌트 pressed past the end of the verse** — the hint holds at the last word
  rather than wrapping to the beginning; the button disables once the verse
  has been produced in full.
- **포기 with nothing typed** — allowed. The 입력한 내용 block is skipped
  rather than rendered empty, which would only claim they wrote nothing
  worth showing.

## Testing

| Target | What is asserted |
|--------|------------------|
| `grade.ts` | Spacing and punctuation ignored; `*` stripped; a wrong word counts; each accuracy band maps to its rating; over-long answers do not score high; word-level marking picks the right words; the hint locates the stuck word, opens one character per press, rolls to the next word, and returns nothing once the verse is complete |
| `timing.ts` | Each band maps to its rating; boundary values land on the intended side; the opening matches under normalization |
| `MemorizeCheckPanel` | 100% saves without a dialog; a flawed attempt opens confirmation and writes nothing until 저장; 취소 writes nothing; submit disabled while empty; 힌트 reveals one character at a time and resets when the reader types past it; 포기 proposes no rating and leaves 저장 disabled until one is picked |
| `VerseCard` | 암송 opens the curtain with no panel; 점검 and a card tap open the panel with no curtain; the body stays hidden through a check and is revealed on save |

## Open questions

None. The threshold tables are expected to be tuned after real use; they
are isolated so that is an edit, not a redesign.
