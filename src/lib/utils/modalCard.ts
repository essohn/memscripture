/**
 * Where a card sits once it lifts out of the list to be checked.
 *
 * It keeps the list's left edge and width so the verse does not jump sideways
 * as it rises — the card the reader tapped should look like the same card,
 * lifted, not a different one that appeared.
 *
 * Vertically it is placed so the whole card *fits*. An earlier version capped
 * its height and let it scroll inside, which put a scrollbar around a panel
 * that is already a form: the textarea scrolls, the page behind is locked, and
 * a third scrolling region between them is one too many. The card moves
 * instead of shrinking.
 */

/** Clear of the screen edge, and of the fixed tab bar at the foot. */
export const MARGIN = 16;

export interface ModalFit {
	top: number;
	/** A ceiling only when the card cannot fit the screen at all — otherwise
	 *  null, meaning "as tall as it needs to be" and no inner scrolling. */
	maxHeight: number | null;
}

/**
 * @param preferredTop where the card sat in the list, which is where it stays
 *        whenever the content allows
 * @param currentTop where it is now, or null on first placement. Passed so a
 *        panel that grows slides the card up and a panel that shrinks leaves
 *        it be — bouncing back down as the success view replaces the form
 *        would be the movement this whole change removes.
 * @param bottomInset fixed chrome at the foot of the screen (the tab bar)
 */
export function fitModalCard(
	preferredTop: number,
	contentHeight: number,
	viewportHeight: number,
	bottomInset: number,
	currentTop: number | null = null
): ModalFit {
	const floor = viewportHeight - bottomInset - MARGIN;
	const available = floor - MARGIN;

	// Taller than the screen even at the top margin: nothing to be done but
	// let it scroll, which is the one case a scrollbar is honest.
	if (contentHeight > available) return { top: MARGIN, maxHeight: available };

	const highestNeeded = floor - contentHeight;
	const from = currentTop ?? preferredTop;
	return { top: Math.max(MARGIN, Math.min(from, highestNeeded)), maxHeight: null };
}
