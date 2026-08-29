import { describe, expect, it } from 'vitest';
import { dataGeneration } from '../../src/lib/state/dataGeneration.svelte';

describe('dataGeneration', () => {
	// Read by screens that query the database inside an effect. They have no
	// live query, so a wholesale rewrite underneath them is invisible until
	// something tells them to look again — this counter is that something.
	it('advances on every bump', () => {
		const before = dataGeneration.value;
		dataGeneration.bump();
		expect(dataGeneration.value).toBe(before + 1);
		dataGeneration.bump();
		expect(dataGeneration.value).toBe(before + 2);
	});

	// An effect re-runs when a value it read changes. Handing back the same
	// number twice would leave the screen showing what it read before.
	it('never hands back the same value twice in a row', () => {
		const seen = new Set<number>();
		for (let i = 0; i < 5; i++) {
			seen.add(dataGeneration.value);
			dataGeneration.bump();
		}
		expect(seen.size).toBe(5);
	});
});
