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
