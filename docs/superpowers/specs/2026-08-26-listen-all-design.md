# 전체 듣기 (Listen All) — Design Spec

**Date:** 2026-08-26
**Status:** Draft → User review
**Scope:** New `memorize/playlist.ts`, new `state/playlistPlayer.svelte.ts`, new `components/player/` (`ScrubTrack.svelte`, `PlaylistBar.svelte`). Modifies `memorize/speak.ts`, `db/events.ts`, `db/viewOptions.ts`, `components/card/VersePlayer.svelte`, `components/home/EventSection.svelte`, `routes/bookmarks/+page.svelte`, `routes/settings/+page.svelte`.

## Goal

Playback today is per-verse: a speaker button on a `VerseCard` reads that one verse. A reader preparing for an 암송 DAY has eight or twelve verses to hear, and getting through them means tapping twelve times on twelve cards.

This adds a playlist: one control that reads a whole set in order, with the transport already built for a single verse — pause, scrub, loop.

Two entry points:

- **Home** — one 전체 듣기 button per 암송 DAY event, in the event header. Reads every range's verses in order.
- **Bookmarks** — one 전체 듣기 button for the currently selected ribbon color.

Looping the list is a setting, on by default, because the reader who reaches for 전체 듣기 is usually trying to soak in a set rather than hear it once.

## Non-goals

- **Playback across navigation.** The bar belongs to the page that opened it; leaving the page stops the voice. `speechSynthesis` is one global queue, so a playlist that outlives its page would fight every card's own play button app-wide. Mobile Safari also suspends synthesis in the background, so the reward for a global player is small.
- **Per-verse repeat counts** ("read each verse 3× then advance"). Decided against in brainstorming: list-loop only.
- **Next/previous track buttons.** The scrub bar already reaches any point in the list, and a 12-verse list is short enough that scrubbing is the whole navigation story. Revisit if the list grows.

## User Experience

### Home — event header

```
┌─ 암송 DAY section ────────────────────────────────────────────┐
│  📅 2026 여름 암송 DAY              [▶]  [⬇]        D-11      │
│  ┌──────────────┐  ┌──────────────┐                           │
│  │ 구원          │  │ 성령          │                          │
│  │ 3/8 암송      │  │ 0/6 암송      │                          │
│  └──────────────┘  └──────────────┘                           │
└───────────────────────────────────────────────────────────────┘
```

- Play icon (lucide `Play`) sits immediately left of the existing export icon, same 7×7 chip, same hover treatment.
- Tapping plays every range's verses in the order the ranges are listed.
- While *this* event's list is open, the icon becomes `Square` (stop) and the chip inks over with the accent fill, and tapping it closes the bar and stops playback. Stop rather than a muted speaker, and not `Pause`: the transport lives in the bar, and this button's promise is "start this list / put it away". Same reasoning as `VerseCard`'s speaker chip.
- `aria-label`: `"{eventTitle} 전체 듣기"`, becoming `"{eventTitle} 듣기 정지"` while open.
- Hidden entirely when `isTtsSupported()` is false, or the event resolved to zero verses.

### Bookmarks — color header

```
총 12개                      전체 듣기 · 이 색 전부 지우기
```

- Text button, `12px`, `var(--color-text-secondary)`, matching the neighbouring 이 색 전부 지우기 in weight but not in danger color.
- Plays `visibleRows` — the currently selected ribbon color only, in the order shown.
- While that color's list is open the label reads 듣기 정지 and takes on `var(--color-accent)`; tapping closes the bar and stops playback.
- Switching the color tab while playing stops playback and closes the bar (see Edge Cases).

### The player bar

Fixed above the TabBar. One bar per page, never two.

```
┌───────────────────────────────────────────────────────┐
│  ▶   창세기 28:14 · 2/12                      🔁   ✕  │
│      ━━━━━━━━━●──────────────────────  1:12 / 6:40    │
└───────────────────────────────────────────────────────┘
[   홈       라이브러리       북마크       설정   ]
```

- Position: `fixed`, `bottom: 4rem` plus `env(safe-area-inset-bottom)`, `inset-x-0`, `z-40` — under the TabBar's `z-50` so it never covers navigation.
- Surface: `var(--color-card)`, top border `var(--color-border)`, `--shadow-card-hover`.
- Line 1: play/pause · now-playing label · repeat toggle · close.
- Line 2: scrub track · `m:ss / m:ss`.
- Now-playing label truncates; the `n/total` counter never does.
- Repeat toggle mirrors `VersePlayer`'s: `aria-pressed`, accent-soft fill when armed.
- Close stops playback and removes the bar. Pause leaves it open — closing is a separate act from pausing, as in `VersePlayer`.

