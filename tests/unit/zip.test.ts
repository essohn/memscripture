// The project's default jsdom test environment gives TextEncoder() output
// and Uint8Array literals different realms, so chai's constructor check in
// toEqual() reports byte-identical arrays as unequal. This file does no DOM
// work, so run it under Node's single realm instead.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { crc32, zipStore } from '../../src/lib/export/zip';

const enc = new TextEncoder();

function u32(b: Uint8Array, o: number): number {
	return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}
function u16(b: Uint8Array, o: number): number {
	return b[o] | (b[o + 1] << 8);
}

describe('crc32', () => {
	// Published CRC-32/ISO-HDLC check vectors.
	it('matches known vectors', () => {
		expect(crc32(enc.encode(''))).toBe(0);
		expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
		expect(crc32(enc.encode('a'))).toBe(0xe8b7be43);
	});
});

describe('zipStore', () => {
	const entries = [
		{ name: 'hello.txt', bytes: enc.encode('hello') },
		{ name: 'dir/second.xml', bytes: enc.encode('<a/>') }
	];

	it('starts with a local file header', () => {
		expect(u32(zipStore(entries), 0)).toBe(0x04034b50);
	});

	it('ends with an end-of-central-directory record naming every entry', () => {
		const z = zipStore(entries);
		const eocd = z.length - 22;
		expect(u32(z, eocd)).toBe(0x06054b50);
		expect(u16(z, eocd + 10)).toBe(2); // total entries
		const dirOffset = u32(z, eocd + 16);
		const dirSize = u32(z, eocd + 12);
		expect(u32(z, dirOffset)).toBe(0x02014b50); // central directory header
		expect(dirOffset + dirSize).toBe(eocd);
	});

	// The central directory's stated offset for each entry must actually land
	// on that entry's local header — the single easiest thing to get wrong,
	// and the one that makes Excel offer to "repair" the file.
	it('points each central directory record at its local header', () => {
		const z = zipStore(entries);
		const eocd = z.length - 22;
		let p = u32(z, eocd + 16);
		for (const entry of entries) {
			expect(u32(z, p)).toBe(0x02014b50);
			const nameLen = u16(z, p + 28);
			const localOffset = u32(z, p + 42);
			expect(u32(z, localOffset)).toBe(0x04034b50);
			const localNameLen = u16(z, localOffset + 26);
			const name = new TextDecoder().decode(
				z.subarray(localOffset + 30, localOffset + 30 + localNameLen)
			);
			expect(name).toBe(entry.name);
			const dataStart = localOffset + 30 + localNameLen + u16(z, localOffset + 28);
			expect(z.subarray(dataStart, dataStart + entry.bytes.length)).toEqual(entry.bytes);
			p += 46 + nameLen;
		}
	});

	it('stores entries uncompressed with matching sizes', () => {
		const z = zipStore(entries);
		expect(u16(z, 8)).toBe(0); // compression method: STORE
		expect(u32(z, 18)).toBe(u32(z, 22)); // compressed size === uncompressed
		expect(u32(z, 14)).toBe(crc32(entries[0].bytes));
	});

	it('is deterministic', () => {
		expect(zipStore(entries)).toEqual(zipStore(entries));
	});
});
