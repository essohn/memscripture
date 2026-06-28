# 암송 이벤트(암송 데이) 범위 + 홈 접근 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정적 `events.json`으로 발행하는 암송 이벤트의 범위를 홈 화면 상단에 D-day·진도와 함께 노출하고, 라이브러리에서 그 범위 JSON을 작성하는 보조 도구를 추가한다.

**Architecture:** 진실의 원천은 `static/data/events.json`. 데이터 계층 `src/lib/db/events.ts`가 fetch·캐시와 순수 로직(활성 필터, D-day, 범위→구절 해석, 진도 집계, 뷰모델 빌드)을 담당한다. 홈 `+page.svelte`는 `buildEventCards()`를 호출해 얇게 렌더하고, 표시는 순수 뷰모델만 받는 `EventSection.svelte`가 담당한다. 라이브러리 선택 바의 "이벤트 범위 복사"는 `serializeEventRange()`(순수)를 재사용한다.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Dexie(IndexedDB), Tailwind v4, Vitest + @testing-library/svelte + fake-indexeddb.

## Global Constraints

- Svelte 5 runes 문법 (`$state`, `$derived`, `$effect`, `$props`). 기존 컴포넌트 패턴을 따른다.
- 단위 테스트는 `tests/unit/<name>.test.ts`에 둔다. 테스트는 `import 'fake-indexeddb/auto';`로 시작하고 `beforeEach`에서 `await db.delete(); await db.open();` 한다. fetch는 url `endsWith` 매칭 mock으로 가짜화한다 (기존 `verses.test.ts` 패턴).
- 패키지 id는 `5_krv`, `8_krv`, `60_krv` 형태다 (`"60"` 아님).
- 색상·간격은 Tailwind v4 토큰(`var(--color-card)`, `var(--color-border)`, `var(--color-accent)`, `var(--shadow-soft)` 등)을 쓴다. 동적 `var(--token-{x})` 조합은 prod에서 tree-shake되므로 피한다.
- UI 카피는 한국어.
- 새 npm 의존성 추가 금지.
- 날짜는 `'YYYY-MM-DD'` 로컬 문자열. `src/lib/db/activity.ts`의 `todayLocalKey()`를 기준으로 쓴다.
- "암송 완료" 정의는 `events.ts`의 `isMemorized()` 한 곳에 캡슐화 (기본값 `bucket === 'mastered'`).

---

### Task 1: 타입 + events.ts 순수 함수

**Files:**
- Modify: `src/lib/types.ts` (끝에 타입 추가)
- Create: `src/lib/db/events.ts`
- Test: `tests/unit/events.test.ts`

**Interfaces:**
- Produces:
  - `interface EventRange { packageId: string; verseNos?: number[]; seriesIndex?: number | null; groupIndices?: number[]; label?: string }`
  - `interface MemEvent { id: string; title: string; dueAt: string; startAt?: string; description?: string; ranges: EventRange[] }`
  - `dDay(dueAt: string, today: string): number`
  - `activeEvents(events: MemEvent[], today: string): MemEvent[]`
  - `isMemorized(p: VerseProgress): boolean`
  - `rangeHref(range: EventRange, verseNos: number[]): string`
  - `serializeEventRange(packageId: string, verseNos: number[], seriesIndex: number | null, groupIndices: number[], label?: string): string`

- [ ] **Step 1: 타입을 types.ts에 추가**

`src/lib/types.ts` 끝에 추가:

```ts
export interface EventRange {
	packageId: string;
	/** 범위 정의: verseNos가 있으면 그대로 사용; 없으면 seriesIndex/groupIndices로 해석. */
	verseNos?: number[];
	seriesIndex?: number | null;
	groupIndices?: number[];
	/** 카드 표시명. 비어 있으면 front 구절 title로 파생. */
	label?: string;
}

export interface MemEvent {
	id: string;
	title: string;
	dueAt: string; // 'YYYY-MM-DD' (local)
	startAt?: string; // 'YYYY-MM-DD' (local)
	description?: string;
	ranges: EventRange[];
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/unit/events.test.ts` 생성:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { dDay, activeEvents, isMemorized, rangeHref, serializeEventRange } from '../../src/lib/db/events';
import type { MemEvent, VerseProgress } from '../../src/lib/types';