## Architecture

### New module: `src/lib/memorize/playlist.ts`

Pure functions, no browser. Sits between `speak.ts`'s `speechSegments()` and its `createPlayer()`.

```ts
export interface PlaylistVerse {
  title?: string;
  cite: string;
  w: string;
}

export interface PlaylistTrack {
  cite: string;
  title?: string;
  /** Character offset where this verse begins in the flattened script. */
  start: number;
  /** Characters this verse occupies. */
  length: number;
}

export interface Playlist {
  /** Handed to createPlayer() unchanged. */
  segments: string[];
  tracks: PlaylistTrack[];
  /** Sum of segment lengths — the denominator a fraction is of. */
  chars: number;
}

export function buildPlaylist(
  verses: PlaylistVerse[],
  opts?: { includeTitle?: boolean }
): Playlist;

export function trackAt(
  list: Playlist,
  fraction: number
): { index: number; track: PlaylistTrack } | null;
```

`buildPlaylist` calls the existing `speechSegments()` once per verse and concatenates the results, recording each verse's character span as it goes. A verse contributing no segments (empty body and unparseable cite) is skipped rather than becoming a zero-length track that `trackAt` could land on.

The offsets are in the same unit `createPlayer` already uses: `totalChars()` sums raw segment lengths, and `sliceFrom()` walks segments by those same lengths. No second coordinate system is introduced.

`trackAt` clamps `fraction` to `[0, 1]` and maps `fraction × chars` onto the track spans. Returns `null` only for an empty playlist. A fraction of 1 returns the last track rather than null, so the label at the end of a list reads as the final verse instead of blanking.

**Known limitation.** iOS Safari fires no `boundary` events, so `createPlayer`'s reported fraction there is driven purely by the clock estimate (`elapsed / totalMs_estimated`, `CHARS_PER_SECOND = 5.5`) rather than by the synthesizer's true position. That estimate's error is a percentage of elapsed time, not of verse count, so it compounds linearly over a list's length: on a single verse it is the rounding wobble the existing per-verse progress bar already ships with, but on the shipped 암송 DAY fixture — 149 verses — a 10% error in `CHARS_PER_SECOND` is roughly fifteen verses of drift by the end of the set. On iOS, the now-playing label can name the wrong book. This is a real cost of the design, accepted rather than overlooked: the alternative — chaining one player per verse to get an exact index — would give up whole-list seeking and re-introduce the state machine this design removes. A future fix, if the drift proves to matter in practice, would recalibrate `CHARS_PER_SECOND` against real playback rather than change this tradeoff.

### Modified: `src/lib/memorize/speak.ts` — global queue ownership

`speechSynthesis` is a single global queue, and both `speak()` and `createPlayer()` already call `synth.cancel()` on start. That cancel fires the *previous* utterance's `onend`. In `createPlayer`, that handler reads:

```ts
u.onend = () => {
  if (stopped || paused) return;
  if (opts.repeat) { /* restart from 0 */ }
  finish();
};
```

Neither `stopped` nor `paused` is set — the player did not stop itself, it was cancelled out from under it. So a player with `repeat` armed **restarts** when another player takes the queue, and two voices talk over each other. This is a latent bug today (two `VerseCard`s with repeat on), and the bookmarks page makes it reachable: the playlist bar and each card's play button share one screen.

Fix — a module-level owner:

```ts
/** The playback currently holding the global speechSynthesis queue.
 *  One queue means one owner; a new one relieves the old one properly
 *  rather than yanking the queue and leaving its onend to misfire. */
let activeStop: (() => void) | null = null;
```

- `speak()` and `createPlayer()` call `activeStop?.()` before touching the synth, then register their own `stop`.
- A handle clears `activeStop` when it stops, but only if it is still the registered owner — a stale handle must not unregister its successor.
- Because the old owner is stopped through its own `stop()`, it sets `stopped` first and reports `onEnd`, so the UI that owned it leaves the "playing" state cleanly.

`createPlayer.playFrom` has the same fault turned inward: it cancels the synth to seek, which fires the *outgoing* utterance's `onend`, which with `repeat` armed jumps the reader back to offset 0 instead of to where they scrubbed. Detaching the outgoing utterance's handlers before the cancel fixes it at the source:

```ts
if (current) { current.onend = null; current.onboundary = null; current.onerror = null; }
```

The existing `if (synth.speaking || synth.pending) synth.cancel()` guard stays as-is — it still covers a queue left busy by something outside this module. The owner call is added ahead of it, so the previous player is relieved through its own `stop()` before the cancel lands.

### New module: `src/lib/state/playlistPlayer.svelte.ts`

