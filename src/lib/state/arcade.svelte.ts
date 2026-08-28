import { getArcadeSound, setArcadeSound } from '$lib/db/arcadeOptions';
import { playTones } from '$lib/arcade/player';
import { VOICES, comboVoice, type SfxName } from '$lib/arcade/sfx';
import { prefersReducedMotion } from '$lib/effects/confetti';

/**
 * The quiz's sound, and whether the reader wants it.
 *
 * Same shape as fontScale, and for the same reason: the preference is read
 * from one place and changed from another — the switch is in 설정 and the
 * sounds are in the quiz — so a per-component copy would let the two disagree
 * until a reload.
 *
 * Motion is not stored here. `prefers-reduced-motion` is the reader's answer
 * to that, given once to the whole system, and asking it again in this app's
 * own settings would be asking them to say it twice.
 */
class Arcade {
	/** Optimistic default, overwritten by load() with the stored preference. */
	sound = $state(true);

	#loaded = false;
	/** A pick made while load() is still in flight must win over it — the same
	 *  race fontScale guards, for the same reason. */
	#version = 0;

	async load(): Promise<void> {
		if (this.#loaded) return;
		this.#loaded = true;
		const before = this.#version;
		try {
			const stored = await getArcadeSound();
			if (this.#version === before) this.sound = stored;
		} catch {
			this.#loaded = false;
		}
	}

	setSound(v: boolean): Promise<void> {
		this.#version++;
		this.sound = v;
		return setArcadeSound(v).catch(() => {});
	}

	/** Play one of the catalogue's sounds, if the reader wants sound at all. */
	play(name: SfxName): void {
		if (!this.sound) return;
		playTones(VOICES[name]);
	}

	/** The chain's chime, a step higher for each link. */
	playCombo(streak: number): void {
		if (!this.sound) return;
		playTones(comboVoice(streak));
	}

	/**
	 * Whether the games should animate at all.
	 *
	 * Read through here rather than at each canvas so the answer is the same
	 * everywhere, and so a round can still be *played* with the motion off —
	 * the clocks keep running and the bars still fill; it is the raider and the
	 * flying masonry that stop.
	 */
	get motion(): boolean {
		return !prefersReducedMotion();
	}

	/** Test-only: forget the loaded flag so a later load() re-reads storage. */
	_resetForTest(): void {
		this.#loaded = false;
		this.#version = 0;
		this.sound = true;
	}
}

export const arcade = new Arcade();
