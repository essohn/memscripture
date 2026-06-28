# 암송 이벤트(암송 데이) 범위 + 홈 접근 — 설계

작성일: 2026-06-28
브랜치: `feat/memorization-events`

## 1. 배경 / 문제

교회·그룹 단위로 "암송 데이" 같은 **이벤트**가 있고, 그 이벤트까지 **정해진 범위의 구절**을
암송해야 한다. 필요한 것은 두 가지다.

1. 관리자(= 발행자 본인)가 **이벤트의 암송 범위를 지정**하는 방법.
2. 사용자가 **홈 화면에서 그 범위에 바로 접근**하는 UI.

## 2. 제약 / 핵심 결정

- **백엔드·공유 DB 없음.** 콘텐츠는 전부 `static/data/*.json`으로 **빌드 시점에 정적 배포**된다
  (`packages.json` 패턴). 동기화는 개인 Google Drive 뿐이라 사용자 간 공유 채널이 아니다.
- 따라서 **모두에게 발행되는 이벤트의 진실의 원천은 정적 JSON 파일**이어야 한다.
  "발행" = JSON 편집 → 커밋 → 배포. (커밋마다 git 기반으로 앱 버전이 올라가는 기존 구조와 맞물림)
- **풀 관리자 페이지 UI는 채택하지 않는다.** IndexedDB에 써도 남에게 전달되지 않으므로
  GUI의 최적 역할은 "올바른 인덱스를 가진 JSON 조각을 만들어주는 작성 보조"까지다 (YAGNI).
- **암송 범위 = 이름 붙은 bundle.** 이벤트 범위 1개는 기존 `recordRecentBundle`의 인자
  (`packageId, verseNos, seriesIndex, groupIndices`)와 1:1 대응한다. 새 범위 개념을 발명하지 않는다.

## 3. 목표 / 비목표

**목표**

- `static/data/events.json` 한 파일로 이벤트와 그 암송 범위를 발행.
- 홈 화면 상단(“최근” 위)에 활성 이벤트 섹션 + 범위별 카드(D-day, 진도) 표시.
- 각 범위 카드 탭 → 해당 범위가 필터+선택된 라이브러리 화면으로 이동.
- 라이브러리 선택 확정 바에 "이벤트 범위 복사" 헬퍼 추가 (클립보드 → events.json 붙여넣기).

**비목표**

- 서버/백엔드, 다중 사용자 권한, 인앱 이벤트 영속 편집.
- 이벤트 데이터의 Drive 동기화 (정적 배포가 원천이므로 sync envelope에서 제외).
- 푸시 알림 / 리마인더 (후속 과제).

## 4. 데이터 모델

### 4.1 파일 형식 — `static/data/events.json`

`MemEvent[]` 최상위 배열.

```jsonc
[
  {
    "id": "2026-amsong-day-11",         // 고유 id (안정적 key)
    "title": "11월 암송 데이",
    "dueAt": "2026-11-09",              // 'YYYY-MM-DD' 로컬 날짜. D-day 계산 기준
    "startAt": "2026-10-12",            // (선택) 이 날짜부터 홈 노출. 없으면 항상 노출
    "description": "추수감사 주일 암송",   // (선택)
    "ranges": [
      { "packageId": "60", "seriesIndex": 0, "groupIndices": [], "label": "시편 23편" },
      { "packageId": "8",  "verseNos": [1], "label": "주기도문" }
    ]
  }
]
```

### 4.2 타입 (`src/lib/types.ts`에 추가)

```ts
export interface EventRange {
  packageId: string;
  // 범위 지정: verseNos가 있으면 그대로 사용; 없으면 seriesIndex/groupIndices로 해석.
  verseNos?: number[];
  seriesIndex?: number | null;
  groupIndices?: number[];
  label?: string;            // 카드 표시명. 파생 순서: label → (시리즈/그룹 범위면 group_name) → front 구절 title
}

export interface MemEvent {
  id: string;
  title: string;
  dueAt: string;             // 'YYYY-MM-DD' (local)
  startAt?: string;          // 'YYYY-MM-DD' (local)
  description?: string;
  ranges: EventRange[];
}
```

### 4.3 날짜 처리

- 날짜는 timestamp가 아닌 **`'YYYY-MM-DD'` 로컬 날짜 문자열**. 기존 `todayLocalKey()`
  (`src/lib/db/activity.ts`)와 동일한 기준을 써서 타임존 버그를 피한다.
- D-day = (dueAt 자정) − (오늘 자정), 일 단위 정수. 당일이면 `D-0`(또는 "D-DAY" 표기).

## 5. 데이터 계층 — `src/lib/db/events.ts` (신규)

순수 로직 위주로 분리해 단위 테스트가 쉽도록 한다.

```ts
// 1) fetch + 캐시 (verses.ts의 groupsCache 패턴 재사용)
export async function loadEvents(): Promise<MemEvent[]>;

// 2) 순수 함수 (today를 인자로 받아 테스트 결정성 확보)
export function activeEvents(events: MemEvent[], today: string): MemEvent[];
//   startAt(있으면) <= today <= dueAt 인 것만, dueAt 오름차순.
export function dDay(dueAt: string, today: string): number;

// 3) 범위 해석: EventRange → 실제 verseNos[]
//   verseNos가 있으면 그대로; 아니면 loadPackageData + filterVerses 재사용.
export async function resolveRangeVerseNos(range: EventRange): Promise<number[]>;

// 4) 진도 집계: listProgressByPackage로 범위 내 구절의 완료 수 계산
export async function rangeProgress(
  packageId: string,
  verseNos: number[]
): Promise<{ done: number; total: number }>;
```

