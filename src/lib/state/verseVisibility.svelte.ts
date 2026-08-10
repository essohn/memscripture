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

	/**
	 * Bumped by toggle(). load() is a single IndexedDB read that can be in
	 * flight when the user taps the eye — Header mounts before it resolves, so
	 * that window is reachable on a slow device. Without this, the read
	 * completing after the tap would overwrite the fresh toggled value with the
	 * stale one it started reading before the tap happened. A user action must
	 * always win over a load that was already in progress when it landed.
	 */
	#version = 0;

	async load(): Promise<void> {
		if (this.#loaded) return;
		this.#loaded = true;
		const versionBeforeLoad = this.#version;
		try {
			const stored = await getShowVerseTextInList();
			if (this.#version === versionBeforeLoad) {
				this.shown = stored;
			}
			// else: a toggle() landed while this read was in flight. Its value
			// (already persisted) is newer than what we just read — keep it.
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
		this.#version++;
		this.shown = !this.shown;
		return setShowVerseTextInList(this.shown).catch(() => {});
	}

	/** Test-only: forget the loaded flag and version so a later load() re-reads
	 *  storage instead of returning immediately. Mirrors _resetEventsCache() in
	 *  db/events.ts — same problem, private module/instance state that a test
	 *  suite has no other way to reset between tests. */
	_resetForTest(): void {
		this.#loaded = false;
		this.#version = 0;
	}
}

export const verseVisibility = new VerseVisibility();