A class, instantiated per page — home and bookmarks each own one and each tears its own down. (`fontScale.svelte.ts` is a class exported as a singleton because a font scale is one global preference; a playback session is not, so this one is exported as the class and each page does `new PlaylistPlayer()`.)

```ts
export class PlaylistPlayer {
  readonly playing: boolean;
  readonly progress: PlayerProgress;
  readonly listRepeat: boolean;
  /** Which list is open, or null. Home passes `event:${id}`,
   *  bookmarks passes `bookmark:${color}`. */
  readonly openId: string | null;
  readonly nowPlaying: PlaylistTrack | null;
  readonly index: number;
  readonly count: number;

  /** MUST stay synchronous — see below. */
  start(id: string, verses: PlaylistVerse[]): void;
  toggle(): void;
  seek(fraction: number): void;
  toggleRepeat(): void;
  /** Stop and dismiss the bar. */
  close(): void;
  /** Page teardown. */
  destroy(): void;

  /** Reads stored speak options into memory. Called from the page's
   *  $effect, never from start() — see below. */
  load(): Promise<void>;

  /** Whether the platform speaks at all; decided once. */
  readonly supported: boolean;
}
```

**`start()` must not be `async`.** iOS Safari honours `speechSynthesis.speak()` only when it is reached synchronously from the tap that triggered it; an `await` in that path ends the gesture and the phone stays silent with no error. So the controller preloads `getSpeakOptions()` in an effect and holds it in memory, exactly as `VerseCard` does and for exactly the same reason. It re-reads options after the gesture is spent, so a settings change lands on the next play.

Internally: `start()` builds the playlist, calls `createPlayer(playlist.segments, { rate, voice, gender, repeat: listRepeat, onProgress, onEnd })`, and stores the handle. `toggle`/`seek` delegate to the handle. `toggleRepeat` writes `speakListRepeat` through `setSpeakOption` and, if playing, restarts at the current fraction — the running utterance was created with the old flag, so the toggle would otherwise take effect a lap later (same treatment `VerseCard.toggleSpeakRepeat` gives the per-verse flag).

### New: `src/lib/components/player/ScrubTrack.svelte`

Extracted verbatim from `VersePlayer.svelte`: the pointer-capture drag, the `scrubbing` hold so the thumb follows the finger, and the arrow-key seek in ten-second steps.

```ts
interface Props {
  fraction: number;
  totalMs: number;
  onSeek: (fraction: number) => void;
}
```

`VersePlayer.svelte` is rewritten to use it. It keeps its own file and its own tests; only the track markup moves out. This is a targeted refactor to avoid duplicating forty lines of pointer handling into the new bar — not a restructuring of the card player.

### New: `src/lib/components/player/PlaylistBar.svelte`

Presentational, same contract as `VersePlayer`: every piece of state arrives as a prop, no store reads, no playback calls.

```ts
interface Props {
  playing: boolean;
  label: string;        // e.g. "창세기 28:14"
  index: number;        // 1-based
  count: number;
  fraction: number;
  elapsedMs: number;
  totalMs: number;
  repeat: boolean;
  onToggle: () => void;
  onSeek: (fraction: number) => void;
  onToggleRepeat: () => void;
  onClose: () => void;
}
```

### Modified: `src/lib/db/events.ts`

`EventCardVM` gains the verse text for the whole event:

```ts
export interface EventCardVM {
  // ...existing
  /** Every range's verses, in range order, for 전체 듣기. Resolved during
   *  the build rather than on tap: iOS only honours speech reached
   *  synchronously from the gesture, so an IndexedDB read at tap time
   *  is silence on a phone. */
  verses: PlaylistVerse[];
}
```

`buildEventCards` already calls `loadPackageData` for `rangeLabel` and `resolveRangeVerseNos`, and that function is memoized module-level (`packageDataCache`), so resolving bodies costs no extra I/O. Verses are looked up by `no` in range order and appended per range.

`RangeCardVM` is left alone — the play control is per event, so per-range text would be carried for nobody.

### Modified: `src/lib/db/viewOptions.ts`

```ts
export interface SpeakOptionsStored {
  // ...existing
  /** Loop the whole list in 전체 듣기. Separate from `speakRepeat`, which
   *  means "loop this one verse forever" on a card — a reader who wants a
   *  list to come round again does not want every card to loop. */
  speakListRepeat: boolean;
}
```

Default `true`. Read and validated in `getSpeakOptions` alongside the others; written through the existing `setSpeakOption` write queue.

### Modified: `src/routes/settings/+page.svelte`

One more toggle in the 읽어주기 section, directly under the existing 무한 반복:

- Label: **전체 듣기 반복**
- Sublabel: 목록이 끝나면 처음부터 다시 재생합니다
- Same markup and handler shape as the `speakRepeat` toggle.

