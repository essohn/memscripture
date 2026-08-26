import type { EventRange, MemEvent } from '$lib/types';
import type { VerseRating } from './local';
import { db } from './local';
import { loadPackageData, filterVerses, isPackageInstalled } from './verses';
import { listPerfectVerseNos } from './checkHistory';
import { getJoinedGroups } from './groups';
import { visibleTo } from '$lib/groups/visibility';

/** D-day = dueAt 자정 − today 자정, 일 단위. 둘 다 'YYYY-MM-DD' 로컬. */
export function dDay(dueAt: string, today: string): number {
	const due = Date.parse(`${dueAt}T00:00:00`);
	const now = Date.parse(`${today}T00:00:00`);
	return Math.round((due - now) / 86_400_000);
}

/** startAt(있으면) <= today <= dueAt 인 이벤트만, dueAt 오름차순. */
export function activeEvents(events: MemEvent[], today: string): MemEvent[] {
	return events
		.filter((e) => (e.startAt ? e.startAt <= today : true) && today <= e.dueAt)
		.sort((a, b) => (a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0));
}

/**
 * "암송 완료" 판정. 정의를 바꾸려면 이 함수만 수정.
 *
 * A verse counts once the reader has rated both its opening and its whole
 * text — the point at which they have actually worked through it.
 *
 * This replaced `bucket === 'mastered'`, which no code ever assigned:
 * advanceBucket promotes new → current → old and stops, so the counter could
 * only ever read 0/N. Note the underlying gap is still open — the scheduler
 * excludes 'mastered' from the review queue, so nothing currently graduates
 * out of review either. That is an SRS problem, not this counter's.
 */
export function isMemorized(rating: VerseRating | undefined): boolean {
	return rating?.startDifficulty != null && rating?.fullDifficulty != null;
}

/**
 * 홈 이벤트 카드 링크.
 *
 * `range=`, not `sel=`. A recent-bundle link restores a selection the reader
 * built, so it opens in selection mode; an event card means "show me these
 * verses to study", where selection mode would put a tap on the wrong action.
 * They looked alike enough to share a parameter, and that is exactly what made
 * the list open in selection mode when the reader came to practise.
 */
export function rangeHref(range: EventRange, verseNos: number[]): string {
	const params = new URLSearchParams();
	params.set('range', verseNos.join(','));
	if (range.seriesIndex !== null && range.seriesIndex !== undefined) {
		params.set('s', String(range.seriesIndex));
	}
	if (range.groupIndices && range.groupIndices.length > 0) {
		params.set('g', range.groupIndices.join(','));
	}
	return `/library/${range.packageId}?${params.toString()}`;
}

/** 라이브러리 선택을 events.json에 붙여넣을 EventRange JSON 조각으로 직렬화. */
export function serializeEventRange(
	packageId: string,
	verseNos: number[],
	seriesIndex: number | null,
	groupIndices: number[],
	label = ''
): string {
	const range: EventRange = { packageId, verseNos: [...verseNos].sort((a, b) => a - b) };
	if (seriesIndex !== null) range.seriesIndex = seriesIndex;
	if (groupIndices.length > 0) range.groupIndices = groupIndices;
	range.label = label;
	return JSON.stringify(range, null, 2);
}

const EVENTS_URL = '/data/events.json';
let eventsCache: MemEvent[] | null = null;

/** Test-only: clear the module-level events cache between tests. */
export function _resetEventsCache(): void {
	eventsCache = null;
}

export async function loadEvents(): Promise<MemEvent[]> {
	if (eventsCache) return eventsCache;
	const res = await fetch(EVENTS_URL);
	if (!res.ok) throw new Error(`Failed to load events: ${res.status}`);
	const data = await res.json();
	eventsCache = Array.isArray(data) ? (data as MemEvent[]) : [];
	return eventsCache;
}

/** EventRange → 실제 구절번호. verseNos 우선, 없으면 시리즈/그룹 필터로 해석. */
export async function resolveRangeVerseNos(range: EventRange): Promise<number[]> {
	if (range.verseNos && range.verseNos.length > 0) return [...range.verseNos];
	// Honor the static/offline model: never auto-install a package on home render.
	// Series/group ranges for packages the user hasn't opened are skipped until then.
	if (!(await isPackageInstalled(range.packageId))) return [];
	const data = await loadPackageData(range.packageId);
	const kept = filterVerses(data.verses, data.groups, range.seriesIndex ?? null, range.groupIndices ?? []);
	return kept.map((v) => v.no);
}

/** 범위 내 '암송 완료' 구절 수 / 전체 수. */
export async function rangeProgress(
	packageId: string,
	verseNos: number[]
): Promise<{ done: number; total: number }> {
	const total = verseNos.length;
	if (total === 0) return { done: 0, total: 0 };
	// One bulk read per package rather than per verse; verseRatings is indexed
	// on packageId and only holds rows the reader has actually touched.
	const rows = await db.verseRatings.where('packageId').equals(packageId).toArray();
	const byVerseNo = new Map(rows.map((r) => [r.verseNo, r]));
	const done = verseNos.filter((no) => isMemorized(byVerseNo.get(no))).length;
	return { done, total };
}

