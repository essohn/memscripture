# 전체 듣기 (Listen All) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One control that reads a whole set of verses aloud in order — per 암송 DAY event on the home screen, and per ribbon color on the bookmarks screen — with a looping player bar and a default-on repeat setting.

**Architecture:** The entire list is flattened into a single `segments: string[]` and handed to the existing `createPlayer()`. Seeking, pausing, and looping therefore come from code that already ships; the only new engine code is a pure module that builds that array and maps a progress fraction back to "which verse is this". A per-page rune class owns the playback session, and two presentational components (an extracted scrub track, plus the bar) render it.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, Tailwind v4 (CSS variables), Dexie/IndexedDB, Web Speech API (`speechSynthesis`), Vitest + @testing-library/svelte (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-26-listen-all-design.md`

## Global Constraints

- **iOS gesture rule.** `PlaylistPlayer.start()` and every path from a tap to `speechSynthesis.speak()` MUST be synchronous. No `await` between the click handler and `createPlayer()`. iOS Safari silently refuses synthesis reached after the gesture ends. Stored options are preloaded into memory instead.
- **Korean UI copy.** All user-facing strings are Korean. Exact strings are given in each task; do not paraphrase them.
- **Colors come from CSS variables only** — `var(--color-accent)`, `var(--color-card)`, `var(--color-border)`, `var(--color-text)`, `var(--color-text-secondary)`, `var(--color-text-tertiary)`, `var(--color-elevated)`, `var(--color-accent-soft)`. Never a literal hex.
- **Tailwind v4 tree-shaking.** Never build a class or `var()` name by interpolation (`var(--color-ribbon-{c})` in a class string gets stripped from the production CSS). Interpolate inside a `style=` attribute, as `bookmarks/+page.svelte` already does.
- **Test commands:** `npm test` (all unit), `npx vitest run tests/unit/<file>` (one file), `npm run check` (svelte-check), `npm run test:e2e` (Playwright).
- **Repeat semantics:** `speakRepeat` means "loop this one verse" on a card. `speakListRepeat` means "loop the whole list" in 전체 듣기. They are separate keys and must never be conflated.
- **Branch:** `feat/listen-all`, already created. Commit after every task.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/memorize/playlist.ts` *(new)* | Pure: flatten verses into one segment array + track spans; map fraction → track. |
| `src/lib/memorize/speak.ts` *(modify)* | Add global-queue ownership; stop stale utterance handlers firing on cancel. |
| `src/lib/db/viewOptions.ts` *(modify)* | Add `speakListRepeat`, default `true`. |
| `src/lib/state/playlistPlayer.svelte.ts` *(new)* | The playback session: state, transport, option preloading. One per page. |
| `src/lib/components/player/ScrubTrack.svelte` *(new)* | The draggable progress track, extracted from `VersePlayer`. |
| `src/lib/components/player/PlaylistBar.svelte` *(new)* | The fixed bar. Presentational — all state via props. |
| `src/lib/components/card/VersePlayer.svelte` *(modify)* | Use the extracted `ScrubTrack`. |
| `src/lib/db/events.ts` *(modify)* | Carry each event's verse text on `EventCardVM`. |
| `src/lib/components/home/EventSection.svelte` *(modify)* | Header play button + one bar. |
| `src/routes/bookmarks/+page.svelte` *(modify)* | Color-header play button + one bar. |
| `src/routes/settings/+page.svelte` *(modify)* | 전체 듣기 반복 toggle. |

---

### Task 1: Playlist assembly

**Files:**
- Create: `src/lib/memorize/playlist.ts`
- Test: `tests/unit/playlist.test.ts`

**Interfaces:**
- Consumes: `speechSegments(verse, opts)` from `src/lib/memorize/speak.ts` — returns `string[]`, takes `{ title?: string; cite: string; w: string }` and `{ includeTitle?: boolean }`.
- Produces:
  - `interface PlaylistVerse { title?: string; cite: string; w: string }`
  - `interface PlaylistTrack { cite: string; title?: string; start: number; length: number }`
  - `interface Playlist { segments: string[]; tracks: PlaylistTrack[]; chars: number }`
  - `buildPlaylist(verses: PlaylistVerse[], opts?: { includeTitle?: boolean }): Playlist`
  - `trackAt(list: Playlist, fraction: number): { index: number; track: PlaylistTrack } | null`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/playlist.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildPlaylist, trackAt } from '../../src/lib/memorize/playlist';
import { speechSegments, totalChars } from '../../src/lib/memorize/speak';

const A = { cite: '창세기 28 : 14', w: '네 자손이 땅의 티끌 같이 되어' };
const B = { cite: '요한복음 3 : 16', w: '하나님이 세상을 이처럼 사랑하사' };
const TITLED = { title: '양  육', cite: '히브리서 11 : 24', w: '믿음으로 모세는' };

describe('buildPlaylist', () => {
	it('concatenates every verse into one segment array', () => {
		const list = buildPlaylist([A, B]);
		expect(list.segments).toEqual([...speechSegments(A), ...speechSegments(B)]);
	});

	// The offsets have to be in createPlayer's unit — the sum of raw segment
	// lengths — or seeking would land somewhere other than the bar says.
	it('chars equals what createPlayer will compute from the same segments', () => {
		const list = buildPlaylist([A, B]);
		expect(list.chars).toBe(totalChars(list.segments));
	});

	it('gives each verse a span that starts where the previous one ended', () => {
		const list = buildPlaylist([A, B]);
		expect(list.tracks).toHaveLength(2);
		expect(list.tracks[0].start).toBe(0);
		expect(list.tracks[1].start).toBe(list.tracks[0].length);
		expect(list.tracks[0].length + list.tracks[1].length).toBe(list.chars);
	});

	it('carries the cite and title onto the track', () => {
		const [track] = buildPlaylist([TITLED]).tracks;
		expect(track.cite).toBe('히브리서 11 : 24');
		expect(track.title).toBe('양  육');
	});

	it('includeTitle adds a leading segment and shifts the next verse along', () => {
		const plain = buildPlaylist([TITLED, A]);
		const titled = buildPlaylist([TITLED, A], { includeTitle: true });
		expect(titled.segments.length).toBe(plain.segments.length + 1);
		expect(titled.tracks[1].start).toBeGreaterThan(plain.tracks[1].start);
	});

	// A verse with nothing speakable would otherwise become a zero-length
	// track that trackAt could land on, showing a blank label mid-playback.
	it('skips a verse with no speakable content', () => {
		const list = buildPlaylist([A, { cite: '', w: '   ' }, B]);
		expect(list.tracks).toHaveLength(2);
		expect(list.tracks[1].cite).toBe('요한복음 3 : 16');
	});

	it('returns an empty playlist for no verses', () => {
		expect(buildPlaylist([])).toEqual({ segments: [], tracks: [], chars: 0 });
	});
});

