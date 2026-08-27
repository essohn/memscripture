/**
 * Turns the bytes of a picked file into text a parser can read.
 *
 * The encoding fallback is the reason this module exists. Korean Excel's
 * plain "CSV 저장" writes CP949, not UTF-8, and `File.text()` assumes UTF-8 —
 * which turns 요한복음 into mojibake and raises nothing. Decoding strictly
 * first makes the wrong guess *fail* instead of succeeding quietly, and a
 * failure is something we can act on.
 */

export type TableFileErrorKind = 'too-large' | 'xlsx' | 'empty';

/** Carries a `kind` rather than a message, so the screen owns the Korean
 *  copy and this module owns the facts. */
export class TableFileError extends Error {
	readonly kind: TableFileErrorKind;

	constructor(kind: TableFileErrorKind) {
		super(kind);
		this.name = 'TableFileError';
		this.kind = kind;
	}
}

/** A verse list is kilobytes. Two megabytes is far past any real table and
 *  keeps a mis-picked video out of the decoder. */
export const MAX_TABLE_FILE_BYTES = 2 * 1024 * 1024;

export interface DecodedTable {
	text: string;
	/** Which decode won. Read by the tests; no screen mentions it. */
	encoding: 'utf-8' | 'euc-kr';
}

/** Local zip file header. Every .xlsx starts with it, because .xlsx is a zip. */
function looksLikeZip(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 4 &&
		bytes[0] === 0x50 &&
		bytes[1] === 0x4b &&
		bytes[2] === 0x03 &&
		bytes[3] === 0x04
	);
}

export function decodeTableFile(bytes: Uint8Array): DecodedTable {
	if (bytes.length > MAX_TABLE_FILE_BYTES) throw new TableFileError('too-large');
	if (bytes.length === 0) throw new TableFileError('empty');
	// Checked before decoding: a zip's bytes are not text in any encoding, and
	// "this is an Excel file" is a far more useful thing to say than "this file
	// is unreadable".
	if (looksLikeZip(bytes)) throw new TableFileError('xlsx');

	let text: string;
	let encoding: 'utf-8' | 'euc-kr';
	try {
		// `fatal` is the whole point — without it a CP949 byte becomes U+FFFD
		// and the decode "succeeds" with garbage.
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		encoding = 'utf-8';
	} catch {
		try {
			// Required of every browser by the Encoding Standard, and present in
			// Node's full-ICU build, so this costs no dependency.
			text = new TextDecoder('euc-kr').decode(bytes);
			encoding = 'euc-kr';
		} catch {
			// A failed fallback decode is the same situation as empty bytes: nothing
			// readable came out of it, and the reader already knows what to do.
			throw new TableFileError('empty');
		}
	}

	// Excel's "CSV UTF-8" writes a BOM. Left in place it would ride along on
	// the first header cell and stop it matching any synonym.
	if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
	if (text.trim().length === 0) throw new TableFileError('empty');

	return { text, encoding };
}