const ev = (over: Partial<MemEvent> = {}): MemEvent => ({
	id: 'e1',
	title: '11월 암송 데이',
	dueAt: '2026-11-09',
	ranges: [],
	...over
});

describe('dDay', () => {
	it('counts days until the due date', () => {
		expect(dDay('2026-11-09', '2026-10-28')).toBe(12);
	});
	it('is 0 on the due date and negative after', () => {
		expect(dDay('2026-11-09', '2026-11-09')).toBe(0);
		expect(dDay('2026-11-09', '2026-11-10')).toBe(-1);
	});
	it('handles month boundaries', () => {
		expect(dDay('2026-12-01', '2026-11-30')).toBe(1);
	});
});

describe('activeEvents', () => {
	it('keeps events whose window contains today, sorted by dueAt asc', () => {
		const a = ev({ id: 'a', dueAt: '2026-11-20' });
		const b = ev({ id: 'b', dueAt: '2026-11-05' });
		expect(activeEvents([a, b], '2026-11-01').map((e) => e.id)).toEqual(['b', 'a']);
	});
	it('hides events past their dueAt', () => {
		expect(activeEvents([ev({ dueAt: '2026-11-09' })], '2026-11-10')).toHaveLength(0);
	});
	it('respects startAt when present', () => {
		const e = ev({ startAt: '2026-11-01', dueAt: '2026-11-30' });
		expect(activeEvents([e], '2026-10-31')).toHaveLength(0);
		expect(activeEvents([e], '2026-11-01')).toHaveLength(1);
	});
});

describe('isMemorized', () => {
	const p = (bucket: VerseProgress['bucket']): VerseProgress => ({
		id: '5_krv:1', packageId: '5_krv', verseNo: 1, bucket,
		enteredBucketAt: 0, daysActiveInBucket: 0, lastReviewedAt: 0, citeRatings: [], recallRatings: []
	});
	it('is true only for mastered', () => {
		expect(isMemorized(p('mastered'))).toBe(true);
		expect(isMemorized(p('current'))).toBe(false);
		expect(isMemorized(p('new'))).toBe(false);
	});
});

describe('rangeHref', () => {
	it('builds a sel-only link for verseNos ranges', () => {
		expect(rangeHref({ packageId: '8_krv', verseNos: [1] }, [1])).toBe('/library/8_krv?sel=1');
	});
	it('includes s and g for series/group ranges', () => {
		const href = rangeHref({ packageId: '60_krv', seriesIndex: 0, groupIndices: [2] }, [1, 2]);
		expect(href).toBe('/library/60_krv?sel=1%2C2&s=0&g=2');
	});
});

