import type { EventRange, MemEvent, VerseProgress } from '$lib/types';
import { loadPackageData, filterVerses, isPackageInstalled } from './verses';
import { listProgressByPackage } from './progress';

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

/** "암송 완료" 판정. 정의를 바꾸려면 이 함수만 수정. */
export function isMemorized(p: VerseProgress): boolean {
	return p.bucket === 'mastered';
}

/** 홈 카드 링크. 기존 recentBundles의 bundleHref 규칙과 동일. */
export function rangeHref(range: EventRange, verseNos: number[]): string {
	const params = new URLSearchParams();
	params.set('sel', verseNos.join(','));
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
	const all = await listProgressByPackage(packageId);
	const wanted = new Set(verseNos);
	const done = all.filter((p) => wanted.has(p.verseNo) && isMemorized(p)).length;
	return { done, total };
}

export interface RangeCardVM {
	label: string;
	done: number;
	total: number;
	href: string;
}

export interface EventCardVM {
	eventId: string;
	eventTitle: string;
	dDay: number;
	ranges: RangeCardVM[];
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
	const events = activeEvents(await loadEvents(), today);
	const cards: EventCardVM[] = [];
	for (const e of events) {
		const ranges: RangeCardVM[] = [];
		for (const r of e.ranges) {
			const verseNos = await resolveRangeVerseNos(r).catch(() => []);
			if (verseNos.length === 0) continue; // 미설치/해석 실패 범위는 건너뜀
			const { done, total } = await rangeProgress(r.packageId, verseNos);
			ranges.push({ label: await rangeLabel(r, verseNos), done, total, href: rangeHref(r, verseNos) });
		}
		if (ranges.length > 0) {
			cards.push({ eventId: e.id, eventTitle: e.title, dDay: dDay(e.dueAt, today), ranges });
		}
	}
	return cards;
}
