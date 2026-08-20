import { describe, expect, it } from 'vitest';
import {
	buildImportLink,
	duplicateIndexes,
	MAX_IMPORT_VERSES,
	normalizeCite,
	parseImportFragment,
	readFragmentParam,
	resolveTitle,
	type ImportVerse
} from '../../src/lib/oyo/importLink';

/** Exactly the one liner the sending app is documented to use — btoa over a
 *  UTF-8 encoding, wrapped in encodeURIComponent. If this stops parsing, the
 *  contract broke, whatever the rest of the suite says. */
function senderEncodes(payload: unknown): string {
	const json = JSON.stringify(payload);
	return `#v=${encodeURIComponent(btoa(unescape(encodeURIComponent(json))))}`;
}

const VERSE = { cite: '창세기 12 : 1', w: '여호와께서 아브람에게 이르시되' };

describe('readFragmentParam', () => {
	it('reads the payload with or without the leading hash', () => {
		expect(readFragmentParam('#v=abc')).toBe('abc');
		expect(readFragmentParam('v=abc')).toBe('abc');
	});

	it('finds it among other parameters', () => {
		expect(readFragmentParam('#from=wbible&v=abc')).toBe('abc');
	});

	it('is null when absent or empty', () => {
		expect(readFragmentParam('')).toBeNull();
		expect(readFragmentParam('#v=')).toBeNull();
		expect(readFragmentParam('#other=1')).toBeNull();
	});
});

describe('parseImportFragment', () => {
	it('accepts what the sender is told to send', () => {
		const r = parseImportFragment(
			senderEncodes({ v: 1, source: 'bible.lifescripture.org', verses: [VERSE] })
		);
		expect(r).toEqual({
			ok: true,
			payload: {
				source: 'bible.lifescripture.org',
				verses: [{ cite: '창세기 12 : 1', title: null, w: VERSE.w }]
			}
		});
	});

	// The obvious sender one liner emits +/=; a URL-safe encoder emits -_ and
	// strips the padding. A receiver that understood only one would fail on a
	// link that looks perfectly correct.
	it('accepts base64url as readily as standard base64', () => {
		const json = JSON.stringify({ v: 1, verses: [VERSE] });
		const std = btoa(unescape(encodeURIComponent(json)));
		const url = std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		expect(parseImportFragment(`#v=${url}`).ok).toBe(true);
	});

	// Korean is the whole corpus. atob alone yields one byte per character,
	// which would turn every syllable into mojibake.
	it('round-trips Korean text intact', () => {
		const r = parseImportFragment(senderEncodes({ v: 1, verses: [VERSE] }));
		expect(r.ok && r.payload.verses[0].w).toBe('여호와께서 아브람에게 이르시되');
	});

	it('omits an absent title rather than sending null', () => {
		const link = buildImportLink('https://x', {
			source: null,
			verses: [{ cite: '창세기 12 : 1', title: null, w: VERSE.w }]
		});
		const json = decodeURIComponent(new URL(link).hash.replace('#v=', ''));
		expect(atob(json)).not.toContain('title');
	});

	it('round-trips a link this module builds', () => {
		const link = buildImportLink('https://mem.lifescripture.org', {
			source: null,
			verses: [{ cite: '창세기 12 : 1', title: '부르심', w: VERSE.w }]
		});
		const r = parseImportFragment(new URL(link).hash);
		expect(r.ok && r.payload.verses[0]).toEqual({
			cite: '창세기 12 : 1',
			title: '부르심',
			w: VERSE.w
		});
	});

	it.each([
		['nothing to import', '', 'missing'],
		['a truncated payload', '#v=not-base64!!', 'malformed'],
		['a payload that is not JSON', `#v=${btoa('hello')}`, 'malformed']
	])('reports %s', (_label, hash, reason) => {
		expect(parseImportFragment(hash)).toEqual({ ok: false, reason });
	});

	// A sender speaking a protocol this build does not know must be told so,
	// not silently half-understood.
	it('refuses a version it does not know', () => {
		expect(parseImportFragment(senderEncodes({ v: 2, verses: [VERSE] }))).toEqual({
			ok: false,
			reason: 'version'
		});
	});

	it('refuses a link with more verses than it will take', () => {
		const many = Array.from({ length: MAX_IMPORT_VERSES + 1 }, () => VERSE);
		expect(parseImportFragment(senderEncodes({ v: 1, verses: many }))).toEqual({
			ok: false,
			reason: 'too-many'
		});
	});

	it('takes a link right at the limit', () => {
		const many = Array.from({ length: MAX_IMPORT_VERSES }, () => VERSE);
		expect(parseImportFragment(senderEncodes({ v: 1, verses: many })).ok).toBe(true);
	});

	// Lenient about rows, strict about the envelope: one bad entry among
	// twenty must not cost the reader the other nineteen.
	it('drops rows with no scripture and keeps the rest', () => {
		const r = parseImportFragment(
			senderEncodes({
				v: 1,
				verses: [VERSE, { cite: '창세기 12 : 2', w: '   ' }, 'nonsense', null]
			})
		);
		expect(r.ok && r.payload.verses).toHaveLength(1);
	});

	it('reports empty when no row survives', () => {
		expect(parseImportFragment(senderEncodes({ v: 1, verses: [{ cite: 'x' }] }))).toEqual({
			ok: false,
			reason: 'empty'
		});
	});

	// Null, not a citation-shaped default: the screen can only leave its title
	// field empty — with the citation as a placeholder — if it can tell "the
	// sender named this" from "nobody has named it yet".
	it('reports no title when the sender sent none', () => {
		const r = parseImportFragment(senderEncodes({ v: 1, verses: [VERSE] }));
		expect(r.ok && r.payload.verses[0].title).toBeNull();
	});

	it('treats a blank title as none at all', () => {
		const r = parseImportFragment(senderEncodes({ v: 1, verses: [{ ...VERSE, title: '   ' }] }));
		expect(r.ok && r.payload.verses[0].title).toBeNull();
	});

	it('keeps a title the sender supplied', () => {
		const r = parseImportFragment(
			senderEncodes({ v: 1, verses: [{ ...VERSE, title: '부르심' }] })
		);
		expect(r.ok && r.payload.verses[0].title).toBe('부르심');
	});

	it('has no source when the sender names none', () => {
		const r = parseImportFragment(senderEncodes({ v: 1, verses: [VERSE] }));
		expect(r.ok && r.payload.source).toBeNull();
	});
});

