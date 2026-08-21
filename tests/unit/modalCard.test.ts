import { describe, expect, it } from 'vitest';
import { fitModalCard, MARGIN } from '../../src/lib/utils/modalCard';

/** A phone, with the app's fixed tab bar at the foot. */
const H = 800;
const TAB_BAR = 64;
const floor = H - TAB_BAR - MARGIN;

describe('fitModalCard', () => {
	// The card the reader tapped should look like that same card, lifted —
	// not a different one that appeared somewhere else.
	it('leaves the card where it was when the panel fits', () => {
		expect(fitModalCard(120, 400, H, TAB_BAR)).toEqual({ top: 120, maxHeight: null });
	});

	// A scrollbar around a panel that is already a form is one scrolling
	// region too many: the textarea scrolls and the page behind is locked.
	it('does not cap the height in the ordinary case', () => {
		expect(fitModalCard(120, 400, H, TAB_BAR).maxHeight).toBeNull();
	});

	it('slides the card up so its foot clears the tab bar', () => {
		const fit = fitModalCard(600, 300, H, TAB_BAR);
		expect(fit.top).toBe(floor - 300);
		expect(fit.top + 300).toBeLessThanOrEqual(floor);
		expect(fit.maxHeight).toBeNull();
	});

	// A panel that shrinks — the success view replacing the form — must not
	// drop the card back down. Bouncing is the movement this change removes.
	it('stays put when the panel shrinks', () => {
		const grown = fitModalCard(600, 300, H, TAB_BAR);
		const shrunk = fitModalCard(600, 180, H, TAB_BAR, grown.top);
		expect(shrunk.top).toBe(grown.top);
	});

	it('keeps sliding up as the panel grows', () => {
		const first = fitModalCard(200, 300, H, TAB_BAR, 200);
		const taller = fitModalCard(200, 600, H, TAB_BAR, first.top);
		expect(taller.top).toBeLessThan(first.top);
	});

	// A panel exactly as tall as the space available lands on the margin, and
	// nothing lands above it.
	it('never rises past the top margin', () => {
		const exact = floor - MARGIN;
		expect(fitModalCard(600, exact, H, TAB_BAR).top).toBe(MARGIN);
		for (const h of [100, 400, exact, exact + 200]) {
			expect(fitModalCard(600, h, H, TAB_BAR).top).toBeGreaterThanOrEqual(MARGIN);
		}
	});

	// Taller than the screen even at the top margin: a scrollbar is the
	// honest answer, and the only case that gets one.
	it('lets a card taller than the screen scroll inside', () => {
		const fit = fitModalCard(100, 5000, H, TAB_BAR);
		expect(fit).toEqual({ top: MARGIN, maxHeight: floor - MARGIN });
	});

	// Without the inset the card would settle under the tab bar, where its
	// 닫기 button cannot be reached.
	it('accounts for fixed chrome at the foot', () => {
		const withBar = fitModalCard(600, 300, H, TAB_BAR);
		const without = fitModalCard(600, 300, H, 0);
		expect(without.top - withBar.top).toBe(TAB_BAR);
	});
});
