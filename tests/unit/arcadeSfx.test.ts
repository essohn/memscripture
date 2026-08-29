import { describe, expect, it } from 'vitest';
import { SFX_NAMES, VOICES, comboVoice, planVoice, transpose, type Tone } from '../../src/lib/arcade/sfx';

const beep: Tone[] = [
	{ type: 'square', from: 440, to: 440, ms: 100, gain: 0.2 },
	{ type: 'square', from: 660, to: 660, ms: 100, gain: 0.2, afterMs: 100 }
];

describe('VOICES', () => {
	it('has a voice for every sound the games ask for', () => {
		for (const name of SFX_NAMES) {
			expect(VOICES[name], name).toBeDefined();
			expect(VOICES[name].length, name).toBeGreaterThan(0);
		}
	});

	// A gain over one clips, and a tone of no length is silence that still
	// costs an oscillator. Both are easy to write and impossible to hear.
	it('writes every tone within what the output can carry', () => {
		for (const name of SFX_NAMES) {
			for (const t of VOICES[name]) {
				expect(t.gain, name).toBeGreaterThan(0);
				expect(t.gain, name).toBeLessThanOrEqual(0.5);
				expect(t.ms, name).toBeGreaterThan(0);
				expect(t.from, name).toBeGreaterThan(0);
				expect(t.to, name).toBeGreaterThan(0);
			}
		}
	});

	// Nothing here may block the round it belongs to. A quarter second is
	// already long for a keystroke's worth of feedback.
	it('keeps every sound shorter than the gesture that fires it', () => {
		for (const name of SFX_NAMES) {
			const end = planVoice(VOICES[name], 0).reduce((max, t) => Math.max(max, t.endAt), 0);
			expect(end, name).toBeLessThanOrEqual(1.2);
		}
	});
});

describe('the buzzer', () => {
	// A wrong answer has to be audible as wrong with the screen unwatched. It
	// used to be two descending square blips in the same register as the sounds
	// a right answer makes, which is the one thing it could not be.
	it('sits below everything else in the set', () => {
		const top = Math.max(...VOICES.fail.map((t) => Math.max(t.from, t.to)));
		expect(top).toBeLessThan(300);
		for (const name of SFX_NAMES) {
			if (name === 'fail' || name === 'explode') continue;
			const low = Math.min(...VOICES[name].filter((t) => t.type !== 'noise').map((t) => Math.min(t.from, t.to)));
			expect(low, name).toBeGreaterThan(top);
		}
	});

	// A blip reads as a keystroke. A buzz has to last long enough to be a
	// verdict.
	it('lasts long enough to read as a buzz', () => {
		const end = planVoice(VOICES.fail, 0).reduce((max, t) => Math.max(max, t.endAt), 0);
		expect(end).toBeGreaterThanOrEqual(0.35);
	});

	// The roughness is the beating between tones a few hertz apart. Tuned to
	// the same pitch they would sound like one clean note.
	it('is rough rather than clean', () => {
		const pitches = VOICES.fail.map((t) => t.from);
		expect(new Set(pitches).size).toBe(pitches.length);
	});
});

describe('planVoice', () => {
	it('lays the tones out in absolute seconds', () => {
		expect(planVoice(beep, 10)).toEqual([
			{ type: 'square', from: 440, to: 440, startAt: 10, endAt: 10.1, gain: 0.2 },
			{ type: 'square', from: 660, to: 660, startAt: 10.1, endAt: 10.2, gain: 0.2 }
		]);
	});

	// afterMs is measured from the previous tone's start, not the clock's, so a
	// chord is two tones both at afterMs 0 rather than a sum nobody can read.
	it('stacks tones that wait for nothing', () => {
		const chord: Tone[] = [
			{ type: 'square', from: 440, to: 440, ms: 50, gain: 0.1 },
			{ type: 'square', from: 550, to: 550, ms: 50, gain: 0.1, afterMs: 0 }
		];
		const planned = planVoice(chord, 0);
		expect(planned[0].startAt).toBe(0);
		expect(planned[1].startAt).toBe(0);
	});
});

describe('transpose', () => {
	it('moves a voice by whole semitones', () => {
		const up = transpose(beep, 12);
		expect(up[0].from).toBeCloseTo(880);
		expect(up[1].to).toBeCloseTo(1320);
	});

	it('leaves the timing and the loudness alone', () => {
		const up = transpose(beep, 5);
		expect(up.map((t) => [t.ms, t.gain])).toEqual(beep.map((t) => [t.ms, t.gain]));
	});

	it('is the identity at zero', () => {
		expect(transpose(beep, 0)).toEqual(beep);
	});
});

describe('comboVoice', () => {
	// The chain is heard before it is read: each link answers a step higher, so
	// a run of five sounds like a run rather than five of the same noise.
	it('climbs with the chain', () => {
		expect(comboVoice(3)[0].from).toBeGreaterThan(comboVoice(1)[0].from);
	});

	// Ears run out before the multiplier does. Without a ceiling a long session
	// ends in a whistle nobody can hear.
	it('stops climbing before it leaves the register', () => {
		for (const streak of [1, 5, 20, 500]) {
			for (const t of comboVoice(streak)) expect(t.to).toBeLessThan(4_000);
		}
	});
});
