export interface Rect {
	left: number;
	right: number;
	top: number;
	bottom: number;
	width: number;
	height: number;
}

export interface Viewport {
	width: number;
	height: number;
}

/** Kept clear of the screen edge so the panel never looks sheared off. */
const MARGIN = 8;
/** Between the trigger and the panel, so the two read as separate. */
const GAP = 6;

/**
 * Where to put a popover so it stays on screen.
 *
 * Anchored to the trigger's right edge, which is what a badge in a right-hand
 * cluster wants — but only as a preference. The previous version expressed
 * that anchor as a CSS `right` offset, which pinned the panel's right edge and
 * let its left edge run wherever the width took it: a badge near the left of a
 * phone put a 160px menu half off the screen, invisible and unusable. An
 * anchor is a preference; staying on screen is not.
 *
 * Vertically it prefers below and flips above when there is no room, rather
 * than hanging off the bottom on a short screen — the same failure in the
 * other axis, and the check panel puts these badges low.
 *
 * Pure, and takes plain rectangles, so every edge case is a table in a test
 * instead of a phone held at the right moment.
 */
export function placePopover(
	trigger: Rect,
	popover: { width: number; height: number },
	viewport: Viewport
): { left: number; top: number } {
	// Right edges aligned, then pulled back inside whichever edge it crosses.
	// The lower clamp wins on a viewport too narrow for the panel at all,
	// which keeps the left edge — where the content starts — readable.
	const maxLeft = viewport.width - popover.width - MARGIN;
	const left = Math.max(MARGIN, Math.min(trigger.right - popover.width, maxLeft));

	const below = trigger.bottom + GAP;
	const fitsBelow = below + popover.height + MARGIN <= viewport.height;
	const top = fitsBelow ? below : Math.max(MARGIN, trigger.top - GAP - popover.height);

	return { left, top };
}
