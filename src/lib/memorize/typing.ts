/**
 * Whether this keystroke means "submit".
 *
 * Enter submits. Shift+Enter keeps the newline, and a composing Enter is
 * ignored: Korean input uses Enter to commit a syllable, so submitting on that
 * keystroke would fire while the reader was mid-word.
 *
 * Extracted from the check panel because the quiz's typing round needs the
 * same rule, and a copy of it is a copy that gets fixed once.
 */
export function submitsOnEnter(e: {
	key: string;
	shiftKey: boolean;
	isComposing: boolean;
}): boolean {
	return e.key === 'Enter' && !e.shiftKey && !e.isComposing;
}

/**
 * Does this element act on Enter by itself?
 *
 * A window-level Enter handler is for the case where nothing is focused. When
 * something is, that something has already done its job with the keystroke —
 * a button has fired, a box has submitted — and the event carries on up
 * regardless. Acting on it again is one keystroke doing two things, which is
 * how 퍼펙트 게임 came to submit and skip to the next verse at once, leaving
 * the reader with no idea whether they had been right.
 */
export function ownsEnter(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	return ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
