import { describe, expect, it } from 'vitest';
import { buildPlaylist, reciteGap, trackAt } from '../../src/lib/memorize/playlist';
import {
	citeToSpeech,
	estimateDurationMs,
	speechSegments,
	totalChars
} from '../../src/lib/memorize/speak';

const A = { cite: '창세기 28 : 14', w: '네 자손이 땅의 티끌 같이 되어' };
const B = { cite: '요한복음 3 : 16', w: '하나님이 세상을 이처럼 사랑하사' };
const TITLED = { title: '양  육', cite: '히브리서 11 : 24', w: '믿음으로 모세는' };

describe('buildPlaylist body offsets', () => {
	/*
	 * Where a recite-along gap hangs off. The reader hears the citation, gets
	 * the silence, then hears the verse — so what has to be marked is the exact
	 * character the body starts at, in the same unit the player seeks in.
	 */
	it('marks the character each verse body starts at', () => {
		const list = buildPlaylist([A, B]);
		expect(list.bodyStarts).toEqual([
			citeToSpeech(A.cite).length,
			list.tracks[1].start + citeToSpeech(B.cite).length
		]);
	});

	// The title is spoken before the citation, so it pushes the body along too.
	it('counts a title in the offset', () => {
		const list = buildPlaylist([TITLED], { includeTitle: true });
		expect(list.bodyStarts).toEqual([
			'양 육'.length + citeToSpeech(TITLED.cite).length
		]);
	});

	// speechSegments only pushes a body when there is one to speak; a verse
	// that is all citation has no gap to offer.
	it('marks nothing for a verse with no body', () => {
		expect(buildPlaylist([{ cite: '창세기 1 : 1', w: '   ' }]).bodyStarts).toEqual([]);
	});
});

describe('buildPlaylist', () => {
	it('concatenates every verse into one segment array', () => {
		const list = buildPlaylist([A, B]);
		expect(list.segments).toEqual([...speechSegments(A), ...speechSegments(B)]);
	});

	// The offsets have to be in createPlayer's unit — the sum of raw segment
	// lengths — or seeking would land somewhere other than the bar says.
	it('chars equals what createPlayer will compute from the same segments', () => {
		const list = buildPlaylist([A, B]);
		expect(list.chars).toBe(totalChars(list.segments));
	});

	it('gives each verse a span that starts where the previous one ended', () => {
		const list = buildPlaylist([A, B]);
		expect(list.tracks).toHaveLength(2);
		expect(list.tracks[0].start).toBe(0);
		expect(list.tracks[1].start).toBe(list.tracks[0].length);
		expect(list.tracks[0].length + list.tracks[1].length).toBe(list.chars);
	});

	it('carries the cite and title onto the track', () => {
		const [track] = buildPlaylist([TITLED]).tracks;
		expect(track.cite).toBe('히브리서 11 : 24');
		expect(track.title).toBe('양  육');
	});

	it('includeTitle adds a leading segment and shifts the next verse along', () => {
		const plain = buildPlaylist([TITLED, A]);
		const titled = buildPlaylist([TITLED, A], { includeTitle: true });
		expect(titled.segments.length).toBe(plain.segments.length + 1);
		expect(titled.tracks[1].start).toBeGreaterThan(plain.tracks[1].start);
	});

	// A verse with nothing speakable would otherwise become a zero-length
	// track that trackAt could land on, showing a blank label mid-playback.
	it('skips a verse with no speakable content', () => {
		const list = buildPlaylist([A, { cite: '', w: '   ' }, B]);
		expect(list.tracks).toHaveLength(2);
		expect(list.tracks[1].cite).toBe('요한복음 3 : 16');
	});

	it('returns an empty playlist for no verses', () => {
		expect(buildPlaylist([])).toEqual({ segments: [], tracks: [], bodyStarts: [], chars: 0 });
	});
});

describe('trackAt', () => {
	const list = buildPlaylist([A, B, TITLED]);

	it('returns the first track at 0', () => {
		expect(trackAt(list, 0)).toMatchObject({ index: 0 });
	});

	it('returns the track the fraction falls inside', () => {
		const midSecond = (list.tracks[1].start + list.tracks[1].length / 2) / list.chars;
		expect(trackAt(list, midSecond)).toMatchObject({ index: 1 });
	});

	// Exactly on a boundary belongs to the track that starts there — the
	// reader has just moved on to it, not stayed on the one that ended.
	it('a fraction exactly on a boundary belongs to the starting track', () => {
		expect(trackAt(list, list.tracks[1].start / list.chars)).toMatchObject({ index: 1 });
	});

	// The label at the end of a list should read as the final verse rather
	// than blanking out.
	it('returns the last track at 1', () => {
		expect(trackAt(list, 1)).toMatchObject({ index: 2 });
	});

	it('clamps out-of-range fractions instead of returning null', () => {
		expect(trackAt(list, -0.5)).toMatchObject({ index: 0 });
		expect(trackAt(list, 4)).toMatchObject({ index: 2 });
	});

	it('returns null only for an empty playlist', () => {
		expect(trackAt(buildPlaylist([]), 0.5)).toBeNull();
	});
});

describe('reciteGap', () => {
	const BODY = '그들에게 율례와 법도를 가르쳐서';

	/*
	 * 따라 읽기: the citation, then room to say the verse from memory, then the
	 * verse. A fifth longer than the reading takes, because recalling is slower
	 * than reading — at exactly the spoken length the last words are still
	 * being found when the voice comes back over them.
	 */
	it('leaves a fifth longer than the verse takes to read', () => {
		expect(reciteGap([5], 1)(BODY, 5)).toBe(Math.round(estimateDurationMs(BODY, 1) * 1.2));
	});

	it('says nothing about an offset that is not a body', () => {
		expect(reciteGap([5], 1)(BODY, 0)).toBe(0);
	});

	// The silence is measured in the reader's own reading speed, so slowing the
	// voice down lengthens the room to recite along with it.
	it('follows the reading speed', () => {
		expect(reciteGap([0], 0.5)(BODY, 0)).toBeGreaterThan(reciteGap([0], 1.5)(BODY, 0));
	});

	it('is nothing at all when no body was marked', () => {
		expect(reciteGap([], 1)(BODY, 0)).toBe(0);
	});
});