describe('trackAt', () => {
	const list = buildPlaylist([A, B, TITLED]);

	it('returns the first track at 0', () => {
		expect(trackAt(list, 0)).toMatchObject({ index: 0 });
	});

	it('returns the track the fraction falls inside', () => {
		const midSecond = (list.tracks[1].start + list.tracks[1].length / 2) / list.chars;
		expect(trackAt(list, midSecond)).toMatchObject({ index: 1 });
	});

	// Exactly on a boundary belongs to the track that starts there — the
	// reader has just moved on to it, not stayed on the one that ended.
	it('a fraction exactly on a boundary belongs to the starting track', () => {
		expect(trackAt(list, list.tracks[1].start / list.chars)).toMatchObject({ index: 1 });
	});

	// The label at the end of a list should read as the final verse rather
	// than blanking out.
	it('returns the last track at 1', () => {
		expect(trackAt(list, 1)).toMatchObject({ index: 2 });
	});

	it('clamps out-of-range fractions instead of returning null', () => {
		expect(trackAt(list, -0.5)).toMatchObject({ index: 0 });
		expect(trackAt(list, 4)).toMatchObject({ index: 2 });
	});

	it('returns null only for an empty playlist', () => {
		expect(trackAt(buildPlaylist([]), 0.5)).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/playlist.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/memorize/playlist"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/memorize/playlist.ts`:

```ts
/**
 * A set of verses as one thing to listen to.
 *
 * The whole list becomes a single segment array, because that is what
 * createPlayer already takes: seeking, pausing and looping then come from the
 * player unchanged rather than from a playlist state machine that would have
 * to reimplement all three. What is left over is bookkeeping — remembering
 * which stretch of the script each verse occupies, so the bar can say which
 * one is being read.
 */

import { speechSegments } from './speak';

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
	/** Sum of segment lengths — the denominator a progress fraction is of.
	 *  Deliberately the same unit createPlayer's totalChars() computes, so an
	 *  offset means the same thing on both sides. */
	chars: number;
}

export function buildPlaylist(
	verses: PlaylistVerse[],
	opts: { includeTitle?: boolean } = {}
): Playlist {
	const segments: string[] = [];
	const tracks: PlaylistTrack[] = [];
	let start = 0;

	for (const verse of verses) {
		const segs = speechSegments(verse, opts);
		const length = segs.reduce((n, s) => n + s.length, 0);
		// Nothing to say — no cite that parses, no body. Skipped rather than
		// admitted as a zero-length track, which trackAt could land on and
		// which would show as a blank label mid-playback.
		if (length === 0) continue;
		segments.push(...segs);
		tracks.push({ cite: verse.cite, title: verse.title, start, length });
		start += length;
	}

	return { segments, tracks, chars: start };
}

/**
 * Which verse a progress fraction is inside.
 *
 * Scanned from the back so that a fraction landing exactly on a boundary
 * belongs to the track that starts there — the reader has moved on to it,
 * not stayed on the one that just ended — and so that 1 resolves to the last
 * track rather than falling off the end.
 */
export function trackAt(
	list: Playlist,
	fraction: number
): { index: number; track: PlaylistTrack } | null {
	if (list.tracks.length === 0) return null;
	const clamped = Math.min(1, Math.max(0, fraction));
	const offset = clamped * list.chars;
	for (let i = list.tracks.length - 1; i >= 0; i--) {
		if (offset >= list.tracks[i].start) return { index: i, track: list.tracks[i] };
	}
	return { index: 0, track: list.tracks[0] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/playlist.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/memorize/playlist.ts tests/unit/playlist.test.ts
git commit -m "feat(playlist): a set of verses as one script to read

The whole list becomes one segment array, so seeking, pausing and
looping come from createPlayer unchanged. What is left is remembering
which stretch of the script each verse occupies."
```

---

### Task 2: Global queue ownership in speak.ts

`speechSynthesis` is one global queue. Both `speak()` and `createPlayer()` call `synth.cancel()` on start, and that cancel fires the **previous** utterance's `onend`. In `createPlayer` that handler reads `if (stopped || paused) return; if (opts.repeat) { restart }` — and neither flag is set, because the player did not stop itself, it was cancelled out from under it. So a player with repeat armed restarts and two voices talk over each other.

The same fault turned inward breaks seeking: `playFrom` cancels to move position, the outgoing utterance's `onend` fires, and with repeat armed the reader is thrown back to offset 0 instead of where they scrubbed.

**Files:**
- Modify: `src/lib/memorize/speak.ts` (`speak()` and `createPlayer()` in the Playback and Player sections)
- Test: `tests/unit/speak.test.ts` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports. Existing `speak()` and `createPlayer()` signatures are unchanged; only their queue behaviour changes.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/speak.test.ts`. Add `vi`, `beforeEach`, `afterEach` to the existing `vitest` import, and add `createPlayer` and `speak` to the existing import from `../../src/lib/memorize/speak`.

```ts
// ─── Global queue ownership ─────────────────────────────────────────────────

/** The slice of the Web Speech API createPlayer touches. jsdom ships none of
 *  it, and a real one cannot be driven from a test. */
class FakeUtterance {
	text: string;
	lang = '';
	rate = 1;
	voice: unknown = null;
	onend: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onboundary: ((e: { charIndex: number }) => void) | null = null;
	constructor(text: string) {
		this.text = text;
	}
}

function installFakeSynth() {
	let current: FakeUtterance | null = null;
	const spoken: FakeUtterance[] = [];
	const synth = {
		speaking: false,
		pending: false,
		paused: false,
		getVoices: () => [{ name: 'Google 한국의', lang: 'ko-KR' }],
		speak(u: FakeUtterance) {
			current = u;
			spoken.push(u);
			synth.speaking = true;
		},
		// Chrome fires the current utterance's `end` on cancel. That is the
		// behaviour the ownership fix exists for, so the fake reproduces it.
		cancel() {
			const u = current;
			current = null;
			synth.speaking = false;
			u?.onend?.();
		},
		resume() {}
	};
	vi.stubGlobal('speechSynthesis', synth);
	vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
	return { synth, spoken };
}

describe('global queue ownership', () => {
	beforeEach(() => installFakeSynth());
	afterEach(() => vi.unstubAllGlobals());

	it('a new player relieves the previous one, which reports its end once', () => {
		const onEnd = vi.fn();
		const first = createPlayer(['가나다라마바사'], { onEnd });
		expect(first).not.toBeNull();

		const second = createPlayer(['아자차카타파하'], {});
		expect(second).not.toBeNull();

		expect(onEnd).toHaveBeenCalledTimes(1);
		second?.stop();
	});

	// The bug this exists for: the relieved player must not treat being
	// cancelled as "the verse finished" and start itself again.
	it('a repeating player does not restart when another takes the queue', () => {
		const { spoken } = installFakeSynth();
		const first = createPlayer(['가나다라마바사'], { repeat: true });
		const spokenAfterFirst = spoken.length;
		const second = createPlayer(['아자차카타파하'], {});
		// Exactly one new utterance — the second player's. A restart would have
		// added the first player's script back on top.
		expect(spoken.length).toBe(spokenAfterFirst + 1);
		expect(spoken[spoken.length - 1].text).toBe('아자차카타파하');
		first?.stop();
		second?.stop();
	});

	it('stopping a relieved player does not unregister its successor', () => {
		const first = createPlayer(['가나다라마바사'], {});
		const secondEnd = vi.fn();
		const second = createPlayer(['아자차카타파하'], { onEnd: secondEnd });
		first?.stop();
		expect(secondEnd).not.toHaveBeenCalled();
		second?.stop();
	});

	it('speak() also relieves a running player', () => {
		const onEnd = vi.fn();
		const player = createPlayer(['가나다라마바사'], { onEnd });
		void player;
		speak(['짧은 문장']);
		expect(onEnd).toHaveBeenCalledTimes(1);
	});

	// Seeking cancels to move position. The outgoing utterance's onend must
	// not be read as "the list finished" and loop the reader back to zero.
	it('seeking a repeating player moves there rather than back to the start', () => {
		const { spoken } = installFakeSynth();
		const player = createPlayer(['가나다라마바사아자차카타파하'], { repeat: true });
		const before = spoken.length;
		player?.seek(0.5);
		// One new utterance for the seek, and it is not the whole script again.
		expect(spoken.length).toBe(before + 1);
		expect(spoken[spoken.length - 1].text).not.toBe('가나다라마바사아자차카타파하');
		player?.stop();
	});
});
```

Each test that needs to read utterances calls `installFakeSynth()` itself to get its own `spoken` array; the `beforeEach` install serves the tests that only assert callbacks. Re-installing inside a test is harmless — `vi.stubGlobal` simply replaces.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/speak.test.ts -t "global queue ownership"`
Expected: FAIL. `a new player relieves the previous one` fails because the first player's `onEnd` is never called (its `finish()` is not reached — `onend` runs the non-repeat branch only if it gets that far, and for the repeat test it restarts). `seeking a repeating player` fails with the seek producing the full script from offset 0.

- [ ] **Step 3: Write the implementation**

In `src/lib/memorize/speak.ts`, immediately above `export function isTtsSupported()`, add:

```ts
/**
 * The playback currently holding the global speechSynthesis queue.
 *
 * There is one queue, so there is one owner. A new playback relieves the old
 * one through its own stop() rather than yanking the queue with cancel() —
 * cancel fires the outgoing utterance's `end`, which a repeating player reads
 * as "the verse finished" and answers by starting itself again. Two voices at
 * once was the symptom; this is the cause.
 */
let activeStop: (() => void) | null = null;

function claimSynth(stop: () => void): void {
	const previous = activeStop;
	// Registered before the previous owner is stopped, so that owner's own
	// release() sees it is no longer current and leaves the new one alone.
	activeStop = stop;
	if (previous !== stop) previous?.();
}

function releaseSynth(stop: () => void): void {
	if (activeStop === stop) activeStop = null;
}
```

**Edit A — `speak()`.** Replace the whole function body from `const synth = window.speechSynthesis;` down to its closing `}` with this. The only changes are the named `stop`, the `claimSynth`/`releaseSynth` calls, and the returned object; `finish` and `say` are unchanged from what is there now, reproduced so the ordering is unambiguous.

```ts
	const synth = window.speechSynthesis;

	let stopped = false;
	let keepalive: ReturnType<typeof setInterval> | null = null;

	// Named rather than inline so it can be handed to claimSynth as this
	// playback's identity: the next playback relieves it by calling this.
	function stop() {
		// Order matters: mark stopped first so the chained onend does not
		// start the next segment as cancel() tears the current one down.
		const wasStopped = stopped;
		stopped = true;
		if (keepalive !== null) clearInterval(keepalive);
		releaseSynth(stop);
		synth.cancel();
		if (!wasStopped) opts.onEnd?.();
	}

	claimSynth(stop);
	// Still guarded rather than unconditional: on iOS a cancel() immediately
	// followed by speak() in the same tick swallows the utterance, so nothing
	// is cancelled when there was nothing to cancel. claimSynth has already
	// relieved any playback this module started; this covers a queue left busy
	// by something outside it.
	if (synth.speaking || synth.pending) synth.cancel();

	function finish() {
		if (stopped) return;
		stopped = true;
		if (keepalive !== null) clearInterval(keepalive);
		releaseSynth(stop);
		opts.onEnd?.();
	}

	function say(index: number) {
		if (stopped) return;
		if (index >= segments.length) {
			if (opts.repeat) {
				say(0);
				return;
			}
			finish();
			return;
		}
		const u = new SpeechSynthesisUtterance(segments[index]);
		u.lang = 'ko-KR';
		// Chosen explicitly. With only `lang` set the platform picks, and on
		// macOS the character voices sort ahead of the narration one.
		const chosen = pickKoreanVoice(synth.getVoices(), {
			wanted: opts.voice,
			gender: opts.gender
		});
		if (chosen) u.voice = chosen as SpeechSynthesisVoice;
		u.rate = opts.rate ?? 1;
		u.onend = () => say(index + 1);
		// An error would otherwise leave the caller stuck showing "playing"
		// forever, the same way dictation did.
		u.onerror = () => finish();
		synth.speak(u);
	}

	keepalive = setInterval(() => {
		if (stopped) return;
		if (synth.speaking && !synth.paused) synth.resume();
	}, KEEPALIVE_MS);

	say(0);

	return { stop };
}
```

**Edit B — `createPlayer()`, the detach helper.** Insert immediately above `function playFrom(offset: number) {`:

```ts
	/**
	 * Silences the outgoing utterance before the synth is cancelled.
	 *
	 * cancel() fires `end` on whatever is speaking. Inside playFrom that
	 * utterance is our own, one line from being replaced — and its handler
	 * would read the cancel as "the script finished" and, with repeat armed,
	 * throw the reader back to offset 0 instead of to where they scrubbed.
	 */
	function detachCurrent() {
		if (!current) return;
		current.onend = null;
		current.onboundary = null;
		current.onerror = null;
	}
```

**Edit C — `createPlayer()`, inside `playFrom`.** Find:

```ts
		u.onerror = () => finish();
		current = u;
		if (synth.speaking || synth.pending) synth.cancel();
		synth.speak(u);
```

Replace with:

```ts
		u.onerror = () => finish();
		detachCurrent();
		current = u;
		if (synth.speaking || synth.pending) synth.cancel();
		synth.speak(u);
```

**Edit D — `createPlayer()`, `finish()`.** Find:

```ts
	function finish() {
		if (stopped) return;
		stopped = true;
		if (ticker !== null) clearInterval(ticker);
		opts.onProgress?.({ fraction: 1, elapsedMs: totalMs, totalMs });
		opts.onEnd?.();
	}
```

Replace with:

```ts
	function finish() {
		if (stopped) return;
		stopped = true;
		if (ticker !== null) clearInterval(ticker);
		releaseSynth(stop);
		opts.onProgress?.({ fraction: 1, elapsedMs: totalMs, totalMs });
		opts.onEnd?.();
	}

	// Named for the same reason speak()'s is: this is the handle claimSynth
	// holds, and the way the next playback relieves this one.
	function stop() {
		if (stopped) return;
		stopped = true;
		if (ticker !== null) clearInterval(ticker);
		releaseSynth(stop);
		detachCurrent();
		synth.cancel();
		current = null;
		opts.onEnd?.();
	}
```

**Edit E — `createPlayer()`, claim the queue.** Find:

```ts
	startedAt = Date.now();
	playFrom(0);
```

Replace with:

```ts
	claimSynth(stop);
	startedAt = Date.now();
	playFrom(0);
```

**Edit F — `createPlayer()`, `pause()`.** A pause is not the end of the list either. Find:

```ts
		pause() {
			if (stopped || paused) return;
			paused = true;
			elapsedBefore += Date.now() - startedAt;
			synth.cancel();
			report();
		},
```

Replace with:

```ts
		pause() {
			if (stopped || paused) return;
			paused = true;
			elapsedBefore += Date.now() - startedAt;
			detachCurrent();
			synth.cancel();
			report();
		},
```

**Edit G — `createPlayer()`, the returned handle.** Replace the whole inline `stop() { ... }` member of the returned object with the shorthand `stop`, so the returned object ends:

```ts
		seek(fraction) {
			// ...unchanged...
		},
		stop
	};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/speak.test.ts`
Expected: PASS — the new `global queue ownership` block plus every pre-existing test in the file.

Then run the whole suite, because `VerseCard.memorize.test.ts` exercises this code:

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/memorize/speak.ts tests/unit/speak.test.ts
git commit -m "fix(speak): one queue, one owner

speechSynthesis is a single global queue and cancel() fires the
outgoing utterance's end. A repeating player read that as 'the verse
finished' and started itself again, so two voices talked over each
other; the same fault turned inward sent a seek back to offset 0.
A new playback now relieves the old one through its own stop(), and
an utterance about to be replaced is silenced first."
```

---

### Task 3: `speakListRepeat` setting

**Files:**
- Modify: `src/lib/db/viewOptions.ts:75-113` (`SpeakOptionsStored`, `SPEAK_DEFAULTS`, `getSpeakOptions`)
- Modify: `src/routes/settings/+page.svelte` (script state ~line 96, load block ~line 120, markup after the 무한 반복 label ~line 450)
- Test: `tests/unit/viewOptions.test.ts` (append)

**Interfaces:**
- Consumes: existing `setSpeakOption<K>(key, value)` and `getSpeakOptions()`.
- Produces: `SpeakOptionsStored.speakListRepeat: boolean`, default `true`.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/viewOptions.test.ts`, inside the existing `describe('viewOptions', ...)` block:

```ts
	// Separate from speakRepeat on purpose. That one means "loop this one
	// verse forever" on a card; a reader who wants a list to come round again
	// does not want every card to loop.
	it('speakListRepeat defaults to true', async () => {
		expect((await getSpeakOptions()).speakListRepeat).toBe(true);
	});

	it('round-trips speakListRepeat false', async () => {
		await setSpeakOption('speakListRepeat', false);
		expect((await getSpeakOptions()).speakListRepeat).toBe(false);
	});

	it('falls back to the default when speakListRepeat is not a boolean', async () => {
		await db.settings.put({ key: 'view_options', value: { speakListRepeat: 'yes' } });
		expect((await getSpeakOptions()).speakListRepeat).toBe(true);
	});

	it('leaves speakRepeat alone when speakListRepeat is written', async () => {
		await setSpeakOption('speakRepeat', true);
		await setSpeakOption('speakListRepeat', false);
		const opts = await getSpeakOptions();
		expect(opts.speakRepeat).toBe(true);
		expect(opts.speakListRepeat).toBe(false);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/viewOptions.test.ts -t speakListRepeat`
Expected: FAIL — `expected undefined to be true`, plus a TypeScript error on `setSpeakOption('speakListRepeat', ...)`.

- [ ] **Step 3: Write the implementation**

In `src/lib/db/viewOptions.ts`, add to `SpeakOptionsStored` after `speakRepeat`:

```ts
	/** Loop the whole list in 전체 듣기. Separate from speakRepeat, which means
	 *  "loop this one verse forever" on a card — a reader who wants a list to
	 *  come round again does not want every card to loop. On by default:
	 *  reaching for 전체 듣기 is usually about soaking in a set. */
	speakListRepeat: boolean;
```

Add to `SPEAK_DEFAULTS`:

```ts
	speakListRepeat: true,
```

Add to the object `getSpeakOptions()` returns:

```ts
		speakListRepeat:
			typeof raw.speakListRepeat === 'boolean'
				? raw.speakListRepeat
				: SPEAK_DEFAULTS.speakListRepeat,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/viewOptions.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the settings toggle**

In `src/routes/settings/+page.svelte`, beside `let speakRepeat = $state(false);`:

```ts
	let speakListRepeat = $state(true);
```

In the block that copies loaded options onto state (beside `speakRepeat = o.speakRepeat;`):

```ts
				speakListRepeat = o.speakListRepeat;
```

In the markup, directly after the closing `</label>` of the 무한 반복 toggle:

```svelte
		<label class="mt-3 flex items-center justify-between gap-3">
			<span class="text-[13px] text-[var(--color-text)]">
				전체 듣기 반복
				<span class="block text-[11px] text-[var(--color-text-tertiary)]">
					목록이 끝나면 처음부터 다시 재생합니다
				</span>
			</span>
			<input
				type="checkbox"
				checked={speakListRepeat}
				onchange={(e) => {
					speakListRepeat = e.currentTarget.checked;
					setSpeakOption('speakListRepeat', speakListRepeat);
				}}
				class="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
			/>
		</label>
```

- [ ] **Step 6: Verify types and the full suite**

Run: `npm run check`
Expected: no new errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/viewOptions.ts src/routes/settings/+page.svelte tests/unit/viewOptions.test.ts
git commit -m "feat(settings): 전체 듣기 반복, separate from the per-verse loop

speakRepeat means 'loop this one verse' on a card. Looping a list is a
different wish, so it gets its own key rather than borrowing that one.
On by default: reaching for 전체 듣기 is usually about soaking in a set."
```

---

### Task 4: Extract the scrub track

`VersePlayer.svelte` holds about forty lines of pointer-capture drag handling. The playlist bar needs the same track, and copying it would leave two of them to keep in step.

**Files:**
- Create: `src/lib/components/player/ScrubTrack.svelte`
- Modify: `src/lib/components/card/VersePlayer.svelte`
- Test: `tests/unit/ScrubTrack.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ScrubTrack.svelte` with props `{ fraction: number; totalMs: number; onSeek: (fraction: number) => void }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ScrubTrack.test.ts`:

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import ScrubTrack from '../../src/lib/components/player/ScrubTrack.svelte';

const props = { fraction: 0.25, totalMs: 60_000, onSeek: () => {} };

describe('ScrubTrack', () => {
	it('exposes the position as a slider', () => {
		render(ScrubTrack, { props });
		const slider = screen.getByRole('slider', { name: '재생 위치' });
		expect(slider).toHaveAttribute('aria-valuenow', '25');
	});

	// Ten seconds' worth is the granularity that is useful in a verse, rather
	// than the one that is easy to implement.
	it('arrow right seeks forward ten seconds', async () => {
		const onSeek = vi.fn();
		render(ScrubTrack, { props: { ...props, onSeek } });
		await fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
		expect(onSeek).toHaveBeenCalledWith(0.25 + 10_000 / 60_000);
	});

	it('arrow left seeks back and never below zero', async () => {
		const onSeek = vi.fn();
		render(ScrubTrack, { props: { ...props, fraction: 0.05, onSeek } });
		await fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' });
		expect(onSeek).toHaveBeenCalledWith(0);
	});

	it('ignores keys that are not seeks', async () => {
		const onSeek = vi.fn();
		render(ScrubTrack, { props: { ...props, onSeek } });
		await fireEvent.keyDown(screen.getByRole('slider'), { key: 'Enter' });
		expect(onSeek).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ScrubTrack.test.ts`
Expected: FAIL — `Failed to resolve import ".../components/player/ScrubTrack.svelte"`.

- [ ] **Step 3: Write the component**

Create `src/lib/components/player/ScrubTrack.svelte`, moving the logic verbatim out of `VersePlayer.svelte`:

```svelte
<script lang="ts">
	/**
	 * The draggable position track, shared by the card player and the playlist
	 * bar. Extracted so the two do not drift apart — the pointer-capture
	 * handling below is the fiddly part, and there should be one of it.
	 */
	interface Props {
		fraction: number;
		totalMs: number;
		onSeek: (fraction: number) => void;
	}
	let { fraction, totalMs, onSeek }: Props = $props();

	let track = $state<HTMLDivElement | undefined>();
	/** Held while dragging, so the thumb follows the finger instead of snapping
	 *  back to whatever the synthesizer last reported. */
	let scrubbing = $state<number | null>(null);
	const shown = $derived(scrubbing ?? fraction);

	function fractionAt(clientX: number): number {
		if (!track) return 0;
		const r = track.getBoundingClientRect();
		return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
	}

	function onPointerDown(e: PointerEvent) {
		scrubbing = fractionAt(e.clientX);
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}
	function onPointerMove(e: PointerEvent) {
		if (scrubbing === null) return;
		scrubbing = fractionAt(e.clientX);
	}
	function onPointerUp(e: PointerEvent) {
		if (scrubbing === null) return;
		const to = scrubbing;
		scrubbing = null;
		const t = e.currentTarget as Element;
		if (t.hasPointerCapture(e.pointerId)) t.releasePointerCapture(e.pointerId);
		onSeek(to);
	}

	// Arrow keys move by ten seconds' worth, which is the granularity that is
	// useful in a verse rather than the one that is easy to implement.
	function onKeydown(e: KeyboardEvent) {
		const step = totalMs > 0 ? 10_000 / totalMs : 0.1;
		if (e.key === 'ArrowRight') onSeek(Math.min(1, fraction + step));
		else if (e.key === 'ArrowLeft') onSeek(Math.max(0, fraction - step));
		else return;
		e.preventDefault();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={track}
	role="slider"
	tabindex="0"
	aria-label="재생 위치"
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={Math.round(shown * 100)}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	onkeydown={onKeydown}
	class="group relative h-6 min-w-0 flex-1 cursor-pointer touch-none"
>
	<div
		class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--color-border)]"
	></div>
	<div
		class="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--color-accent)]"
		style="width: {shown * 100}%"
	></div>
	<div
		class="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-accent)] shadow"
		style="left: {shown * 100}%"
	></div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ScrubTrack.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Use it from VersePlayer**

In `src/lib/components/card/VersePlayer.svelte`:

- Add `import ScrubTrack from '$lib/components/player/ScrubTrack.svelte';` under the lucide import.
- Delete `let track`, `let scrubbing`, `const shown`, `fractionAt`, `onPointerDown`, `onPointerMove`, `onPointerUp`, and `onKeydown` from the script.
- Replace the whole `<!-- svelte-ignore ... -->` + slider `<div>` block in the markup with:

```svelte
	<ScrubTrack {fraction} {totalMs} {onSeek} />
```

- The time readout below it currently reads `{mmss(shown * totalMs)}`. `shown` is gone; change it to `{mmss(fraction * totalMs)}`. The elapsed time now follows the reported position rather than the finger mid-drag, which matches what every other player does.

- [ ] **Step 6: Verify nothing regressed**

Run: `npm run check`
Expected: no new errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/player/ScrubTrack.svelte src/lib/components/card/VersePlayer.svelte tests/unit/ScrubTrack.test.ts
git commit -m "refactor(player): one scrub track, shared

The playlist bar needs the same draggable track the card player has.
Pointer capture is the fiddly part and there should be one of it."
```

---

### Task 5: The playlist bar

**Files:**
- Create: `src/lib/components/player/PlaylistBar.svelte`
- Test: `tests/unit/PlaylistBar.test.ts`

**Interfaces:**
- Consumes: `ScrubTrack.svelte` from Task 4.
- Produces: `PlaylistBar.svelte` with props
  `{ playing: boolean; label: string; index: number; count: number; fraction: number; elapsedMs: number; totalMs: number; repeat: boolean; onToggle: () => void; onSeek: (f: number) => void; onToggleRepeat: () => void; onClose: () => void }`.
  `index` is 1-based.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/PlaylistBar.test.ts`:

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import PlaylistBar from '../../src/lib/components/player/PlaylistBar.svelte';

const props = {
	playing: true,
	label: '창세기 28:14',
	index: 2,
	count: 12,
	fraction: 0.2,
	elapsedMs: 72_000,
	totalMs: 400_000,
	repeat: true,
	onToggle: () => {},
	onSeek: () => {},
	onToggleRepeat: () => {},
	onClose: () => {}
};

describe('PlaylistBar', () => {
	it('names the verse being read and its place in the list', () => {
		render(PlaylistBar, { props });
		expect(screen.getByText('창세기 28:14')).toBeInTheDocument();
		expect(screen.getByText('2/12')).toBeInTheDocument();
	});

	it('shows elapsed and total time', () => {
		render(PlaylistBar, { props });
		expect(screen.getByText('1:12 / 6:40')).toBeInTheDocument();
	});

	// The tap has to promise what it does: pause while playing, play while not.
	it('the transport button follows the playing state', () => {
		const { unmount } = render(PlaylistBar, { props });
		expect(screen.getByRole('button', { name: '일시정지' })).toBeInTheDocument();
		unmount();
		render(PlaylistBar, { props: { ...props, playing: false } });
		expect(screen.getByRole('button', { name: '재생' })).toBeInTheDocument();
	});

	it('the repeat toggle reports whether it is armed', () => {
		const { unmount } = render(PlaylistBar, { props });
		expect(screen.getByRole('button', { name: '목록 반복' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		unmount();
		render(PlaylistBar, { props: { ...props, repeat: false } });
		expect(screen.getByRole('button', { name: '목록 반복' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
	});

	it('calls back on toggle, repeat and close', async () => {
		const onToggle = vi.fn();
		const onToggleRepeat = vi.fn();
		const onClose = vi.fn();
		render(PlaylistBar, { props: { ...props, onToggle, onToggleRepeat, onClose } });
		await fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
		await fireEvent.click(screen.getByRole('button', { name: '목록 반복' }));
		await fireEvent.click(screen.getByRole('button', { name: '재생 닫기' }));
		expect(onToggle).toHaveBeenCalledTimes(1);
		expect(onToggleRepeat).toHaveBeenCalledTimes(1);
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/PlaylistBar.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `src/lib/components/player/PlaylistBar.svelte`:

```svelte
<script lang="ts">
	import { Pause, Play, Repeat, X } from 'lucide-svelte';
	import ScrubTrack from './ScrubTrack.svelte';

	/**
	 * The transport for a whole list, docked above the tab bar.
	 *
	 * Fixed rather than inline: a twelve-verse list is longer than a screen,
	 * and a reader who scrolls to follow along must not have to scroll back to
	 * find the stop button. Presentational like VersePlayer — every piece of
	 * state arrives as a prop, so the page owns the playback and this owns
	 * only how it looks.
	 */
	interface Props {
		playing: boolean;
		/** The verse being read, e.g. "창세기 28:14". */
		label: string;
		/** 1-based place in the list. */
		index: number;
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
	let {
		playing,
		label,
		index,
		count,
		fraction,
		elapsedMs,
		totalMs,
		repeat,
		onToggle,
		onSeek,
		onToggleRepeat,
		onClose
	}: Props = $props();

	function mmss(ms: number): string {
		const s = Math.max(0, Math.floor(ms / 1000));
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}
</script>

<!--
	z-40, under the tab bar's z-50: a player is something you reach for, but
	never at the cost of covering the way out of the screen.
-->
<div
	class="playlist-bar fixed inset-x-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-card)]"
>
	<div class="mx-auto flex max-w-2xl flex-col gap-1.5 px-5 py-2.5">
		<div class="flex items-center gap-2.5">
			<button
				type="button"
				onclick={onToggle}
				aria-label={playing ? '일시정지' : '재생'}
				class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white transition-opacity hover:opacity-90"
			>
				{#if playing}
					<Pause size={14} strokeWidth={2.5} fill="currentColor" />
				{:else}
					<Play size={14} strokeWidth={2.5} fill="currentColor" />
				{/if}
			</button>

			<p class="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-text)]">
				{label}
			</p>
			<!-- Never truncates: which verse of how many is the one thing this
			     bar exists to say that the card player could not. -->
			<span class="shrink-0 text-[12px] tabular-nums text-[var(--color-text-tertiary)]">
				{index}/{count}
			</span>

			<button
				type="button"
				onclick={onToggleRepeat}
				aria-pressed={repeat}
				aria-label="목록 반복"
				class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors {repeat
					? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
					: 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-elevated)]'}"
			>
				<Repeat size={13} strokeWidth={2} />
			</button>
			<button
				type="button"
				onclick={onClose}
				aria-label="재생 닫기"
				class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
			>
				<X size={14} strokeWidth={2} />
			</button>
		</div>

		<div class="flex items-center gap-2.5">
			<ScrubTrack {fraction} {totalMs} {onSeek} />
			<span class="shrink-0 text-[11px] tabular-nums text-[var(--color-text-secondary)]">
				{mmss(elapsedMs)} / {mmss(totalMs)}
			</span>
		</div>
	</div>
</div>

<style>
	/* Sits on top of the tab bar's own height (h-16) plus whatever the device
	   reserves below it. */
	.playlist-bar {
		bottom: calc(4rem + env(safe-area-inset-bottom));
		box-shadow: var(--shadow-card-hover);
	}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/PlaylistBar.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/player/PlaylistBar.svelte tests/unit/PlaylistBar.test.ts
git commit -m "feat(player): a transport for a whole list

Fixed above the tab bar rather than inline: a twelve-verse list is
longer than a screen, and following along must not cost you the stop
button."
```

---

### Task 6: The playback session

**Files:**
- Create: `src/lib/state/playlistPlayer.svelte.ts`
- Test: `tests/unit/playlistPlayer.test.ts`

**Interfaces:**
- Consumes: `buildPlaylist`, `trackAt`, `PlaylistVerse`, `Playlist`, `PlaylistTrack` (Task 1); `createPlayer`, `isTtsSupported`, `PlayerHandle`, `PlayerProgress` from `speak.ts`; `getSpeakOptions`, `setSpeakOption`, `SpeakOptionsStored` (Task 3).
- Produces: `export class PlaylistPlayer` with
  `supported: boolean`, getters `playing`, `progress`, `listRepeat`, `openId`, `nowPlaying`, `index`, `count`,
  and methods `load(): Promise<void>`, `start(id: string, verses: PlaylistVerse[]): void`, `toggle(): void`, `seek(f: number): void`, `toggleRepeat(): Promise<void>`, `close(): void`, `destroy(): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/playlistPlayer.test.ts`. It reuses the fake synth shape from Task 2; define it locally rather than exporting it from a test file.

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../src/lib/db/local';
import { setSpeakOption } from '../../src/lib/db/viewOptions';
import { createPlayer } from '../../src/lib/memorize/speak';
import { PlaylistPlayer } from '../../src/lib/state/playlistPlayer.svelte';

class FakeUtterance {
	text: string;
	lang = '';
	rate = 1;
	voice: unknown = null;
	onend: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onboundary: ((e: { charIndex: number }) => void) | null = null;
	constructor(text: string) {
		this.text = text;
	}
}

let spoken: FakeUtterance[] = [];
let current: FakeUtterance | null = null;

function installFakeSynth() {
	spoken = [];
	current = null;
	const synth = {
		speaking: false,
		pending: false,
		paused: false,
		getVoices: () => [{ name: 'Google 한국의', lang: 'ko-KR' }],
		speak(u: FakeUtterance) {
			current = u;
			spoken.push(u);
			synth.speaking = true;
		},
		cancel() {
			const u = current;
			current = null;
			synth.speaking = false;
			u?.onend?.();
		},
		resume() {}
	};
	vi.stubGlobal('speechSynthesis', synth);
	vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
}

const VERSES = [
	{ cite: '창세기 28 : 14', w: '네 자손이 땅의 티끌 같이 되어' },
	{ cite: '요한복음 3 : 16', w: '하나님이 세상을 이처럼 사랑하사' }
];

let player: PlaylistPlayer;

beforeEach(async () => {
	await db.delete();
	await db.open();
	installFakeSynth();
	player = new PlaylistPlayer();
});

afterEach(() => {
	player.destroy();
	vi.unstubAllGlobals();
});

describe('PlaylistPlayer', () => {
	it('starts closed', () => {
		expect(player.openId).toBeNull();
		expect(player.playing).toBe(false);
	});

	it('opens on the id it was given and starts speaking', () => {
		player.start('event:e1', VERSES);
		expect(player.openId).toBe('event:e1');
		expect(player.playing).toBe(true);
		expect(spoken).toHaveLength(1);
	});

	it('names the first verse and the list length', () => {
		player.start('event:e1', VERSES);
		expect(player.nowPlaying?.cite).toBe('창세기 28 : 14');
		expect(player.index).toBe(1);
		expect(player.count).toBe(2);
	});

	// Nothing to say means nothing to open. A bar with no content is worse
	// than no bar.
	it('does not open on an empty list', () => {
		player.start('event:empty', []);
		expect(player.openId).toBeNull();
		expect(player.playing).toBe(false);
	});

	it('pauses and resumes without closing the bar', () => {
		player.start('event:e1', VERSES);
		player.toggle();
		expect(player.playing).toBe(false);
		expect(player.openId).toBe('event:e1');
		player.toggle();
		expect(player.playing).toBe(true);
	});

	it('close stops playback and dismisses the bar', () => {
		player.start('event:e1', VERSES);
		player.close();
		expect(player.openId).toBeNull();
		expect(player.playing).toBe(false);
		expect(player.progress.fraction).toBe(0);
	});

	// The reader's stored preference is what the list loops by, and it is on
	// unless they turned it off.
	it('loads the stored repeat preference', async () => {
		await setSpeakOption('speakListRepeat', false);
		await player.load();
		expect(player.listRepeat).toBe(false);
	});

	it('toggling repeat persists it and keeps playing', async () => {
		await player.load();
		player.start('event:e1', VERSES);
		expect(player.listRepeat).toBe(true);
		// Awaited because getSpeakOptions() does not await the write queue: the
		// `fresh.load()` below would otherwise read the old value out from under
		// a write still in flight. toggleRepeat returns the write for exactly
		// this, the way fontScale.pick() does.
		await player.toggleRepeat();
		expect(player.listRepeat).toBe(false);
		expect(player.playing).toBe(true);
		const fresh = new PlaylistPlayer();
		await fresh.load();
		expect(fresh.listRepeat).toBe(false);
	});

	// A card's play button takes the global queue, and it does so by creating
	// its own player — which is what the ownership registry relieves us
	// through. The bar must fall back to paused rather than claim to be
	// playing something it no longer owns.
	it('reports paused when another playback takes the queue', () => {
		player.start('event:e1', VERSES);
		const other = createPlayer(['다른 문장을 읽습니다'], {});
		expect(player.playing).toBe(false);
		expect(player.openId).toBe('event:e1');
		other?.stop();
	});

	it('resumes from where it was after losing the queue', () => {
		player.start('event:e1', VERSES);
		const other = createPlayer(['다른 문장을 읽습니다'], {});
		other?.stop();
		const before = spoken.length;
		player.toggle();
		expect(player.playing).toBe(true);
		expect(spoken.length).toBe(before + 1);
	});

	// start() kicks off an unawaited options read on its way out. A toggle made
	// before that read lands must not be reverted by it — otherwise a reader who
	// taps 전체 듣기 and then the repeat button watches their choice flip back.
	it('a toggle during an in-flight load wins over the load', async () => {
		await player.load();
		player.start('event:e1', VERSES);
		// No await between start() and the toggle: start()'s load() is still in
		// flight here, which is exactly the window under test.
		const written = player.toggleRepeat();
		expect(player.listRepeat).toBe(false);
		await written;
		await Promise.resolve();
		expect(player.listRepeat).toBe(false);
	});

	it('starting a second list replaces the first', () => {
		player.start('event:e1', VERSES);
		player.start('bookmark:red', [VERSES[1]]);
		expect(player.openId).toBe('bookmark:red');
		expect(player.count).toBe(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/playlistPlayer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/state/playlistPlayer.svelte.ts`:

```ts
import {
	buildPlaylist,
	trackAt,
	type Playlist,
	type PlaylistTrack,
	type PlaylistVerse
} from '$lib/memorize/playlist';
import {
	createPlayer,
	isTtsSupported,
	type PlayerHandle,
	type PlayerProgress
} from '$lib/memorize/speak';
import { getSpeakOptions, setSpeakOption, type SpeakOptionsStored } from '$lib/db/viewOptions';

const IDLE: PlayerProgress = { fraction: 0, elapsedMs: 0, totalMs: 0 };

/** Mirrors SPEAK_DEFAULTS. Held here so start() has something to speak with
 *  before load() resolves — see the note on start(). */
const OPTION_DEFAULTS: SpeakOptionsStored = {
	speakTitle: false,
	speakRate: 0.9,
	speakRepeat: false,
	speakVoice: '',
	speakGender: 'auto',
	speakListRepeat: true
};

/**
 * One reading of one list.
 *
 * A class with $state fields, like fontScale — but exported as the class
 * rather than as an instance. A font size is one global preference; a
 * playback session belongs to the page that started it, so home and bookmarks
 * each build their own and each tears its own down.
 */
export class PlaylistPlayer {
	/** Whether the platform speaks at all. Decided once: the control is absent
	 *  rather than offered and then failing. */
	readonly supported = isTtsSupported();

	/**
	 * Stored options, held in memory.
	 *
	 * Preloaded on purpose. iOS Safari honours speechSynthesis.speak() only
	 * when it is reached synchronously from the tap that triggered it, so
	 * reading these from IndexedDB inside start() would end the gesture and
	 * the phone would stay silent, with no error and no sound. VerseCard
	 * carries the same note for the same reason.
	 */
	#opts = $state<SpeakOptionsStored>({ ...OPTION_DEFAULTS });

	#openId = $state<string | null>(null);
	#playing = $state(false);
	#progress = $state<PlayerProgress>(IDLE);
	/** Raw: the segment array is long and nothing reads into it reactively. */
	#list = $state.raw<Playlist | null>(null);
	#handle: PlayerHandle | null = null;

	get playing(): boolean {
		return this.#playing;
	}
	get progress(): PlayerProgress {
		return this.#progress;
	}
	get listRepeat(): boolean {
		return this.#opts.speakListRepeat;
	}
	/** Which list is open, or null. `event:<id>` from home, `bookmark:<color>`
	 *  from bookmarks — the page names its own lists. */
	get openId(): string | null {
		return this.#openId;
	}
	get count(): number {
		return this.#list?.tracks.length ?? 0;
	}
	get nowPlaying(): PlaylistTrack | null {
		if (!this.#list) return null;
		return trackAt(this.#list, this.#progress.fraction)?.track ?? null;
	}
	/** 1-based, or 0 when nothing is open. */
	get index(): number {
		if (!this.#list) return 0;
		const at = trackAt(this.#list, this.#progress.fraction);
		return at ? at.index + 1 : 0;
	}

	/**
	 * Bumped by toggleRepeat().
	 *
	 * load() is a single IndexedDB read that can still be in flight when the
	 * reader changes a setting — start() kicks one off on its way out, and the
	 * bar's repeat toggle is one tap away from the button that just called
	 * start(). Without this, that read completing after the choice would
	 * overwrite it with the stale stored value and the toggle would visibly
	 * flip back. A reader's action must win over a load that was already
	 * running when it landed. Same guard, same reason, as fontScale.
	 */
	#version = 0;

	/** Reads stored options into memory. Called from the page's $effect, and
	 *  again after each start() — never from inside one. */
	async load(): Promise<void> {
		const versionBeforeLoad = this.#version;
		try {
			const stored = await getSpeakOptions();
			// else: a toggle landed while this read was in flight. Its value is
			// newer than what we just read — keep it.
			if (this.#version === versionBeforeLoad) this.#opts = stored;
		} catch {
			// Leave the defaults. A failed preference read must not mute the app.
		}
	}

	/**
	 * Begins a list.
	 *
	 * Do NOT make this async. Everything it needs is already in memory
	 * precisely so that the path from tap to speak() has no await in it.
	 */
	start(id: string, verses: PlaylistVerse[]): void {
		const list = buildPlaylist(verses, { includeTitle: this.#opts.speakTitle });
		if (list.tracks.length === 0) return;
		this.#handle?.stop();
		this.#progress = IDLE;
		if (!this.#play(list, 0)) return;
		this.#list = list;
		this.#openId = id;
		// Pick up a settings change for next time, now that the gesture is spent.
		void this.load();
	}

	toggle(): void {
		if (this.#playing) {
			this.#handle?.pause();
			this.#playing = false;
			return;
		}
		if (this.#handle) {
			this.#handle.resume();
			this.#playing = true;
			return;
		}
		// No handle: something else took the global queue, or the list ran out.
		// Start again from where the bar says we are — at the very end, from
		// the top, since "play" on a finished list means play it again.
		if (!this.#list) return;
		const at = this.#progress.fraction;
		this.#play(this.#list, at >= 1 ? 0 : at);
	}

	seek(fraction: number): void {
		this.#handle?.seek(fraction);
	}

	/**
	 * Applies immediately, then persists.
	 *
	 * The returned promise is the write, not the change: the bar ignores it so
	 * the tap never waits on storage, while a caller that needs to know the
	 * choice landed can await it. Same contract as fontScale.pick(), and for
	 * the same reason — getSpeakOptions() reads without awaiting the module's
	 * write queue, so an unawaited write can lose a race to a read issued
	 * right behind it.
	 */
	toggleRepeat(): Promise<void> {
		this.#version++;
		const next = !this.#opts.speakListRepeat;
		this.#opts = { ...this.#opts, speakListRepeat: next };
		const written = setSpeakOption('speakListRepeat', next).catch(() => {});
		// The running utterance was created with the old setting, so restart to
		// apply it rather than having the toggle take effect a lap later.
		if (this.#playing && this.#list) {
			const at = this.#progress.fraction;
			this.#handle?.stop();
			this.#handle = null;
			this.#play(this.#list, at);
		}
		return written;
	}

	close(): void {
		this.#handle?.stop();
		this.#handle = null;
		this.#playing = false;
		this.#openId = null;
		this.#list = null;
		this.#progress = IDLE;
	}

	/** Page teardown. Synthesis is global and outlives the component, so a bar
	 *  navigated away from must not leave a voice running behind it. */
	destroy(): void {
		this.close();
	}

	#play(list: Playlist, seekTo: number): boolean {
		const handle = createPlayer(list.segments, {
			rate: this.#opts.speakRate,
			voice: this.#opts.speakVoice || undefined,
			gender: this.#opts.speakGender === 'auto' ? undefined : this.#opts.speakGender,
			repeat: this.#opts.speakListRepeat,
			onProgress: (p) => (this.#progress = p),
			onEnd: () => {
				// Reached both when the list finishes and when another playback
				// relieves this one. Either way the bar stays open, showing where
				// it got to — closing is the reader's act, not the player's.
				this.#playing = false;
				this.#handle = null;
			}
		});
		if (!handle) return false;
		this.#handle = handle;
		this.#playing = true;
		if (seekTo > 0) handle.seek(seekTo);
		return true;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/playlistPlayer.test.ts`
Expected: PASS, 12 tests.

If `reports paused when something else takes the queue` fails, the cause is Task 2's ownership work, not this file — an external `cancel()` must reach the handle's `onEnd`. Check `finish()` in `createPlayer` calls `opts.onEnd?.()`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/state/playlistPlayer.svelte.ts tests/unit/playlistPlayer.test.ts
git commit -m "feat(player): the playback session for a list

A class like fontScale, but exported as the class rather than an
instance: a font size is one global preference, a playback session
belongs to the page that started it. Options are preloaded so the path
from tap to speak() has no await in it — iOS goes silent otherwise."
```

---

### Task 7: Carry each event's verse text

The home screen's `EventCardVM` holds verse *numbers*. Resolving bodies at tap time would put an IndexedDB read between the gesture and `speak()`, which is silence on a phone. `loadPackageData` is memoized module-level (`packageDataCache` in `src/lib/db/verses.ts:307`), and `buildEventCards` already calls it, so resolving them during the build costs no extra I/O.

**Files:**
- Modify: `src/lib/db/events.ts` (`EventCardVM`, `buildEventCards`)
- Test: `tests/unit/events.test.ts` (append)

**Interfaces:**
- Consumes: `PlaylistVerse` (Task 1); existing `loadPackageData`.
- Produces: `EventCardVM.verses: PlaylistVerse[]` — every included range's verses, in range order, then verse order within a range.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/events.test.ts`, inside the existing `describe('events data layer', ...)` block. It reuses the fixtures already declared at the top of that file — `samplePackages`, `sampleVerses` (`{ i: 1, title: 't1', cite: 'c1', w: 'w1' }` …), `sampleGroups`, `sampleEvents`, and the `mockFetch` helper.

```ts
	// The home button has to speak straight from the tap, so the text is
	// resolved during the build rather than read from IndexedDB at tap time.
	it('carries each range’s verse text for 전체 듣기', async () => {
		mockFetch({
			'data/events.json': sampleEvents,
			'data/packages.json': samplePackages,
			'data/5_krv.json': sampleVerses,
			'data/packages_index.json': sampleGroups
		});
		await listPackages();
		await installPackage('5_krv');
		const [card] = await buildEventCards('2099-12-30');
		expect(card.verses).toEqual([
			{ title: 't1', cite: 'c1', w: 'w1' },
			{ title: 't2', cite: 'c2', w: 'w2' }
		]);
	});

	// Heard in the order they are read: range by range, verse by verse within
	// each. The second range is listed first here precisely so a sort would
	// show up as a failure.
	it('keeps verses in range order, not verse-number order', async () => {
		mockFetch({
			'data/events.json': [
				{
					id: 'e3',
					title: '두 범위',
					dueAt: '2099-12-31',
					ranges: [
						{ packageId: '5_krv', verseNos: [3], label: 'B' },
						{ packageId: '5_krv', verseNos: [1, 2], label: 'A' }
					]
				}
			],
			'data/packages.json': samplePackages,
			'data/5_krv.json': sampleVerses,
			'data/packages_index.json': sampleGroups
		});
		await listPackages();
		await installPackage('5_krv');
		const [card] = await buildEventCards('2099-12-30');
		expect(card.verses.map((v) => v.cite)).toEqual(['c3', 'c1', 'c2']);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/events.test.ts`
Expected: FAIL — `card.verses` is undefined.

- [ ] **Step 3: Write the implementation**

In `src/lib/db/events.ts`:

Add the import:

```ts
import type { PlaylistVerse } from '$lib/memorize/playlist';
```

Add to `EventCardVM`, after `ranges`:

```ts
	/** Every included range's verses, in range order, for 전체 듣기.
	 *
	 *  Resolved during the build rather than on tap: iOS honours synthesis
	 *  only when it is reached synchronously from the gesture, so an
	 *  IndexedDB read at tap time is silence on a phone. loadPackageData is
	 *  memoized and already called above, so this costs no extra read. */
	verses: PlaylistVerse[];
```

In `buildEventCards`, inside the `for (const r of e.ranges)` loop, after the `ranges.push({...})` call, append the range's verses to an array declared alongside `const ranges: RangeCardVM[] = []`:

```ts
		const ranges: RangeCardVM[] = [];
		const verses: PlaylistVerse[] = [];
```

and after `ranges.push({...})`:

```ts
			// Same order as the range card, so what is heard matches what is read.
			const data = await loadPackageData(r.packageId).catch(() => null);
			if (data) {
				const byNo = new Map(data.verses.map((v) => [v.no, v]));
				for (const no of verseNos) {
					const v = byNo.get(no);
					if (v) verses.push({ title: v.title, cite: v.cite, w: v.w });
				}
			}
```

and add `verses` to the `cards.push({...})` object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/events.test.ts`
Expected: PASS.

Run: `npm run check`
Expected: FAIL on `tests/unit/EventSection.test.ts` — its `card` fixture is now missing `verses`. Add `verses: []` to that fixture. Re-run `npm run check`; expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/events.ts tests/unit/events.test.ts tests/unit/EventSection.test.ts
git commit -m "feat(events): carry each event's verse text to the home card

Resolved during the build, not on tap. iOS honours synthesis only when
it is reached straight from the gesture, and loadPackageData is already
called here and memoized, so this costs no extra read."
```

---

### Task 8: 전체 듣기 on the home screen

**Files:**
- Modify: `src/lib/components/home/EventSection.svelte`
- Test: `tests/unit/EventSection.test.ts` (append)

**Interfaces:**
- Consumes: `PlaylistPlayer` (Task 6), `PlaylistBar` (Task 5), `EventCardVM.verses` (Task 7).
- Produces: nothing further.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/EventSection.test.ts`. The fixture `card` gained `verses: []` in Task 7; give the new tests a fixture with content:

```ts
const spoken: Record<string, unknown>[] = [];

function installFakeSynth() {
	class FakeUtterance {
		text: string;
		lang = '';
		rate = 1;
		voice: unknown = null;
		onend: (() => void) | null = null;
		onerror: (() => void) | null = null;
		onboundary: ((e: { charIndex: number }) => void) | null = null;
		constructor(text: string) {
			this.text = text;
		}
	}
	const synth = {
		speaking: false,
		pending: false,
		paused: false,
		getVoices: () => [{ name: 'Google 한국의', lang: 'ko-KR' }],
		speak(u: FakeUtterance) {
			spoken.push(u);
			synth.speaking = true;
		},
		cancel() {
			synth.speaking = false;
		},
		resume() {}
	};
	vi.stubGlobal('speechSynthesis', synth);
	vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
}

const withVerses: EventCardVM = {
	...card,
	verses: [
		{ title: '중심', cite: '창세기 28 : 14', w: '네 자손이 땅의 티끌 같이 되어' },
		{ title: '사랑', cite: '요한복음 3 : 16', w: '하나님이 세상을 이처럼 사랑하사' }
	]
};

describe('EventSection — 전체 듣기', () => {
	beforeEach(() => {
		spoken.length = 0;
		installFakeSynth();
	});
	afterEach(() => vi.unstubAllGlobals());

	it('offers 전체 듣기 for an event with verses', () => {
		render(EventSection, { props: { events: [withVerses] } });
		expect(
			screen.getByRole('button', { name: '11월 암송 데이 전체 듣기' })
		).toBeInTheDocument();
	});

	// Absent rather than offered and then failing.
	it('offers nothing when the platform does not speak', () => {
		vi.unstubAllGlobals();
		render(EventSection, { props: { events: [withVerses] } });
		expect(screen.queryByRole('button', { name: /전체 듣기/ })).toBeNull();
	});

	it('offers nothing for an event with no verses', () => {
		render(EventSection, { props: { events: [{ ...withVerses, verses: [] }] } });
		expect(screen.queryByRole('button', { name: /전체 듣기/ })).toBeNull();
	});

	it('tapping it speaks and raises the bar', async () => {
		render(EventSection, { props: { events: [withVerses] } });
		await fireEvent.click(screen.getByRole('button', { name: '11월 암송 데이 전체 듣기' }));
		expect(spoken).toHaveLength(1);
		expect(screen.getByRole('button', { name: '재생 닫기' })).toBeInTheDocument();
		expect(screen.getByText('창세기 28 : 14')).toBeInTheDocument();
	});

	it('the header button becomes a stop while its own list is open', async () => {
		render(EventSection, { props: { events: [withVerses] } });
		await fireEvent.click(screen.getByRole('button', { name: '11월 암송 데이 전체 듣기' }));
		expect(
			screen.getByRole('button', { name: '11월 암송 데이 듣기 정지' })
		).toBeInTheDocument();
	});

	it('tapping the stop puts the bar away', async () => {
		render(EventSection, { props: { events: [withVerses] } });
		await fireEvent.click(screen.getByRole('button', { name: '11월 암송 데이 전체 듣기' }));
		await fireEvent.click(screen.getByRole('button', { name: '11월 암송 데이 듣기 정지' }));
		expect(screen.queryByRole('button', { name: '재생 닫기' })).toBeNull();
	});
});
```

Add `vi`, `beforeEach`, `afterEach` to the file's `vitest` import, and add `fireEvent` to its existing `@testing-library/svelte` import. (`@testing-library/dom` is not a direct dependency of this repo and pnpm's strict node_modules will not resolve it; every existing component test imports `fireEvent` from `@testing-library/svelte`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/EventSection.test.ts`
Expected: FAIL — no button matching `/전체 듣기/`.

- [ ] **Step 3: Write the implementation**

In `src/lib/components/home/EventSection.svelte`:

Extend the lucide import to `import { CalendarCheck, Download, Play, Square } from 'lucide-svelte';` and add:

```ts
	import PlaylistBar from '$lib/components/player/PlaylistBar.svelte';
	import { PlaylistPlayer } from '$lib/state/playlistPlayer.svelte';

	// One session for the whole section. Several events can be on screen; only
	// one of them can be speaking, because there is one synthesizer.
	const player = new PlaylistPlayer();
	$effect(() => {
		void player.load();
		return () => player.destroy();
	});
```

In the event header, replace the existing export `<button>` — the one with `aria-label="{ev.eventTitle} 내보내기"` — with this wrapper holding both buttons. The `ml-auto` moves off the export button and onto the wrapper, so the pair still sits right of the title whether or not the play button is present:

```svelte
				<div class="ml-auto flex items-center gap-1">
					{#if player.supported && ev.verses.length > 0}
						{@const open = player.openId === `event:${ev.eventId}`}
						<!--
							Stop, not pause, and not a muted speaker: the transport
							lives in the bar, so this button's whole promise is "start
							this list / put it away". Same reasoning as VerseCard's
							speaker chip.
						-->
						<button
							type="button"
							onclick={() =>
								open ? player.close() : player.start(`event:${ev.eventId}`, ev.verses)}
							aria-label="{ev.eventTitle} {open ? '듣기 정지' : '전체 듣기'}"
							class="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors {open
								? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
								: 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]'}"
						>
							{#if open}
								<Square size={14} strokeWidth={2} fill="currentColor" />
							{:else}
								<Play size={15} strokeWidth={1.75} />
							{/if}
						</button>
					{/if}
					<button
						type="button"
						onclick={() => openSheet(ev)}
						aria-label="{ev.eventTitle} 내보내기"
						class="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
					>
						<Download size={15} strokeWidth={1.75} />
					</button>
				</div>
```

The D-day `<span>` that follows stays exactly where it is, outside this wrapper.

At the very end of the `<section>`, **outside** the `{#each}`:

```svelte
		{#if player.openId}
			<PlaylistBar
				playing={player.playing}
				label={player.nowPlaying?.cite ?? ''}
				index={player.index}
				count={player.count}
				fraction={player.progress.fraction}
				elapsedMs={player.progress.elapsedMs}
				totalMs={player.progress.totalMs}
				repeat={player.listRepeat}
				onToggle={() => player.toggle()}
				onSeek={(f) => player.seek(f)}
				onToggleRepeat={() => player.toggleRepeat()}
				onClose={() => player.close()}
			/>
		{/if}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/EventSection.test.ts`
Expected: PASS.

Run: `npm run check && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/home/EventSection.svelte tests/unit/EventSection.test.ts
git commit -m "feat(home): 전체 듣기 for an 암송 DAY

One button on the event header reads the whole day in range order.
One bar for the section, not one per event — there is one synthesizer,
so there is one thing playing."
```

---

### Task 9: 전체 듣기 on the bookmarks screen

**Files:**
- Modify: `src/routes/bookmarks/+page.svelte`

**Interfaces:**
- Consumes: `PlaylistPlayer` (Task 6), `PlaylistBar` (Task 5).
- Produces: nothing further.

There is no component test for this route (it takes SvelteKit `load` data); Task 10's Playwright spec covers it. Verify by `npm run check` and by eye in `npm run dev`.

- [ ] **Step 1: Wire the player**

In `src/routes/bookmarks/+page.svelte`, add to the imports:

```ts
	import PlaylistBar from '$lib/components/player/PlaylistBar.svelte';
	import { PlaylistPlayer } from '$lib/state/playlistPlayer.svelte';
```

Below the existing state declarations:

```ts
	const player = new PlaylistPlayer();
	$effect(() => {
		void player.load();
		return () => player.destroy();
	});

	// What is heard has to match what is on screen. Switching ribbons is a
	// change of subject, so the reading stops rather than carrying on over a
	// list the reader is no longer looking at.
	$effect(() => {
		const open = player.openId;
		if (open && open !== `bookmark:${selected}`) player.close();
	});
```

- [ ] **Step 2: Add the button**

In the row that holds `총 {visibleRows.length}개`, inside the `<div class="flex items-center gap-3">` and **before** the 이 색 전부 지우기 button:

```svelte
				{#if player.supported}
					{@const open = player.openId === `bookmark:${selected}`}
					<button
						type="button"
						onclick={() =>
							open
								? player.close()
								: player.start(
										`bookmark:${selected}`,
										visibleRows.map((r) => ({
											title: r.verse.title,
											cite: r.verse.cite,
											w: r.verse.w
										}))
									)}
						class="text-[12px] font-medium underline-offset-4 hover:underline {open
							? 'text-[var(--color-accent)]'
							: 'text-[var(--color-text-secondary)]'}"
					>
						{open ? '듣기 정지' : '전체 듣기'}
					</button>
				{/if}
```

- [ ] **Step 3: Add the bar**

Immediately before the closing `</main>`:

```svelte
	{#if player.openId}
		<PlaylistBar
			playing={player.playing}
			label={player.nowPlaying?.cite ?? ''}
			index={player.index}
			count={player.count}
			fraction={player.progress.fraction}
			elapsedMs={player.progress.elapsedMs}
			totalMs={player.progress.totalMs}
			repeat={player.listRepeat}
			onToggle={() => player.toggle()}
			onSeek={(f) => player.seek(f)}
			onToggleRepeat={() => player.toggleRepeat()}
			onClose={() => player.close()}
		/>
	{/if}
```

The bar is `position: fixed`, so it renders above the tab bar regardless of where in the markup it sits. Nothing in this page's ancestry sets `transform`, which would otherwise make `fixed` resolve against that element instead of the viewport.

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: no new errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/bookmarks/+page.svelte
git commit -m "feat(bookmarks): 전체 듣기 for the selected ribbon

Switching ribbons stops the reading. What is heard has to match what is
on screen, and a change of ribbon is a change of subject."
```

---

### Task 10: End-to-end

**Files:**
- Modify: `tests/e2e/home.spec.ts`

The Playwright harness has no `speechSynthesis` — Chromium headless ships the interface but speaks nothing and fires no events, so the test stubs it to keep the assertions about the UI rather than about the platform.

**Interfaces:**
- Consumes: `joinTeam` from `tests/e2e/helpers.ts` — the 암송 DAY schedule is withheld from readers outside the team, so a spec that touches it has to say who it is first.

- [ ] **Step 1: Write the failing test**

Append to `tests/e2e/home.spec.ts`:

```ts
import { joinTeam } from './helpers';

/**
 * A speechSynthesis that reports progress without making a sound.
 *
 * Headless Chromium exposes the interface but never fires `end` or
 * `boundary`, so a real one would leave the bar frozen and prove nothing.
 * This one ends each utterance on a timer, which is enough for the bar to
 * appear, name a verse, and be dismissed.
 */
const FAKE_SYNTH = `
	class FakeUtterance extends EventTarget {
		constructor(text) { super(); this.text = text; this.lang = ''; this.rate = 1; this.voice = null;
			this.onend = null; this.onerror = null; this.onboundary = null; }
	}
	let current = null;
	window.SpeechSynthesisUtterance = FakeUtterance;
	Object.defineProperty(window, 'speechSynthesis', {
		configurable: true,
		value: {
			speaking: false, pending: false, paused: false,
			getVoices: () => [{ name: 'Test Korean', lang: 'ko-KR', localService: true }],
			speak(u) {
				current = u;
				this.speaking = true;
				setTimeout(() => { if (current === u) { this.speaking = false; current = null; u.onend && u.onend(); } }, 3000);
			},
			cancel() { const u = current; current = null; this.speaking = false; if (u && u.onend) u.onend(); },
			resume() {}
		}
	});
`;

test('home offers 전체 듣기 for the 암송 DAY and the bar can be dismissed', async ({ page }) => {
	await page.addInitScript(FAKE_SYNTH);
	await joinTeam(page);

	const listen = page.getByRole('button', { name: /전체 듣기$/ }).first();
	await expect(listen).toBeVisible();
	await listen.click();

	// The bar names the verse it is reading and how far into the list it is.
	const close = page.getByRole('button', { name: '재생 닫기' });
	await expect(close).toBeVisible();
	await expect(page.getByRole('button', { name: '목록 반복' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	await close.click();
	await expect(close).toBeHidden();
});
```

Note: `joinTeam` navigates to `/?team=cdm-b`, so `addInitScript` must be registered before it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/home.spec.ts`
Expected: FAIL before Tasks 7–8 are in; after them it should pass. Run it now to confirm it is exercising the real thing.

- [ ] **Step 3: Fix whatever the run surfaces**

Two known fragilities to check rather than guess at:

1. The 암송 DAY in `static/data/events.json` has `dueAt: "2026-08-31"`, and `activeEvents` only returns events where `today <= dueAt`. After that date this spec finds no event. If the run shows no button, check whether the fixture event has expired — and if so, skip the assertion the way any other event-dependent spec in `tests/e2e/` does, rather than editing production data.
2. `joinTeam` waits on the `team` parameter disappearing, not on the event card rendering. If the button is not yet present, wait for the event title heading first.

- [ ] **Step 4: Run the whole e2e suite**

Run: `npm run test:e2e`
Expected: PASS, no regressions in the other specs.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/home.spec.ts
git commit -m "test(e2e): 전체 듣기 raises and dismisses the bar

Headless Chromium exposes speechSynthesis but never fires end or
boundary, so the spec supplies one that reports progress without making
a sound — the assertions are about the UI, not the platform."
```

---

## Final verification

- [ ] `npm test` — all unit tests pass
- [ ] `npm run check` — no new svelte-check errors
- [ ] `npm run test:e2e` — Playwright passes
- [ ] `npm run build` — production build succeeds (catches Tailwind tree-shaking of any interpolated token)
- [ ] Manual pass in `npm run dev`: home 전체 듣기 plays and the bar sits above the tab bar without covering it; bookmarks 전체 듣기 plays the selected ribbon and stops when the ribbon changes; the settings 전체 듣기 반복 toggle survives a reload; a card's own play button takes over cleanly from a running list.
