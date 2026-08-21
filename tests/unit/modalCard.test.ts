import { describe, expect, it } from 'vitest';
import { placeModalCard } from '../../src/lib/utils/modalCard';

/** A phone, with the app's fixed tab bar at the foot. */
const H = 800;
const TAB_BAR = 64;

describe('placeModalCard', () => {
	// The card the reader tapped should look like that same card, lifted —
	// not a different one that appeared somewhere else.
	it('keeps the card where it was, and the width it had', () => {
		const p = placeModalCard({ left: 20, top: 120, width: 350 }, H, TAB_BAR);
		expect(p).toMatchObject({ left: 20, top: 120, width: 350 });
	});

	it('gives it the room between there and the tab bar', () => {
		const p = placeModalCard({ left: 20, top: 120, width: 350 }, H, TAB_BAR);
		expect(p.maxHeight).toBe(H - TAB_BAR - 16 - 120);
	});

	// A card tapped near the bottom has nowhere to grow, and squeezing a
	// textarea, a pace bar and four buttons into a sliver is worse than moving.
	it('moves a card up when staying put would leave no room', () => {
		const p = placeModalCard({ left: 20, top: 640, width: 350 }, H, TAB_BAR);
		expect(p.top).toBeLessThan(640);
		expect(p.maxHeight).toBeGreaterThanOrEqual(340);
	});

	it('never rises past the top margin', () => {
		const p = placeModalCard({ left: 20, top: 700, width: 350 }, 380, TAB_BAR);
		expect(p.top).toBeGreaterThanOrEqual(16);
	});

	// The panel grows as it is typed into and shrinks again on success. A
	// fixed height would reintroduce exactly the shifting this removes.
	it('reports a ceiling, not a height', () => {
		const tall = placeModalCard({ left: 0, top: 40, width: 300 }, 1200, TAB_BAR);
		const short = placeModalCard({ left: 0, top: 40, width: 300 }, 600, TAB_BAR);
		expect(tall.maxHeight).toBeGreaterThan(short.maxHeight);
	});

	// Without the inset the card would settle underneath the tab bar, where
	// its 닫기 button cannot be reached.
	it('clears fixed chrome at the foot', () => {
		const withBar = placeModalCard({ left: 0, top: 100, width: 300 }, H, TAB_BAR);
		const without = placeModalCard({ left: 0, top: 100, width: 300 }, H, 0);
		expect(without.maxHeight - withBar.maxHeight).toBe(TAB_BAR);
	});

	it('still yields a usable panel on a very short viewport', () => {
		expect(placeModalCard({ left: 0, top: 10, width: 300 }, 300, TAB_BAR).maxHeight)
			.toBeGreaterThanOrEqual(340);
	});
});