- **"암송 완료" 정의**: 단일 상수/헬퍼 `isMemorized(p: VerseProgress)`로 캡슐화.
  기본값 = `bucket === 'mastered'`. 정의를 바꾸려면 이 한 곳만 수정.
- 범위가 비어 있거나(패키지 미설치 등) 해석 실패 시 안전하게 빈 결과/스킵.

## 6. 홈 UI

### 6.1 컴포넌트 — `src/lib/components/home/EventSection.svelte` (신규)

`+page.svelte`에서 "최근" 섹션 **위**에 렌더. 활성 이벤트가 없으면 아무것도 렌더하지 않음.

레이아웃 (선택안: 이벤트 섹션 + 범위별 카드):

```
✦ 이벤트 · 11월 암송 데이              D-12
┌──────────────┐ ┌──────────────┐
│ 시편 23편     │ │ 주기도문      │
│ 3/5 암송      │ │ 0/1 암송      │
└──────────────┘ └──────────────┘
```

- 활성 이벤트가 여러 개면 이벤트별로 (제목 + D-day) 헤더 후 카드 그리드 반복.
- 카드 표기: 표시명(파생 순서: `label` → 시리즈/그룹명 → front 구절 title) + 진도 `done/total 암송` + (선택) 진도 바.
- 카드 탭 → 범위 링크.

### 6.2 범위 링크

기존 `bundleHref` 규칙 재사용:

```
/library/{packageId}?sel={verseNos}&s={seriesIndex}&g={groupIndices}
```

`verseNos`만 주어진 범위는 `?sel=` 만, 시리즈/그룹 기반 범위는 `?s=`/`?g=`도 포함해
해당 범위가 필터+선택된 상태로 열린다 (라이브러리의 기존 복원 로직과 호환).

### 6.3 스타일

`+page.svelte`의 기존 카드 토큰(`--color-card`, `--shadow-soft`, 라운드/보더)을 그대로 따라
"최근" 카드와 시각적으로 일관되게.

## 7. 작성 보조 도구 (라이브러리)

`src/routes/library/[packageId]/+page.svelte` 선택 확정 바, `confirmSelection` 옆에
**"이벤트 범위 복사"** 버튼 추가.

- 현재 선택 컨텍스트(`packageId, [...selectedVerseNos], seriesIndex, groupIndices`)를
  `EventRange` JSON 조각으로 직렬화해 `navigator.clipboard`로 복사.
- 복사 후 Toast("이벤트 범위가 복사되었습니다 — events.json에 붙여넣으세요").
- `label`은 비워 두거나 front 구절 title로 채운 placeholder 포함.

## 8. 라이프사이클

- **노출**: `startAt <= today <= dueAt`. `startAt` 없으면 `today <= dueAt`.
- **지난 이벤트**: `dueAt`이 지나면 홈에서 자동으로 사라짐 (기본). "지난 이벤트" 보관 목록은
  후속 과제로 둔다.
- 이벤트 데이터는 정적이라 IndexedDB에 영속/동기화하지 않는다.

## 9. 테스트 (TDD)

순수 로직 우선:

- `activeEvents`: startAt/dueAt 경계, 정렬, 빈 배열.
- `dDay`: 미래/당일/과거, 월/연 경계.
- `resolveRangeVerseNos`: verseNos 직접 / 시리즈·그룹 해석 / 미설치 패키지.
- `rangeProgress`: done/total 집계, `isMemorized` 경계(버킷별).
- 컴포넌트: 활성 이벤트 0개일 때 미렌더, 카드 링크 href 형식, 진도 표기.

## 10. 변경/신규 파일 요약

| 파일 | 종류 | 내용 |
|---|---|---|
| `static/data/events.json` | 신규 | 이벤트 데이터 (초기엔 예시 1건 또는 빈 배열) |
| `src/lib/types.ts` | 수정 | `EventRange`, `MemEvent` 추가 |
| `src/lib/db/events.ts` | 신규 | fetch/캐시 + 순수 로직(active/dday/resolve/progress) |
| `src/lib/db/events.test.ts` | 신규 | 단위 테스트 |
| `src/lib/components/home/EventSection.svelte` | 신규 | 홈 이벤트 섹션 |
| `src/routes/+page.svelte` | 수정 | "최근" 위에 `EventSection` 렌더 |
| `src/routes/library/[packageId]/+page.svelte` | 수정 | 선택 바에 "이벤트 범위 복사" 버튼 |

## 11. 채택한 기본값 (변경 가능)

| 항목 | 기본값 |
|---|---|
| "암송 완료" 진도 정의 | `bucket === 'mastered'` (`isMemorized` 한 곳에서 변경) |
| 지난 이벤트 | `dueAt` 지나면 홈에서 숨김 |
| events.json 동기화 | sync 제외 (정적 배포가 원천) |

## 12. 후속 과제 (이번 범위 밖)

- 지난 이벤트 보관/회고 목록.
- 이벤트 리마인더 / 푸시 알림.
- 진도 "시작함" vs "완료" 2단계 표기.
