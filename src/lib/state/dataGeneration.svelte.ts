/**
 * How many times the local tables have been rewritten wholesale.
 *
 * Screens that read the database inside an effect read it once, on mount, and
 * nothing tells them the rows underneath have changed — there is no live
 * query. A sync arriving on open would land another device's records in
 * IndexedDB and leave the page showing the empty state it had already read,
 * which is indistinguishable from a sync that did nothing. It was reported as
 * exactly that, twice, before anyone thought to reload.
 *
 * An effect that reads this counter runs again when it moves. Routes with a
 * `+page.ts` are covered by `invalidateAll()` instead; this is for the ones
 * that read directly, the home page among them.
 *
 * A counter rather than a flag: an effect re-runs when a value it read
 * changes, so the signal has to be different every time, not merely true.
 */
class DataGeneration {
	value = $state(0);

	/** Called from applySyncSnapshot — the one place that clears and restores
	 *  the tables, whether a sync or the settings screen's undo drove it. */
	bump(): void {
		this.value += 1;
	}
}

export const dataGeneration = new DataGeneration();
