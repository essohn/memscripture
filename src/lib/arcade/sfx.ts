/**
 * Chiptune for the quiz, synthesised rather than downloaded.
 *
 * Every sound here is a handful of oscillator sweeps described as data. That
 * is not a constraint worked around — it is the sound: square waves and short
 * pitch slides are what an arcade cabinet was, and eight sampled effects would
 * have cost more bytes than the rest of the app while sounding less like one.
 * An offline PWA that ships around 100KB does not spend that on audio files.
 *
 * The timing lives here as pure functions and the engine below does nothing
 * but hand the plan to WebAudio, so the part with rules in it is testable
 * without an audio device.
 */

export type ToneType = 'square' | 'triangle' | 'sawtooth' | 'sine' | 'noise';

export interface Tone {
	type: ToneType;
	/** Hz at the start and at the end. Equal for a flat note, apart for a
	 *  slide — which is most of what makes these read as arcade rather than as
	 *  a doorbell. */
	from: number;
	to: number;
	ms: number;
	/** Peak gain, well under 1: several tones can overlap and the sum is what
	 *  reaches the speaker. */
	gain: number;
	/** Milliseconds after the *previous tone's start*, not the clock's. Zero
	 *  stacks this tone onto the one before it, which is how a chord is
	 *  written. */
	afterMs?: number;
}

export const SFX_NAMES = [
	/** A choice landed: a chip, not a chime. */
	'select',
	/** The reader's answer leaves the gun. */
	'shot',
	/** The raider comes apart. */
	'explode',
	/** The wall of text breaks. */
	'shatter',
	/** The raider got through, or the call was wrong. */
	'fail',
	/** The last seconds of a round. */
	'alarm',
	/** The session is over. */
	'clear'
] as const;

export type SfxName = (typeof SFX_NAMES)[number];

export const VOICES: Record<SfxName, Tone[]> = {
	select: [{ type: 'square', from: 880, to: 1180, ms: 60, gain: 0.16 }],
	// Falling, fast, and thin — a pew rather than a thud.
	shot: [
		{ type: 'square', from: 1600, to: 340, ms: 110, gain: 0.18 },
		{ type: 'sawtooth', from: 900, to: 200, ms: 90, gain: 0.08, afterMs: 0 }
	],
	// Noise is the body of any explosion; the falling square under it is what
	// keeps it from sounding like static.
	explode: [
		{ type: 'noise', from: 1, to: 1, ms: 340, gain: 0.3 },
		{ type: 'square', from: 320, to: 60, ms: 300, gain: 0.2, afterMs: 0 },
		{ type: 'triangle', from: 160, to: 40, ms: 420, gain: 0.16, afterMs: 40 }
	],
	// Brighter and shorter than the explosion: stone, not gunpowder.
	shatter: [
		{ type: 'noise', from: 1, to: 1, ms: 220, gain: 0.24 },
		{ type: 'square', from: 1400, to: 420, ms: 160, gain: 0.14, afterMs: 0 },
		{ type: 'square', from: 700, to: 220, ms: 220, gain: 0.12, afterMs: 60 }
	],
	// Two steps down. Descending is the oldest way to say no.
	fail: [
		{ type: 'square', from: 340, to: 300, ms: 130, gain: 0.2 },
		{ type: 'square', from: 240, to: 150, ms: 260, gain: 0.2, afterMs: 130 }
	],
	alarm: [
		{ type: 'square', from: 720, to: 720, ms: 90, gain: 0.13 },
		{ type: 'square', from: 540, to: 540, ms: 90, gain: 0.13, afterMs: 130 }
	],
	// The one flourish in the set, and the only place a major chord appears.
	clear: [
		{ type: 'square', from: 523, to: 523, ms: 110, gain: 0.16 },
		{ type: 'square', from: 659, to: 659, ms: 110, gain: 0.16, afterMs: 110 },
		{ type: 'square', from: 784, to: 784, ms: 110, gain: 0.16, afterMs: 110 },
		{ type: 'square', from: 1047, to: 1047, ms: 320, gain: 0.18, afterMs: 110 },
		{ type: 'triangle', from: 523, to: 523, ms: 320, gain: 0.1, afterMs: 0 }
	]
};

export interface ScheduledTone {
	type: ToneType;
	from: number;
	to: number;
	/** Seconds on the audio clock. */
	startAt: number;
	endAt: number;
	gain: number;
}

/** Absolute times for one voice, starting at `startAt` seconds. */
export function planVoice(tones: Tone[], startAt: number): ScheduledTone[] {
	const out: ScheduledTone[] = [];
	let cursor = startAt;
	tones.forEach((t, i) => {
		// The first tone owns the start; afterMs on it would only move the whole
		// voice, which is what the caller's own startAt is for.
		if (i > 0) cursor += (t.afterMs ?? tones[i - 1].ms) / 1000;
		out.push({
			type: t.type,
			from: t.from,
			to: t.to,
			startAt: cursor,
			endAt: cursor + t.ms / 1000,
			gain: t.gain
		});
	});
	return out;
}

const SEMITONE = Math.pow(2, 1 / 12);

/** The same voice, moved up or down the scale. */
export function transpose(tones: Tone[], semitones: number): Tone[] {
	if (semitones === 0) return tones.map((t) => ({ ...t }));
	const ratio = Math.pow(SEMITONE, semitones);
	return tones.map((t) => ({ ...t, from: t.from * ratio, to: t.to * ratio }));
}

/** How far the chain is allowed to climb. Past this the ear stops hearing a
 *  step and starts hearing a whistle. */
const COMBO_TOP_STEP = 7;

/**
 * The chime for the nth link of a chain, a step higher each time.
 *
 * Written as a function rather than an entry in VOICES because its pitch is
 * the information: a run of five has to sound like a run, and five plays of
 * one sample sound like five plays of one sample.
 */
export function comboVoice(streak: number): Tone[] {
	const step = Math.min(COMBO_TOP_STEP, Math.max(0, streak - 1));
	return transpose(
		[
			{ type: 'square', from: 660, to: 880, ms: 70, gain: 0.16 },
			{ type: 'square', from: 880, to: 1100, ms: 90, gain: 0.14, afterMs: 70 }
		],
		step * 2
	);
}

/** Widest interval any voice is transposed by, used to size the noise buffer's
 *  reuse and to keep `clear` from colliding with a combo chime. */
export const SFX_MAX_SEMITONES = COMBO_TOP_STEP * 2;
