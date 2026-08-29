/**
 * A set of verses as one thing to listen to.
 *
 * The whole list becomes a single segment array, because that is what
 * createPlayer already takes: seeking, pausing and looping then come from the
 * player unchanged rather than from a playlist state machine that would have
 * to reimplement all three. What is left over is bookkeeping — remembering
 * which stretch of the script each verse occupies, so the bar can say which
 * one is being read.
 */

import { bodyToSpeech, estimateDurationMs, speechSegments } from './speak';

export interface PlaylistVerse {
	title?: string;
	cite: string;
	w: string;
}

export interface PlaylistTrack {
	cite: string;
	title?: string;
	/** Character offset where this verse begins in the flattened script. */
	start: number;
	/** Characters this verse occupies. */
	length: number;
}

export interface Playlist {
	/** Handed to createPlayer() unchanged. */
	segments: string[];
	/** The character each verse's body starts at, for a mode that wants to
	 *  leave a silence in front of it. Empty for verses that are citation
	 *  only — there is nothing to recite, so there is nothing to wait for. */
	bodyStarts: number[];
	tracks: PlaylistTrack[];
	/** Sum of segment lengths — the denominator a progress fraction is of.
	 *  Deliberately the same unit createPlayer's totalChars() computes, so an
	 *  offset means the same thing on both sides. */
	chars: number;
}

export function buildPlaylist(
	verses: PlaylistVerse[],
	opts: { includeTitle?: boolean } = {}
): Playlist {
	const segments: string[] = [];
	const tracks: PlaylistTrack[] = [];
	const bodyStarts: number[] = [];
	let start = 0;

	for (const verse of verses) {
		const segs = speechSegments(verse, opts);
		const length = segs.reduce((n, s) => n + s.length, 0);
		// Nothing to say — no cite that parses, no body. Skipped rather than
		// admitted as a zero-length track, which trackAt could land on and
		// which would show as a blank label mid-playback.
		if (length === 0) continue;
		segments.push(...segs);
		// The body is always the last segment when there is one — speechSegments
		// pushes it after the title and the citation — so everything before it
		// is what stands between the track's start and the body's.
		if (bodyToSpeech(verse.w)) {
			bodyStarts.push(start + segs.slice(0, -1).reduce((n, seg) => n + seg.length, 0));
		}
		tracks.push({ cite: verse.cite, title: verse.title, start, length });
		start += length;
	}

	return { segments, tracks, bodyStarts, chars: start };
}

/**
 * Which verse a progress fraction is inside.
 *
 * Scanned from the back so that a fraction landing exactly on a boundary
 * belongs to the track that starts there — the reader has moved on to it,
 * not stayed on the one that just ended — and so that 1 resolves to the last
 * track rather than falling off the end.
 */
export function trackAt(
	list: Playlist,
	fraction: number
): { index: number; track: PlaylistTrack } | null {
	if (list.tracks.length === 0) return null;
	const clamped = Math.min(1, Math.max(0, fraction));
	const offset = clamped * list.chars;
	for (let i = list.tracks.length - 1; i >= 0; i--) {
		if (offset >= list.tracks[i].start) return { index: i, track: list.tracks[i] };
	}
	return { index: 0, track: list.tracks[0] };
}

/**
 * How much longer than the reading the silence runs.
 *
 * Recalling a verse is slower than reading one off a page: the first words
 * come at once and the last are still being found. At exactly the spoken
 * length the voice comes back over the reader mid-sentence, which teaches them
 * to rush. A fifth is enough to finish on and short enough that the wait never
 * feels like the app has stopped.
 */
const RECITE_GAP_RATIO = 1.2;

/**
 * The silence 따라 읽기 leaves in front of each verse.
 *
 * Shaped for createPlayer's `gapBefore`: it is asked about every segment and
 * answers only for the ones a body starts at, so citations and titles play
 * straight through. Measured in the reader's own reading speed — slowing the
 * voice lengthens the room to recite along with it.
 */
export function reciteGap(
	bodyStarts: number[],
	rate: number
): (text: string, offset: number) => number {
	const starts = new Set(bodyStarts);
	return (text, offset) =>
		starts.has(offset) ? Math.round(estimateDurationMs(text, rate) * RECITE_GAP_RATIO) : 0;
}