### Modified: `src/lib/components/home/EventSection.svelte`

- One `new PlaylistPlayer()` for the section.
- Play button in each event header; `onclick` calls `player.start('event:' + ev.eventId, ev.verses)` — synchronously.
- `PlaylistBar` rendered **once, outside the `{#each}`**, driven by `player.openId`. Multiple events on screen still yield one bar.
- The bar is `position: fixed`; no ancestor of it carries a `transform` (the hover lift is on `.event-card`, a sibling subtree), so it escapes the section correctly.

### Modified: `src/routes/bookmarks/+page.svelte`

- One `new PlaylistPlayer()`.
- 전체 듣기 button in the count row; `onclick` calls `player.start('bookmark:' + selected, visibleRows.map(r => r.verse))`.
- `PlaylistBar` rendered once at page level.
- An effect on `selected` calls `player.close()` when the color changes while a list is open.

## Data Flow

```
tap 전체 듣기
  └─ start(id, verses)                    [synchronous — iOS gesture rule]
       ├─ buildPlaylist(verses, {includeTitle: opts.speakTitle})
       │    └─ speechSegments() per verse → segments[] + tracks[]
       └─ createPlayer(segments, {rate, voice, gender, repeat: listRepeat})
            ├─ activeStop?.()             [relieve previous owner]
            └─ speechSynthesis.speak(...)

every 200ms and on each boundary event
  └─ onProgress({fraction, elapsedMs, totalMs})
       ├─ progress = p
       └─ trackAt(playlist, fraction) → PlaylistBar label "창세기 28:14 · 2/12"

scrub
  └─ onSeek(f) → handle.seek(f) → sliceFrom(segments, f × chars) → speak

list ends
  ├─ listRepeat  → createPlayer restarts at offset 0
  └─ otherwise   → onEnd → playing = false, bar stays open at 100%
```

## Error Handling & Edge Cases

| Situation | Behaviour |
|---|---|
| `isTtsSupported()` false | Button not rendered at all — the control is absent rather than offered and then failing. Matches `VerseCard`. |
| Event or color resolves to zero verses | Button hidden. |
| Verse with empty body and unparseable cite | Skipped by `buildPlaylist`; contributes no track. |
| `createPlayer` returns null | `start()` leaves `openId` null — no bar appears, nothing to get stuck in. |
| Utterance error mid-list | `createPlayer`'s existing `onerror → finish()` path fires `onEnd`; bar drops to paused rather than claiming to play. |
| Page unmounted while playing | `$effect` teardown calls `destroy()` — synthesis outlives the component, so a bar scrolled away must not leave a voice behind. |
| A card's play button tapped mid-list | Ownership registry stops the list through its own `stop()`; the bar reports paused. |
| Bookmark color switched mid-list | `close()` — what is heard must match what is on screen. |
| Settings changed mid-list | Picked up on the next `start()`, not mid-utterance. Repeat is the exception: it restarts at the current position so the toggle means something now. |

## Testing

Test-first, per repo practice.

**`tests/unit/playlist.test.ts`** (new)
- `buildPlaylist`: offsets accumulate across verses; `chars` equals the sum of segment lengths; `includeTitle` adds a leading segment and shifts subsequent offsets; a verse with no speakable content is skipped; an empty input yields an empty playlist.
- `trackAt`: fraction 0 → first track; a fraction inside track *n* → track *n*; exactly on a boundary → the track that starts there; fraction 1 → last track; empty playlist → null.

**`tests/unit/speak.test.ts`** (extend)
- Creating a second player stops the first through its `stop()`, and the first's `onEnd` fires exactly once.
- A stopped player does not clear a successor's ownership registration.
- A cancelled player with `repeat: true` does not restart.

**`tests/unit/viewOptions.test.ts`** (extend)
- `speakListRepeat` defaults to `true`; persists; a non-boolean stored value falls back to the default.

**`tests/unit/PlaylistBar.test.ts`** (new)
- Renders label and `n/total`; play/pause `aria-label` follows `playing`; repeat `aria-pressed` follows `repeat`; close fires `onClose`.

**`tests/unit/EventSection.test.ts`** (extend)
- No play button when TTS is unsupported or the event has no verses.
- Tapping the play button calls into the controller with that event's verses.

**`tests/e2e/home.spec.ts`** (extend)
- `addInitScript` stubs `window.speechSynthesis` (the harness has none today). Tap 전체 듣기 → bar appears with a now-playing label → close → bar gone.

## Open Questions

None. Both judgement calls raised in brainstorming were settled: bookmark color switch stops playback, and `speakListRepeat` defaults on.