export interface RangeCardVM {
	label: string;
	done: number;
	total: number;
	href: string;
	/** Carried for the Excel export, which needs to name the verses it
	 *  exports. buildEventCards resolves these anyway for the progress
	 *  count; the alternative is re-parsing them out of `href`. */
	packageId: string;
	verseNos: number[];
}

/** The event's verses, counted. Levels are held as five-slot arrays with
 *  index 0 standing for level 1, so a bar chart can map straight over them. */
export interface EventStats {
	/** Verses the event covers, counted once each. The denominator every other
	 *  number here is read against — and what makes the unrated remainder
	 *  visible, since a level histogram alone cannot say who is missing. */
	total: number;
	/** Verses whose most recent check was flawless — the same rule the card's
	 *  popper badge follows, so the two can never disagree. */
	perfect: number;
	start: number[];
	full: number[];
}

const LEVEL_SLOTS = 5;

/** Adds one to the slot a level names, and nothing at all to a level outside
 *  the scale. Rows arriving from a synced device never passed through the
 *  setters' guard, and an out-of-range value would index off the end and turn
 *  the whole histogram into NaN. */
function tally(into: number[], level: number | null | undefined): void {
	if (typeof level !== 'number') return;
	if (!Number.isInteger(level) || level < 1 || level > LEVEL_SLOTS) return;
	into[level - 1]++;
}

/**
 * Tallies the ratings and flawless checks of the verses an event covers.
 *
 * Verses are gathered into a set per package before anything is counted: one
 * event can name two ranges of the same package that overlap, and the reader
 * memorized such a verse once, not twice. The set also turns the reads into
 * one pair per package rather than one pair per range.
 *
 * A verse the reader has not rated appears in no slot, so the five counts sum
 * to fewer than the event's verses — that gap is the work still to do, and is
 * the honest thing for the chart to show.
 */
export async function eventStats(ranges: RangeCardVM[]): Promise<EventStats> {
	const versesByPackage = new Map<string, Set<number>>();
	for (const r of ranges) {
		let set = versesByPackage.get(r.packageId);
		if (!set) versesByPackage.set(r.packageId, (set = new Set<number>()));
		for (const no of r.verseNos) set.add(no);
	}

	const start = new Array<number>(LEVEL_SLOTS).fill(0);
	const full = new Array<number>(LEVEL_SLOTS).fill(0);
	let perfect = 0;
	let total = 0;
	for (const verseNos of versesByPackage.values()) total += verseNos.size;

	for (const [packageId, verseNos] of versesByPackage) {
		const [ratings, perfectNos] = await Promise.all([
			db.verseRatings.where('packageId').equals(packageId).toArray(),
			listPerfectVerseNos(packageId).catch(() => new Set<number>())
		]);
		for (const r of ratings) {
			if (!verseNos.has(r.verseNo)) continue;
			tally(start, r.startDifficulty);
			tally(full, r.fullDifficulty);
		}
		for (const no of perfectNos) if (verseNos.has(no)) perfect++;
	}

	return { total, perfect, start, full };
}

export interface EventCardVM {
	eventId: string;
	eventTitle: string;
	/** The DAY itself, ISO yyyy-mm-dd. Carried alongside dDay because an
	 *  export is a document someone keeps: "D-11" is only true on the day it
	 *  was made, the date stays true. */
	dueAt: string;
	dDay: number;
	ranges: RangeCardVM[];
	/** Tallied across every range, de-duplicated. Built here because the tables
	 *  it reads are the ones rangeProgress already visits. */
	stats: EventStats;
}

/** label이 비면 front 구절 title로 파생. */
async function rangeLabel(range: EventRange, verseNos: number[]): Promise<string> {
	if (range.label && range.label.trim()) return range.label.trim();
	if (!(await isPackageInstalled(range.packageId))) return range.packageId;
	const data = await loadPackageData(range.packageId).catch(() => null);
	return data?.verses.find((v) => v.no === verseNos[0])?.title ?? range.packageId;
}

/** 홈 렌더용 뷰모델 빌드: 활성 이벤트 × 해석 가능한 범위. */
export async function buildEventCards(today: string): Promise<EventCardVM[]> {
	// A schedule belongs to whoever it was set for. A reader outside the group
	// should not be shown another 지구's deadline, and would have nothing to
	// study for it anyway — its packages are not offered to them either.
	const joined = await getJoinedGroups().catch(() => [] as string[]);
	const events = activeEvents(visibleTo(await loadEvents(), joined), today);
	const cards: EventCardVM[] = [];
	for (const e of events) {
		const ranges: RangeCardVM[] = [];
		for (const r of e.ranges) {
			const verseNos = await resolveRangeVerseNos(r).catch(() => []);
			if (verseNos.length === 0) continue; // 미설치/해석 실패 범위는 건너뜀
			const { done, total } = await rangeProgress(r.packageId, verseNos);
			ranges.push({
				label: await rangeLabel(r, verseNos),
				done,
				total,
				href: rangeHref(r, verseNos),
				packageId: r.packageId,
				verseNos
			});
		}
		if (ranges.length > 0) {
			cards.push({
				eventId: e.id,
				eventTitle: e.title,
				dueAt: e.dueAt,
				dDay: dDay(e.dueAt, today),
				ranges,
				stats: await eventStats(ranges)
			});
		}
	}
	return cards;
}
