/**
 * Where a card sits once it lifts out of the list to be checked.
 *
 * It keeps the list's left edge and width so the verse does not jump sideways
 * as it rises — the card the reader tapped should look like the same card,
 * lifted, not a different one that appeared. Vertically it starts where it
 * was, and only moves when staying there would leave no room for the panel.
 */

/** Clear of the screen edge, and of the fixed tab bar at the foot. */
const MARGIN = 16;

/** Below this a check panel is not worth showing in place — a textarea, a
 *  pace bar and four buttons need room, and squeezing them into a sliver is
 *  worse than moving the card up the screen to make space. */
const MIN_HEIGHT = 340;

export interface CardBox {
	left: number;
	top: number;
	width: number;
}

export interface ModalPlacement {
	left: number;
	top: number;
	width: number;
	maxHeight: number;
}

/**
 * `bottomInset` is whatever fixed chrome covers the foot of the screen — the
 * tab bar — so a card lifted near the bottom does not end up underneath it.
 *
 * The height is a *max*, not a height: the panel grows as it is typed into and
 * shrinks again on success, and pinning an exact height would reintroduce the
 * shifting this whole change exists to remove. It scrolls inside instead.
 */
export function placeModalCard(
	card: CardBox,
	viewportHeight: number,
	bottomInset = 0
): ModalPlacement {
	const floor = viewportHeight - bottomInset - MARGIN;
	const roomBelow = floor - card.top;

	// Staying put is the first choice; it is what makes the card look lifted
	// rather than relocated.
	const top =
		roomBelow >= MIN_HEIGHT ? card.top : Math.max(MARGIN, floor - MIN_HEIGHT);

	return {
		left: card.left,
		top,
		width: card.width,
		maxHeight: Math.max(MIN_HEIGHT, floor - top)
	};
}