describe('normalizeCite', () => {
	// An imported verse should be indistinguishable from one added by hand.
	it.each([
		['창 12:1', '창세기 12 : 1'],
		['창세기 12:1-3', '창세기 12 : 1-3'],
		['  창세기  12 : 1  ', '창세기 12 : 1']
	])('%s → %s', (raw, expected) => {
		expect(normalizeCite(raw)).toBe(expected);
	});

	// The sender may know a book naming this app does not. A verse whose
	// reference reads oddly beats no verse at all.
	it('keeps a citation it cannot parse rather than dropping it', () => {
		expect(normalizeCite('토비트 3 : 1')).toBe('토비트 3 : 1');
	});
});

describe('duplicateIndexes', () => {
	const incoming: ImportVerse[] = [
		{ cite: '창세기 12 : 1', title: 'a', w: 'a' },
		{ cite: '창세기 12 : 2', title: 'b', w: 'b' }
	];

	it('flags what the reader already has', () => {
		expect([...duplicateIndexes(incoming, ['창세기 12 : 1'])]).toEqual([0]);
	});

	// A hand-typed OYO citation was never normalized on the way in.
	it('matches a hand-typed citation in the other shape', () => {
		expect([...duplicateIndexes(incoming, ['창 12:2'])]).toEqual([1]);
	});

	it('flags nothing against an empty library', () => {
		expect(duplicateIndexes(incoming, []).size).toBe(0);
	});

	it('ignores blank rows in the library', () => {
		expect(duplicateIndexes(incoming, ['', '   ']).size).toBe(0);
	});
});


describe('resolveTitle', () => {
	it('uses what the reader typed', () => {
		expect(resolveTitle('  부르심 ', '창세기 12 : 1')).toBe('부르심');
	});

	// The OYO card renders the title as its heading; an untitled card reads as
	// broken rather than as deliberately unnamed.
	it('falls back to the citation when the field is left empty', () => {
		expect(resolveTitle('', '창세기 12 : 1')).toBe('창세기 12 : 1');
		expect(resolveTitle('   ', '창세기 12 : 1')).toBe('창세기 12 : 1');
	});
});
