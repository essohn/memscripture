import { getVerseFontScale, setVerseFontScale, type VerseFontScale } from '$lib/db/viewOptions';

/**
 * Verse text size, shared across every screen that shows a verse.
 *
 * The same shape as verseVisibility, and for the same reason: four pages read
 * the one stored key but each copied it into its own `$state` on mount, so a
 * change made on one screen never reached another that was already rendered.
 * Moving the picker into the header makes that a visible fault rather than a
 * latent one — the control is now on screens whose cards it must move.
 */
class FontScale {
	/** Optimistic default, overwritten by load() with the stored preference. */
	value = $state<VerseFontScale>(1.0);

	/** Guards against re-reading IndexedDB for every page that mounts. */
	#loaded = false;

	/**
	 * Bumped by pick(). load() is a single IndexedDB read that can still be in
	 * flight when the user chooses a size — the header mounts before it
	 * resolves. Without this, the read completing after the choice would
	 * overwrite it with the stale stored value. A user action must win over a
	 * load that was already running when it landed.
	 */
	#version = 0;

	async load(): Promise<void> {
		if (this.#loaded) return;
		this.#loaded = true;
		const versionBeforeLoad = this.#version;
		try {
			const stored = await getVerseFontScale();
			if (this.#version === versionBeforeLoad) this.value = stored;
			// else: a pick() landed while this read was in flight. Its value is
			// newer than what we just read — keep it.
		} catch {
			// Leave the default. A failed preference read must not blank the app.
			this.#loaded = false;
		}
	}

	/**
	 * Applies immediately, then persists. The returned promise is the write,
	 * not the change: the UI ignores it so the tap never waits on storage,
	 * while tests can await it to assert the choice landed.
	 */
	pick(scale: VerseFontScale): Promise<void> {
		this.#version++;
		this.value = scale;
		return setVerseFontScale(scale).catch(() => {});
	}

	/** Test-only: forget the loaded flag so a later load() re-reads storage. */
	_resetForTest(): void {
		this.#loaded = false;
		this.#version = 0;
	}
}

export const fontScale = new FontScale();
