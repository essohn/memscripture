/**
 * The one whitespace rule for text arriving from outside this app.
 *
 * Scripture reaches us from a link payload, a pasted spreadsheet cell and a
 * CSV field, and each of those carries its own idea of a line break. A verse
 * is stored as one line, so every door squeezes runs of whitespace to a
 * single space and trims the ends — here, once, rather than three times.
 *
 * Takes `unknown` because callers are reading parsed JSON and array indexes
 * that may not hold a string at all; a non-string is not an error, it is an
 * absent value, and absent reads as ''.
 */
export function cleanText(value: unknown): string {
	return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}
