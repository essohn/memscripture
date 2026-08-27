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

import { speechSegments } from './speak';

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
	let start = 0;

	for (const verse of verses) {
		const segs = speechSegments(verse, opts);
		const length = segs.reduce((n, s) => n + s.length, 0);
		// Nothing to say — no cite that parses, no body. Skipped rather than
		// admitted as a zero-length track, which trackAt could land on and
		// which would show as a blank label mid-playback.
		if (length === 0) continue;
		segments.push(...segs);
		tracks.push({ cite: verse.cite, title: verse.title, start, length });
		start += length;
	}

	return { segments, tracks, chars: start };
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
