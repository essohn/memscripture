import { describe, it, expect } from 'vitest';
import {
	decodeTableFile,
	MAX_TABLE_FILE_BYTES,
	TableFileError
} from '../../src/lib/oyo/tableText';

/** CP949 bytes for 요한복음 — what Korean Excel's plain CSV save produces. */
const CP949_YOHAN = new Uint8Array([0xbf, 0xe4, 0xc7, 0xd1, 0xba, 0xb9, 0xc0, 0xbd]);

function utf8(s: string): Uint8Array {
	return new TextEncoder().encode(s);
}

/** Reads the kind off whatever was thrown. Asserting through
 *  `toThrowError(expect.objectContaining(...))` is not reliably supported, and
 *  a helper says what went wrong when the throw is the wrong shape. */
function kindOf(run: () => unknown): string {
	try {
		run();
	} catch (err) {
		return err instanceof TableFileError ? err.kind : `not a TableFileError: ${String(err)}`;
	}
	return 'did not throw';
}

describe('decodeTableFile', () => {
	it('reads UTF-8 as UTF-8', () => {
		const out = decodeTableFile(utf8('장절,제목\n요 3:16,영생'));
		expect(out.encoding).toBe('utf-8');
		expect(out.text).toBe('장절,제목\n요 3:16,영생');
	});

	it('falls back to EUC-KR when strict UTF-8 refuses the bytes', () => {
		const out = decodeTableFile(CP949_YOHAN);
		expect(out.encoding).toBe('euc-kr');
		expect(out.text).toBe('요한복음');
	});

	it('strips a UTF-8 BOM, which Excel writes on "CSV UTF-8"', () => {
		const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('장절')]);
		expect(decodeTableFile(withBom).text).toBe('장절');
	});

	it('refuses a zip, which is almost always a picked .xlsx', () => {
		const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
		expect(kindOf(() => decodeTableFile(zip))).toBe('xlsx');
	});

	it('refuses a file over the size cap', () => {
		const big = new Uint8Array(MAX_TABLE_FILE_BYTES + 1);
		expect(kindOf(() => decodeTableFile(big))).toBe('too-large');
	});

	it('refuses zero bytes', () => {
		expect(kindOf(() => decodeTableFile(new Uint8Array(0)))).toBe('empty');
	});

	it('refuses a file that decodes to nothing but whitespace', () => {
		expect(kindOf(() => decodeTableFile(utf8('   \n\n\t ')))).toBe('empty');
	});

	it('throws a TableFileError, so callers can branch on kind', () => {
		try {
			decodeTableFile(new Uint8Array(0));
			expect.unreachable('should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(TableFileError);
		}
	});
});
