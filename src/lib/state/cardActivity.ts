/**
 * How many verse cards are mid-암송 or mid-점검 right now.
 *
 * Exists for one reason: applying a sync snapshot rewrites every local table,
 * and doing that underneath an open card would swap the verse out from under
 * whoever is reciting it. A sync that arrives while someone is working waits
 * for them to finish.
 *
 * A count rather than a flag because a list renders many cards and more than
 * one can be open at a time — the library page does not close one to open
 * another.
 *
 * Plain module state, not `$state`: nothing renders from this, and a rune
 * here was an infinite loop — the effect that calls `enter()` reads the
 * counter to increment it, so writing it re-ran the effect that wrote it.
 */
let open = 0;
let waiters: Array<() => void> = [];

function release() {
	const pending = waiters;
	waiters = [];
	for (const resolve of pending) resolve();
}

export const cardActivity = {
	get busy(): boolean {
		return open > 0;
	},

	/** A card entered 암송 or 점검. Pair with `leave` — VerseCard does it from
	 *  an effect's cleanup, so an unmount counts as leaving. */
	enter(): void {
		open += 1;
	},

	leave(): void {
		open = Math.max(0, open - 1);
		if (open === 0) release();
	},

	/**
	 * Resolves once nothing is open, or rejects when the wait runs out.
	 *
	 * Bounded because a card left open on a desk would otherwise hold a sync
	 * forever. The caller is expected to abandon rather than force its way in:
	 * a snapshot applied over someone's recitation is worse than a sync that
	 * happens on the next launch instead.
	 */
	whenIdle(timeoutMs = 60_000): Promise<void> {
		if (open === 0) return Promise.resolve();
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				waiters = waiters.filter((w) => w !== onIdle);
				reject(new Error('cards still open'));
			}, timeoutMs);
			const onIdle = () => {
				clearTimeout(timer);
				resolve();
			};
			waiters.push(onIdle);
		});
	}
};
