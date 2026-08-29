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
	onstart: (() => void) | null = null;
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
			// A voice that works says so. Silence here would be the failure the
			// player now watches for, not a working synthesizer.
			u.onstart?.();
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

	it('scrubs the running handle while playing', () => {
		player.start('event:e1', VERSES);
		player.seek(0.5);
		expect(player.progress.fraction).toBeCloseTo(0.5, 1);
	});

	// The ownership registry hands the queue to a verse card's own play button,
	// leaving the bar open but relieved — #handle null, #list still set. A
	// scrub there must not be a dead control: it is a request to hear that
	// part, so it starts playing again rather than moving a thumb that
	// nothing is following.
	it('restarts playback from the scrubbed position when relieved', () => {
		player.start('event:e1', VERSES);
		const other = createPlayer(['다른 문장을 읽습니다'], {});
		other?.stop();
		expect(player.playing).toBe(false);
		const before = spoken.length;
		player.seek(0.5);
		expect(player.playing).toBe(true);
		expect(spoken.length).toBeGreaterThan(before);
	});

	it('close stops playback and dismisses the bar', () => {
		player.start('event:e1', VERSES);
		player.close();
		expect(player.openId).toBeNull();
		expect(player.playing).toBe(false);
		expect(player.progress.fraction).toBe(0);
		// Synthesis is global and outlives the component. close() must actually
		// silence it, not just clear the bar's own state around it.
		expect(window.speechSynthesis.speaking).toBe(false);
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
		const opening = spoken[0].text;
		// Drives progress to roughly the midpoint before the queue is lost, so
		// the restart below has somewhere other than 0 to prove it returned to.
		player.seek(0.5);
		const other = createPlayer(['다른 문장을 읽습니다'], {});
		other?.stop();
		player.toggle();
		expect(player.playing).toBe(true);
		// A restart from the top would speak the opening again; resuming picks
		// up in whatever the scrubbed position landed in. Asserted against the
		// opening rather than against a length: every utterance is one segment
		// now, so two of them can be the same size and still be different
		// places in the script.
		const resumed = spoken[spoken.length - 1];
		expect(resumed.text).not.toBe(opening);
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
