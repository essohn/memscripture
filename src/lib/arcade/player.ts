import { planVoice, type ScheduledTone, type Tone } from './sfx';

/**
 * The thin end of the sound: hand a plan to WebAudio and forget it.
 *
 * Everything with a rule in it — what a sound is made of, when each tone
 * starts, how far the chain climbs — lives in sfx.ts and is tested there. This
 * file only owns the parts that need a device: one lazily built AudioContext,
 * one noise buffer, and the promise that a browser without any of it fails
 * quietly rather than taking a round down with it.
 */

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/** One second of white noise, reused by every explosion. Built once because
 *  filling a buffer per shot is the only expensive thing here. */
function noiseBuffer(ac: AudioContext): AudioBuffer {
	if (noise) return noise;
	const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
	const data = buf.getChannelData(0);
	for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
	noise = buf;
	return buf;
}

/**
 * The audio context, created on first use.
 *
 * Not at module load: a context built before a user gesture starts suspended,
 * and browsers keep it that way. The quiz's first sound follows a tap, so
 * building it there is both allowed and enough. Returns null where audio does
 * not exist at all — SSR, and the jsdom the tests run in.
 */
function context(): AudioContext | null {
	if (ctx) return ctx;
	if (typeof window === 'undefined') return null;
	const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctor) return null;
	try {
		ctx = new Ctor();
	} catch {
		return null;
	}
	return ctx;
}

function playTone(ac: AudioContext, t: ScheduledTone, master: GainNode): void {
	const gain = ac.createGain();
	// Ramped, never stepped: a square wave switched on at full gain clicks, and
	// the click is louder than the note.
	gain.gain.setValueAtTime(0.0001, t.startAt);
	gain.gain.exponentialRampToValueAtTime(t.gain, t.startAt + 0.008);
	gain.gain.exponentialRampToValueAtTime(0.0001, t.endAt);
	gain.connect(master);

	if (t.type === 'noise') {
		const src = ac.createBufferSource();
		src.buffer = noiseBuffer(ac);
		src.connect(gain);
		src.start(t.startAt);
		src.stop(t.endAt);
		return;
	}

	const osc = ac.createOscillator();
	osc.type = t.type;
	osc.frequency.setValueAtTime(t.from, t.startAt);
	if (t.to !== t.from) osc.frequency.exponentialRampToValueAtTime(t.to, t.endAt);
	osc.connect(gain);
	osc.start(t.startAt);
	osc.stop(t.endAt);
}

/**
 * Play one voice now. Never throws: a failed sound must not fail a round.
 */
export function playTones(tones: Tone[]): void {
	const ac = context();
	if (!ac) return;
	try {
		// A context built before the gesture, or suspended by a tab switch, is
		// resumed here rather than being left silent for the rest of the run.
		if (ac.state === 'suspended') void ac.resume();
		const master = ac.createGain();
		master.gain.value = 0.9;
		master.connect(ac.destination);
		// A hair ahead of the clock: scheduling at currentTime exactly can land
		// in the past by the time the node is wired up, which drops the note.
		for (const t of planVoice(tones, ac.currentTime + 0.02)) playTone(ac, t, master);
	} catch {
		// Audio is decoration. Losing it is not worth a broken round.
	}
}
