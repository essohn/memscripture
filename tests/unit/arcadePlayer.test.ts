import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tone } from '../../src/lib/arcade/sfx';

/*
 * jsdom has no Web Audio, which is why player.ts is the one arcade file with
 * no tests — everything with a rule in it lives in sfx.ts. The rule this file
 * pins is not about sound at all: it is about how long the app holds the
 * device's audio session open, which is invisible on a desktop and is not on a
 * phone.
 */

class FakeParam {
	setValueAtTime() {}
	exponentialRampToValueAtTime() {}
}

class FakeNode {
	gain = new FakeParam();
	frequency = new FakeParam();
	type = '';
	buffer: unknown = null;
	connect() {}
	start() {}
	stop() {}
}

class FakeContext {
	state: 'running' | 'suspended' | 'closed' = 'running';
	currentTime = 0;
	sampleRate = 8;
	destination = {};
	resume = vi.fn(async () => {
		this.state = 'running';
	});
	suspend = vi.fn(async () => {
		this.state = 'suspended';
	});
	createGain = () => new FakeNode();
	createOscillator = () => new FakeNode();
	createBufferSource = () => new FakeNode();
	createBuffer = (_ch: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
}

const BEEP: Tone[] = [{ type: 'square', from: 440, to: 440, ms: 120, gain: 0.2 }];

let ctx: FakeContext;
let playTones: (tones: Tone[]) => void;

beforeEach(async () => {
	vi.useFakeTimers();
	vi.resetModules();
	ctx = new FakeContext();
	// A fresh module per test, so the lazily built context does not leak
	// between them the way it deliberately does within one page session.
	(window as unknown as { AudioContext: unknown }).AudioContext = function () {
		return ctx;
	};
	({ playTones } = await import('../../src/lib/arcade/player'));
});

describe('playTones', () => {
	it('holds the audio session while a sound is playing', () => {
		playTones(BEEP);
		expect(ctx.suspend).not.toHaveBeenCalled();
	});

	/*
	 * The bug this pins: an AudioContext left running holds the phone's audio
	 * output, and on Android that is enough to silence speechSynthesis. A
	 * reader who played one round of the quiz and went back to 전체 듣기 got no
	 * sound at all, on a device whose TTS worked everywhere else. Decoration
	 * must not outlast itself.
	 */
	it('lets the session go once the sound has finished', async () => {
		playTones(BEEP);
		await vi.advanceTimersByTimeAsync(1000);
		expect(ctx.suspend).toHaveBeenCalled();
	});

	// Sounds overlap constantly in a round — a shot lands while a combo is
	// still ringing. The release has to wait for the last of them, not the
	// first, or the tail of every sound is cut off.
	it('waits for the last overlapping sound, not the first', async () => {
		playTones(BEEP);
		await vi.advanceTimersByTimeAsync(60);
		playTones([{ type: 'square', from: 660, to: 660, ms: 500, gain: 0.2 }]);
		await vi.advanceTimersByTimeAsync(300);
		expect(ctx.suspend).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1000);
		expect(ctx.suspend).toHaveBeenCalled();
	});

	// Suspending is how the session is released, so the next sound has to take
	// it back — otherwise the quiz goes quiet after its first sound.
	it('takes the session back for the next sound', async () => {
		playTones(BEEP);
		await vi.advanceTimersByTimeAsync(1000);
		playTones(BEEP);
		expect(ctx.resume).toHaveBeenCalled();
	});
});
