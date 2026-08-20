/**
 * What to show where a verse's title goes.
 *
 * A title is optional on a user's own verse — the add form has always let it
 * be left blank, and the import screen does too. What was never decided is
 * what an untitled verse should then look like, so it rendered as an empty
 * heading: a card that reads as broken rather than as deliberately unnamed.
 *
 * The citation takes that place instead. It is not stored as the title —
 * a stored copy would turn "no title" into "titled with its own reference",
 * which is a different fact, survives into the sync file and the export, and
 * cannot be told apart later from a reader who typed it deliberately. This is
 * a display fallback and nothing more.
 *
 * Only ever reached by a user's own verses: every curated package ships a
 * title for every verse.
 */
export function displayTitle(verse: { title?: string | null; cite?: string | null }): string {
	return verse.title?.trim() || verse.cite?.trim() || '';
}

/**
 * Whether the reference still needs a line of its own.
 *
 * False when the title slot is already showing it — the card would otherwise
 * print the same reference twice, once as the heading and once beneath it.
 * The controls that share that line (the reader link, the listen button) stay
 * either way; it is the repeated text that goes.
 */
export function citeShownSeparately(verse: { title?: string | null }): boolean {
	return (verse.title?.trim() ?? '').length > 0;
}
