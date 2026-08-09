/**
 * Minimal ZIP writer — exactly enough container for the .xlsx export.
 *
 * Every entry is STORED (uncompressed). A 149-row workbook is tens of
 * kilobytes either way, and skipping DEFLATE removes a compression
 * dependency and a second code path with it.
 */

const CRC_TABLE = /* @__PURE__ */ (() => {
	const t = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[i] = c >>> 0;
	}
	return t;
})();

/** CRC-32/ISO-HDLC, the variant ZIP requires. */
export function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
	name: string;
	bytes: Uint8Array;
}

// A fixed 1980-01-01 stamp keeps output byte-identical across runs, which is
// what lets the tests compare whole archives. An all-zero DOS date is not a
// legal date and upsets some readers, so use the epoch of the format itself.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

// Bit 11 declares that names are UTF-8. All names here are ASCII, but saying
// so costs nothing and keeps the door open for non-ASCII entry names.
const FLAG_UTF8 = 0x0800;

class ByteWriter {
	private buf = new Uint8Array(1024);
	private len = 0;

	private grow(n: number): void {
		if (this.len + n <= this.buf.length) return;
		let cap = this.buf.length * 2;
		while (cap < this.len + n) cap *= 2;
		const next = new Uint8Array(cap);
		next.set(this.buf.subarray(0, this.len));
		this.buf = next;
	}

	u16(v: number): void {
		this.grow(2);
		this.buf[this.len++] = v & 0xff;
		this.buf[this.len++] = (v >>> 8) & 0xff;
	}

	u32(v: number): void {
		this.grow(4);
		for (let i = 0; i < 4; i++) this.buf[this.len++] = (v >>> (i * 8)) & 0xff;
	}

	raw(b: Uint8Array): void {
		this.grow(b.length);
		this.buf.set(b, this.len);
		this.len += b.length;
	}

	get offset(): number {
		return this.len;
	}

	take(): Uint8Array {
		return this.buf.slice(0, this.len);
	}
}

export function zipStore(entries: ZipEntry[]): Uint8Array {
	const w = new ByteWriter();
	const enc = new TextEncoder();
	const dir: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];

	for (const e of entries) {
		const name = enc.encode(e.name);
		const crc = crc32(e.bytes);
		const offset = w.offset;
		w.u32(0x04034b50); // local file header
		w.u16(20); // version needed to extract
		w.u16(FLAG_UTF8);
		w.u16(0); // method: STORE
		w.u16(DOS_TIME);
		w.u16(DOS_DATE);
		w.u32(crc);
		w.u32(e.bytes.length); // compressed size — equal, because STORE
		w.u32(e.bytes.length); // uncompressed size
		w.u16(name.length);
		w.u16(0); // extra field length
		w.raw(name);
		w.raw(e.bytes);
		dir.push({ name, crc, size: e.bytes.length, offset });
	}

	const dirStart = w.offset;
	for (const d of dir) {
		w.u32(0x02014b50); // central directory header
		w.u16(20); // version made by
		w.u16(20); // version needed
		w.u16(FLAG_UTF8);
		w.u16(0);
		w.u16(DOS_TIME);
		w.u16(DOS_DATE);
		w.u32(d.crc);
		w.u32(d.size);
		w.u32(d.size);
		w.u16(d.name.length);
		w.u16(0); // extra length
		w.u16(0); // comment length
		w.u16(0); // disk number start
		w.u16(0); // internal attributes
		w.u32(0); // external attributes
		w.u32(d.offset);
		w.raw(d.name);
	}
	const dirSize = w.offset - dirStart;

	w.u32(0x06054b50); // end of central directory
	w.u16(0); // this disk
	w.u16(0); // disk with central directory
	w.u16(dir.length); // entries on this disk
	w.u16(dir.length); // entries total
	w.u32(dirSize);
	w.u32(dirStart);
	w.u16(0); // comment length
	return w.take();
}
