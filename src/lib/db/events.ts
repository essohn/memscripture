import type { EventRange, MemEvent, VerseProgress } from '$lib/types';

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
