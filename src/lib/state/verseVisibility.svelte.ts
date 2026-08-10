import { getShowVerseTextInList, setShowVerseTextInList } from '$lib/db/viewOptions';

/**
 * Whether verse bodies are revealed, shared across every screen that shows one.
 *
 * The setting itself was already shared — four pages read the same
 * `showVerseTextInList` key — but each copied it into its own `$state` on
 * mount, so a change made in one place never reached a view that was already
 * rendered. The header toggle has to move every card on screen at once, which
 * needs a shared *reactive* value, not just a shared stored one.
 *
 * A class instance rather than an exported `$state` binding: a reassignable
 * rune cannot be exported from a module, so the state lives on a field and
 * callers read `verseVisibility.shown`.
 */
class VerseVisibility {
	/** Optimistic default. Overwritten by load() with the stored preference. */
	shown = $state(true);

	/** Guards against re-reading IndexedDB for every page that mounts. */
	#loaded = false;

	async load(): Promise<void> {
		if (this.#loaded) return;
		this.#loaded = true;
		try {
			this.shown = await getShowVerseTextInList();
		} catch {
			// Leave the default. A failed preference read must not blank the app.
			this.#loaded = false;
		}
	}

	/**
	 * Flips immediately, then persists. The returned promise is the write, not
	 * the flip: callers in the UI ignore it so the tap never waits on storage,
	 * while tests can await it to assert the choice actually landed.
	 */
	toggle(): Promise<void> {
		this.shown = !this.shown;
		return setShowVerseTextInList(this.shown).catch(() => {});
	}
}

export const verseVisibility = new VerseVisibility();
