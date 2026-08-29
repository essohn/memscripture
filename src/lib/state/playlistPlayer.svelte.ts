import {
	buildPlaylist,
	reciteGap,
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
import {
	getSpeakOptions,
	setSpeakOption,
	SPEAK_DEFAULTS,
	type ReciteScale,
	type SpeakOptionsStored
} from '$lib/db/viewOptions';

// Frozen: $state skips proxying a frozen object rather than wrapping it, and
// freezing turns an accidental `player.progress.fraction = x` from silent
// corruption of every future instance's idle state into a thrown error.
const IDLE: PlayerProgress = Object.freeze({
	fraction: 0,
	waiting: false,
	waitFraction: 0,
	elapsedMs: 0,
	totalMs: 0
});

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
	 *
	 * Spread rather than hand-copied so this cannot drift from SPEAK_DEFAULTS.
	 */
	#opts = $state<SpeakOptionsStored>({ ...SPEAK_DEFAULTS });

	#openId = $state<string | null>(null);
	/** 따라 읽기: a silence before each verse, long enough to say it first.
	 *  Kept on the player because seeking and resuming rebuild the engine and
	 *  have to rebuild it in the same mode. */
	#recite = $state(false);
	#playing = $state(false);
	/** The device would not speak at all. Kept so the bar can say so instead of
	 *  sitting there having quietly given up. */
	#failed = $state(false);
	#progress = $state<PlayerProgress>(IDLE);
	/** Raw: the segment array is long and nothing reads into it reactively. */
	#list = $state.raw<Playlist | null>(null);
	#handle: PlayerHandle | null = null;

	get failed(): boolean {
		return this.#failed;
	}
	/** In 따라 읽기's silence rather than reading. The bar says so, because it
	 *  has no characters to follow through one. */
	get waiting(): boolean {
		return this.#progress.waiting;
	}
	/** How far through that silence, so the bar can show it running rather than
	 *  looking like a player that has stopped. */
	get waitFraction(): number {
		return this.#progress.waitFraction;
	}
	/** Whether the running list is a 따라 읽기 one. The dial means nothing on a
	 *  straight 전체 듣기, so the bar only offers it here. */
	get reciting(): boolean {
		return this.#recite;
	}
	get reciteScale(): ReciteScale {
		return this.#opts.reciteScale;
	}
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
	start(id: string, verses: PlaylistVerse[], opts: { recite?: boolean } = {}): void {
		const list = buildPlaylist(verses, { includeTitle: this.#opts.speakTitle });
		if (list.tracks.length === 0) return;
		this.#recite = opts.recite ?? false;
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
		if (this.#handle) {
			this.#handle.seek(fraction);
			return;
		}
		// Relieved or finished, but the bar is still open. A scrub is a request
		// to hear that part, so it starts playing again from there rather than
		// moving a thumb that nothing is following.
		if (this.#list) this.#play(this.#list, fraction);
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
		// Same guard as toggle(): report() clamps fraction to 1 via the clock
		// estimate, which outruns real speech, so restarting at a fraction of
		// exactly 1 would seek past the end — sliceFrom returns [] and #play
		// silently fails to start. Restart from the top instead, the same as
		// a reader pressing play again on a finished list.
		if (this.#playing && this.#list) {
			const at = this.#progress.fraction;
			this.#handle?.stop();
			this.#handle = null;
			this.#play(this.#list, at >= 1 ? 0 : at);
		}
		return written;
	}

	/**
	 * Applies immediately, then persists — same contract as toggleRepeat, and
	 * for the same reason: the tap must not wait on storage, while a caller
	 * that needs the write to have landed can await it.
	 *
	 * Worth changing mid-list rather than only in 설정, because a silence is
	 * only too long once you are sitting through one. The engine captured the
	 * old length when it built the list's gaps, so the playback is restarted
	 * where it stands — which also rebuilds the runtime the bar counts against,
	 * and that shifts by minutes across this dial's range.
	 */
	setReciteScale(scale: ReciteScale): Promise<void> {
		this.#version++;
		this.#opts = { ...this.#opts, reciteScale: scale };
		const written = setSpeakOption('reciteScale', scale).catch(() => {});
		// Same end-of-list guard as toggleRepeat: restarting at a fraction of
		// exactly 1 seeks past the end, where sliceFrom returns nothing and the
		// list silently fails to start.
		if (this.#playing && this.#list && this.#recite) {
			const at = this.#progress.fraction;
			this.#handle?.stop();
			this.#handle = null;
			this.#play(this.#list, at >= 1 ? 0 : at);
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
		// Cleared on every start: a device that would not speak a moment ago may
		// have had its voice changed in 설정 since, and the notice must not
		// outlive the problem.
		this.#failed = false;
		const handle = createPlayer(list.segments, {
			rate: this.#opts.speakRate,
			voice: this.#opts.speakVoice || undefined,
			gender: this.#opts.speakGender === 'auto' ? undefined : this.#opts.speakGender,
			repeat: this.#opts.speakListRepeat,
			onProgress: (p) => (this.#progress = p),
			onFailure: () => (this.#failed = true),
			gapBefore: this.#recite
				? reciteGap(list.bodyStarts, this.#opts.speakRate, this.#opts.reciteScale)
				: undefined,
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