describe('serializeEventRange', () => {
	it('emits sorted verseNos plus an empty label placeholder', () => {
		const json = serializeEventRange('8_krv', [3, 1, 2], null, []);
		expect(JSON.parse(json)).toEqual({ packageId: '8_krv', verseNos: [1, 2, 3], label: '' });
	});
	it('includes seriesIndex/groupIndices when set', () => {
		const json = serializeEventRange('60_krv', [1], 0, [2]);
		expect(JSON.parse(json)).toEqual({ packageId: '60_krv', verseNos: [1], seriesIndex: 0, groupIndices: [2], label: '' });
	});
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test -- events`
Expected: FAIL — `Failed to resolve import '../../src/lib/db/events'`.

- [ ] **Step 4: events.ts 순수 함수 구현**

`src/lib/db/events.ts` 생성:

```ts
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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- events`
Expected: PASS (5 describe 블록 전부 통과).

- [ ] **Step 6: 커밋**

```bash
git add src/lib/types.ts src/lib/db/events.ts tests/unit/events.test.ts
git commit -m "feat(events): types + pure helpers (dDay, activeEvents, hrefs)"
```

---

### Task 2: events.ts 데이터 계층 (fetch·해석·진도·뷰모델)

**Files:**
- Modify: `src/lib/db/events.ts`
- Test: `tests/unit/events.test.ts` (Task 1 파일에 describe 추가)

**Interfaces:**
- Consumes: `loadPackageData`, `filterVerses` (`$lib/db/verses`); `listProgressByPackage` (`$lib/db/progress`); Task 1의 `activeEvents`/`dDay`/`isMemorized`/`rangeHref`.
- Produces:
  - `loadEvents(): Promise<MemEvent[]>`
  - `resolveRangeVerseNos(range: EventRange): Promise<number[]>`
  - `rangeProgress(packageId: string, verseNos: number[]): Promise<{ done: number; total: number }>`
  - `interface RangeCardVM { label: string; done: number; total: number; href: string }`
  - `interface EventCardVM { eventId: string; eventTitle: string; dDay: number; ranges: RangeCardVM[] }`
  - `buildEventCards(today: string): Promise<EventCardVM[]>`

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/unit/events.test.ts` 에 import와 describe 블록 추가. 상단 import 줄을 다음으로 교체:

```ts
import {
	dDay, activeEvents, isMemorized, rangeHref, serializeEventRange,
	loadEvents, resolveRangeVerseNos, rangeProgress, buildEventCards
} from '../../src/lib/db/events';
import { db } from '../../src/lib/db/local';
import { listPackages } from '../../src/lib/db/verses';
import { upsertProgress } from '../../src/lib/db/progress';
import { beforeEach, vi } from 'vitest';
```

파일 끝에 추가:

```ts
const samplePackages = {
	'5_krv': {
		id: '5_krv', name: '샘플', verse_number: 3, translation: 'krv', translation_name: '개역한글',
		abbreviation: '샘플', language: 'kor', copyright: '', copyright_text: '', version: 1,
		source: 'data/5_krv.json', default: true
	}
};
const sampleVerses = [
	{ i: 1, title: 't1', cite: 'c1', w: 'w1' },
	{ i: 2, title: 't2', cite: 'c2', w: 'w2' },
	{ i: 3, title: 't3', cite: 'c3', w: 'w3' }
];
const sampleGroups = [
	{ package_id: '5_krv', group_name: 'A', level: 1, index: [1, 2] },
	{ package_id: '5_krv', group_name: 'B', level: 1, index: [3] }
];
const sampleEvents = [
	{ id: 'e1', title: '11월 암송 데이', dueAt: '2099-12-31', ranges: [{ packageId: '5_krv', verseNos: [1, 2], label: '시편 23편' }] }
];

function mockFetch(map: Record<string, unknown>) {
	global.fetch = vi.fn(async (url: any) => {
		const u = String(url);
		const key = Object.keys(map).find((k) => u.endsWith(k));
		if (!key) return new Response('not found', { status: 404 });
		return new Response(JSON.stringify(map[key]), { status: 200, headers: { 'content-type': 'application/json' } });
	}) as any;
}

describe('events data layer', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		vi.restoreAllMocks();
	});

	it('loadEvents fetches then caches', async () => {
		mockFetch({ 'data/events.json': sampleEvents });
		const first = await loadEvents();
		expect(first).toHaveLength(1);
		(global.fetch as any).mockClear();
		await loadEvents();
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('resolveRangeVerseNos passes verseNos through', async () => {
		expect(await resolveRangeVerseNos({ packageId: '5_krv', verseNos: [2, 1] })).toEqual([2, 1]);
	});

	it('resolveRangeVerseNos resolves a series range to its verse numbers', async () => {
		mockFetch({
			'data/packages.json': samplePackages,
			'data/5_krv.json': sampleVerses,
			'data/packages_index.json': sampleGroups
		});
		await listPackages();
		const nos = await resolveRangeVerseNos({ packageId: '5_krv', seriesIndex: 0, groupIndices: [] });
		expect(nos).toEqual([1, 2]);
	});

	it('rangeProgress counts mastered verses within the range', async () => {
		await upsertProgress({
			id: '5_krv:1', packageId: '5_krv', verseNo: 1, bucket: 'mastered',
			enteredBucketAt: 0, daysActiveInBucket: 0, lastReviewedAt: 0, citeRatings: [], recallRatings: []
		});
		await upsertProgress({
			id: '5_krv:2', packageId: '5_krv', verseNo: 2, bucket: 'current',
			enteredBucketAt: 0, daysActiveInBucket: 0, lastReviewedAt: 0, citeRatings: [], recallRatings: []
		});
		expect(await rangeProgress('5_krv', [1, 2])).toEqual({ done: 1, total: 2 });
		expect(await rangeProgress('5_krv', [])).toEqual({ done: 0, total: 0 });
	});

	it('buildEventCards assembles a card per active event range', async () => {
		mockFetch({ 'data/events.json': sampleEvents });
		await upsertProgress({
			id: '5_krv:1', packageId: '5_krv', verseNo: 1, bucket: 'mastered',
			enteredBucketAt: 0, daysActiveInBucket: 0, lastReviewedAt: 0, citeRatings: [], recallRatings: []
		});
		const cards = await buildEventCards('2099-12-30');
		expect(cards).toHaveLength(1);
		expect(cards[0].eventTitle).toBe('11월 암송 데이');
		expect(cards[0].dDay).toBe(1);
		expect(cards[0].ranges[0]).toEqual({
			label: '시편 23편', done: 1, total: 2, href: '/library/5_krv?sel=1%2C2'
		});
	});
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- events`
Expected: FAIL — `loadEvents`/`resolveRangeVerseNos`/`rangeProgress`/`buildEventCards` not exported.

- [ ] **Step 3: 데이터 계층 구현**

`src/lib/db/events.ts` 상단 import를 추가하고 함수들을 추가:

```ts
import { loadPackageData, filterVerses } from './verses';
import { listProgressByPackage } from './progress';
```

파일 끝에 추가:

```ts
const EVENTS_URL = '/data/events.json';
let eventsCache: MemEvent[] | null = null;

export async function loadEvents(): Promise<MemEvent[]> {
	if (eventsCache) return eventsCache;
	const res = await fetch(EVENTS_URL);
	if (!res.ok) throw new Error(`Failed to load events: ${res.status}`);
	eventsCache = (await res.json()) as MemEvent[];
	return eventsCache;
}

/** EventRange → 실제 구절번호. verseNos 우선, 없으면 시리즈/그룹 필터로 해석. */
export async function resolveRangeVerseNos(range: EventRange): Promise<number[]> {
	if (range.verseNos && range.verseNos.length > 0) return [...range.verseNos];
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- events`
Expected: PASS (모든 events 테스트).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/db/events.ts tests/unit/events.test.ts
git commit -m "feat(events): fetch, range resolution, progress, card view-models"
```

---

### Task 3: events.json + EventSection + 홈 연결

**Files:**
- Create: `static/data/events.json`
- Create: `src/lib/components/home/EventSection.svelte`
- Modify: `src/routes/+page.svelte`
- Test: `tests/unit/EventSection.test.ts`

**Interfaces:**
- Consumes: `EventCardVM`, `buildEventCards` (`$lib/db/events`); `todayLocalKey` (`$lib/db/activity`).
- Produces: `<EventSection events={EventCardVM[]} />` — 빈 배열이면 아무것도 렌더하지 않음.

- [ ] **Step 1: 빈 events.json 생성 (프로덕션 기본값)**

`static/data/events.json`:

```json
[]
```

- [ ] **Step 2: 실패하는 컴포넌트 테스트 작성**

`tests/unit/EventSection.test.ts`:

```ts
import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import EventSection from '../../src/lib/components/home/EventSection.svelte';
import type { EventCardVM } from '../../src/lib/db/events';

const card: EventCardVM = {
	eventId: 'e1',
	eventTitle: '11월 암송 데이',
	dDay: 12,
	ranges: [{ label: '시편 23편', done: 3, total: 5, href: '/library/60_krv?sel=1%2C2' }]
};

describe('EventSection', () => {
	it('renders nothing when there are no events', () => {
		const { container } = render(EventSection, { props: { events: [] } });
		expect(container.querySelector('section')).toBeNull();
	});

	it('renders the event title, D-day, range label, and progress', () => {
		render(EventSection, { props: { events: [card] } });
		expect(screen.getByText('11월 암송 데이')).toBeInTheDocument();
		expect(screen.getByText('D-12')).toBeInTheDocument();
		expect(screen.getByText('시편 23편')).toBeInTheDocument();
		expect(screen.getByText('3/5 암송')).toBeInTheDocument();
	});

	it('links each range card to its library href', () => {
		render(EventSection, { props: { events: [card] } });
		expect(screen.getByRole('link', { name: /시편 23편/ }).getAttribute('href')).toBe('/library/60_krv?sel=1%2C2');
	});

	it('shows D-DAY on the due date', () => {
		render(EventSection, { props: { events: [{ ...card, dDay: 0 }] } });
		expect(screen.getByText('D-DAY')).toBeInTheDocument();
	});
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test -- EventSection`
Expected: FAIL — `Failed to resolve import '.../components/home/EventSection.svelte'`.

- [ ] **Step 4: EventSection 구현**

`src/lib/components/home/EventSection.svelte`:

```svelte
<script lang="ts">
	import { CalendarCheck } from 'lucide-svelte';
	import type { EventCardVM } from '$lib/db/events';

	let { events }: { events: EventCardVM[] } = $props();

	function dDayLabel(d: number): string {
		return d === 0 ? 'D-DAY' : d > 0 ? `D-${d}` : `D+${-d}`;
	}
</script>

{#if events.length > 0}
	<section class="mb-8">
		{#each events as ev (ev.eventId)}
			<div class="mb-5">
				<div class="flex items-center justify-between gap-3 px-1">
					<div
						class="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]"
					>
						<CalendarCheck size={13} class="text-[var(--color-accent)]" />
						{ev.eventTitle}
					</div>
					<span
						class="shrink-0 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[var(--color-accent)]"
					>
						{dDayLabel(ev.dDay)}
					</span>
				</div>
				<div class="mt-3 grid grid-cols-2 gap-3 px-1">
					{#each ev.ranges as r (r.href)}
						<a
							href={r.href}
							class="event-card block rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 transition-all hover:border-[var(--color-accent)]/50"
						>
							<h3 class="truncate text-[15px] font-semibold text-[var(--color-text)]">{r.label}</h3>
							<p class="mt-1 text-[12px] tabular-nums text-[var(--color-text-secondary)]">
								{r.done}/{r.total} 암송
							</p>
						</a>
					{/each}
				</div>
			</div>
		{/each}
	</section>
{/if}

<style>
	.event-card {
		box-shadow: var(--shadow-soft);
		transition:
			transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
			box-shadow 240ms cubic-bezier(0.22, 1, 0.36, 1),
			border-color 240ms ease;
	}
	.event-card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-card-hover);
	}
</style>
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- EventSection`
Expected: PASS (4 테스트).

- [ ] **Step 6: 홈 페이지에 연결**

`src/routes/+page.svelte` `<script>`에 import 추가:

```ts
	import EventSection from '$lib/components/home/EventSection.svelte';
	import { buildEventCards, type EventCardVM } from '$lib/db/events';
	import { todayLocalKey } from '$lib/db/activity';
```

state 선언부(`let rows = $state...` 근처)에 추가:

```ts
	let eventCards = $state<EventCardVM[]>([]);
```

기존 `$effect` 블록 **다음에** 별도의 effect 추가 (기존 bundle effect는 그대로 둔다):

```ts
	$effect(() => {
		let active = true;
		buildEventCards(todayLocalKey())
			.then((cards) => {
				if (active) eventCards = cards;
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	});
```

`<main ...>` 안, "최근" `<section>` **바로 위**에 렌더:

```svelte
	<EventSection events={eventCards} />
```

- [ ] **Step 7: 타입체크 + 전체 테스트**

Run: `npm run check && npm test`
Expected: 타입 에러 0, 모든 테스트 PASS.

- [ ] **Step 8: 수동 확인 (선택)**

`static/data/events.json`에 임시로 아래를 넣고 `npm run dev`로 홈을 확인한 뒤 되돌린다(`[]`):

```json
[
  { "id": "demo", "title": "데모 암송 데이", "dueAt": "2099-12-31", "ranges": [ { "packageId": "8_krv", "verseNos": [1], "label": "주기도문" } ] }
]
```

- [ ] **Step 9: 커밋**

```bash
git add static/data/events.json src/lib/components/home/EventSection.svelte src/routes/+page.svelte tests/unit/EventSection.test.ts
git commit -m "feat(home): event section with D-day and per-range progress cards"
```

---

### Task 4: 라이브러리 "이벤트 범위 복사" 보조 도구

**Files:**
- Modify: `src/routes/library/[packageId]/+page.svelte`

**Interfaces:**
- Consumes: `serializeEventRange` (`$lib/db/events`); 페이지의 `packageId`/`seriesIndex`/`groupIndices` ($derived), `selectedVerseNos` ($state), `toast` ($state).
- Produces: 선택 바의 "이벤트 범위 복사" 버튼 (클립보드 복사 + Toast).

> Note: 직렬화 로직(`serializeEventRange`)은 Task 1에서 이미 테스트됨. 이 태스크는 UI 배선이므로 타입체크 + 수동 확인으로 검증한다.

- [ ] **Step 1: import 추가**

`src/routes/library/[packageId]/+page.svelte` `<script>`의 import 묶음에 추가:

```ts
	import { serializeEventRange } from '$lib/db/events';
```

- [ ] **Step 2: 핸들러 추가**

`confirmSelection` 함수 근처에 추가:

```ts
	// 관리자 작성 보조: 현재 선택을 events.json에 붙여넣을 EventRange JSON으로 복사.
	async function copyEventRange() {
		const json = serializeEventRange(packageId, [...selectedVerseNos], seriesIndex, groupIndices);
		try {
			await navigator.clipboard.writeText(json);
			toast = { message: '이벤트 범위가 복사되었습니다 — events.json에 붙여넣으세요' };
		} catch {
			toast = { message: '복사에 실패했습니다' };
		}
	}
```

- [ ] **Step 3: 버튼 추가**

선택 확정 바에서 "최근 구절에 담기" 버튼 **바로 앞**에 추가:

```svelte
					<button
						type="button"
						onclick={copyEventRange}
						class="rounded-full px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-elevated)]"
					>
						범위 복사
					</button>
```

- [ ] **Step 4: 타입체크**

Run: `npm run check`
Expected: 타입 에러 0.

- [ ] **Step 5: 수동 확인**

`npm run dev` → 라이브러리에서 구절 2개 선택 → "범위 복사" → 클립보드에 `{ "packageId": ..., "verseNos": [...], "label": "" }` JSON이 들어오고 Toast가 뜨는지 확인.

- [ ] **Step 6: 전체 테스트 + 커밋**

```bash
npm test
git add src/routes/library/[packageId]/+page.svelte
git commit -m "feat(library): copy selection as an event range JSON snippet"
```

---

## Self-Review

**Spec coverage**

- §4 데이터 모델(EventRange/MemEvent, 날짜 문자열) → Task 1.
- §5 데이터 계층(loadEvents/activeEvents/dDay/resolveRangeVerseNos/rangeProgress/isMemorized) → Task 1+2.
- §6 홈 UI(EventSection, "최근" 위 렌더, 범위 링크 = bundleHref 규칙) → Task 3.
- §7 작성 보조 도구 → Task 4.
- §8 라이프사이클(startAt/dueAt 노출, 지난 이벤트 숨김) → `activeEvents` (Task 1).
- §9 테스트 → 각 태스크 TDD.
- §11 기본값(mastered/숨김/sync 제외) → `isMemorized`, `activeEvents`, events.json은 IndexedDB 미저장.

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. 빈 `events.json`(`[]`)은 의도된 프로덕션 기본값이지 placeholder 아님.

**Type consistency:** `EventRange`/`MemEvent`/`EventCardVM`/`RangeCardVM` 이름과 시그니처가 Task 1·2·3에서 일치. `rangeHref`/`serializeEventRange`/`buildEventCards`/`resolveRangeVerseNos`/`rangeProgress`/`isMemorized` 시그니처가 정의·사용처에서 동일. 패키지 id는 전부 `*_krv` 형태.

**스펙과의 차이(의도적):** 카드 표시명 파생을 스펙의 `label → group_name → front title` 3단계에서 `label → front title` 2단계로 단순화(YAGNI — 작성 보조가 항상 label 필드를 시드함). 동작 차이 없음.
