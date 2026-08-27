const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** A twelfth of a year, not 30 days. Thirty would make a 364-day gap read as
 *  "12달 전" — a year said the long way — and force a cap to hide it. */
const MONTH = 365 / 12;

/**
 * How long ago, in the coarse Korean units a card has room for.
 *
 * Deliberately coarse: the reader glancing at a card wants "이건 한참 됐다",
 * not a duration. The exact moment is in the history sheet, where there is
 * space to print it.
 *
 * `now` is a parameter so callers can test it against a fixed clock.
 */
export function relativeTimeKo(at: number, now: number = Date.now()): string {
	// Clamped, not signed. checkHistory rows sync between devices with
	// independent clocks, so a record can arrive stamped a little in the
	// future; "-2분 전" would report that drift to the reader as news.
	const delta = Math.max(0, now - at);
	if (delta < MINUTE) return '방금 전';

	const min = Math.floor(delta / MINUTE);
	if (min < 60) return `${min}분 전`;

	const hr = Math.floor(delta / HOUR);
	if (hr < 24) return `${hr}시간 전`;

	const day = Math.floor(delta / DAY);
	const months = Math.floor(day / MONTH);
	if (months < 1) return `${day}일 전`;
	if (months < 12) return `${months}달 전`;
	return `${Math.floor(day / 365)}년 전`;
}

/**
 * The moment itself, where there is room to print it — `8/27 15:40`.
 *
 * No year: this only ever labels checkHistory rows, which are capped at ten
 * per verse, and the relative time beside it already says how far back the
 * oldest one reaches.
 */
export function shortDateKo(at: number): string {
	const d = new Date(at);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
