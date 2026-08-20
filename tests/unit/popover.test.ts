import { describe, expect, it } from 'vitest';
import { placePopover, type Rect } from '../../src/lib/utils/popover';

/** A 360px phone, which is the narrowest this app targets. */
const PHONE = { width: 360, height: 640 };
const PANEL = { width: 176, height: 240 };

function trigger(over: Partial<Rect> = {}): Rect {
	return { left: 300, right: 328, top: 100, bottom: 128, width: 28, height: 28, ...over };
}

describe('placePopover — horizontal', () => {
	it('aligns its right edge with the trigger when there is room', () => {
		const { left } = placePopover(trigger(), PANEL, PHONE);
		expect(left).toBe(328 - 176);
	});

	// The bug this exists for: a badge near the left edge right-anchored a
	// 176px panel to x=60, putting most of it off-screen at x=-116 where it
	// could be neither read nor tapped.
	it('does not let the panel run off the left edge', () => {
		const { left } = placePopover(trigger({ left: 32, right: 60 }), PANEL, PHONE);
		expect(left).toBe(8);
	});

	// Right-anchoring a wide panel to a trigger near the right edge would push
	// its right edge past the screen.
	it('does not let the panel run off the right edge', () => {
		const { left } = placePopover(trigger({ left: 330, right: 358 }), PANEL, PHONE);
		expect(left).toBe(360 - 176 - 8);
	});

	// Whatever the clamps do, the panel is on screen when it can be.
	it('keeps both edges inside for any trigger across the width', () => {
		for (let right = 20; right <= 360; right += 10) {
			const { left } = placePopover(trigger({ left: right - 28, right }), PANEL, PHONE);
			expect(left).toBeGreaterThanOrEqual(8);
			expect(left + PANEL.width).toBeLessThanOrEqual(360 - 8);
		}
	});

	// Nothing fits; keeping the left edge on screen keeps the text readable
	// from its start rather than clipping the beginning of every line.
	it('favours the left edge when the panel is wider than the screen', () => {
		const { left } = placePopover(trigger(), { width: 400, height: 100 }, PHONE);
		expect(left).toBe(8);
	});
});

describe('placePopover — vertical', () => {
	it('drops below the trigger with a gap', () => {
		expect(placePopover(trigger(), PANEL, PHONE).top).toBe(128 + 6);
	});

	// The check panel puts these badges low on the screen, which is exactly
	// where "always below" hangs the menu off the bottom.
	it('flips above when there is no room below', () => {
		const low = trigger({ top: 560, bottom: 588 });
		expect(placePopover(low, PANEL, PHONE).top).toBe(560 - 6 - 240);
	});

	it('stays on screen when it fits neither way', () => {
		const tall = { width: 176, height: 620 };
		expect(placePopover(trigger({ top: 400, bottom: 428 }), tall, PHONE).top).toBe(8);
	});

	// The boundary itself: exactly enough room below must still go below.
	it('uses the space below when it fits to the pixel', () => {
		const exact = { width: 176, height: 640 - 128 - 6 - 8 };
		expect(placePopover(trigger(), exact, PHONE).top).toBe(134);
	});
});
