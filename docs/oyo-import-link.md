# OYO 구절 가져오기 링크

다른 앱에서 고른 구절을 MemScripture의 **내 구절(OYO)** 로 넘기는 계약입니다.
받는 쪽 구현은 `src/lib/oyo/importLink.ts`와 `src/routes/oyo/import/+page.svelte`,
검증은 `tests/unit/importLink.test.ts`에 있습니다.

## 왜 링크인가

MemScripture는 **서버가 없습니다.** 정적 SPA이고 저장소는 기기의 IndexedDB뿐이라
POST가 도착할 곳이 없습니다. 링크는 보내는 쪽에 CORS도, 팝업도, 핸드셰이크도
요구하지 않고, 양쪽 폰에서 설치된 PWA를 그대로 열며, 데스크톱에서도 똑같이 됩니다.

페이로드는 쿼리스트링이 아니라 **URL 조각(`#`)** 에 싣습니다. 조각은 서버로
전송되지 않으므로, 이미 그 구절을 가진 기기로 가는 길에 성경 본문이
Cloudflare 요청 로그에 남지 않습니다.

## 주소

```
https://mem.lifescripture.org/oyo/import#v=<base64(JSON)>
```

## JSON

```jsonc
{
  "v": 1,                                  // 필수. 이 값이 아니면 거부합니다
  "source": "bible.lifescripture.org",     // 선택. 화면에 "…에서 보냈습니다"로 표시
  "verses": [
    {
      "cite": "창세기 12 : 1",              // 선택하지만 사실상 필수 (제목 기본값)
      "w": "여호와께서 아브람에게 이르시되",   // 필수. 이게 없는 행은 버려집니다
      "title": "부르심"                     // 선택. 없으면 cite를 제목으로 씁니다
    }
  ]
}
```

- 한 번에 **최대 200구절**. 넘으면 사용자에게 나눠 보내라고 안내합니다.
- `cite`는 받는 쪽에서 이 앱의 표준 형태로 다시 씁니다 — `창 12:1` → `창세기 12 : 1`.
  파싱하지 못하는 장절은 **그대로 둡니다.** 보내는 쪽이 이 앱이 모르는 책 이름을
  알 수도 있고, 장절이 어색한 구절이 구절 하나를 잃는 것보다 낫습니다.
- 본문이 빈 행은 조용히 버리고 나머지는 살립니다. 스무 개 중 하나가 잘못됐다고
  나머지 열아홉을 잃게 하지 않습니다.

## 보내는 쪽 코드

이게 전부입니다. 별도 SDK도, 준비 신호도 없습니다.

```ts
function sendToMemScripture(verses: { cite: string; w: string; title?: string }[]) {
  const json = JSON.stringify({ v: 1, source: location.hostname, verses });
  const base64 = btoa(unescape(encodeURIComponent(json)));  // UTF-8 → base64
  location.href =
    `https://mem.lifescripture.org/oyo/import#v=${encodeURIComponent(base64)}`;
}
```

`btoa`만 쓰면 한글이 깨집니다 — 문자당 1바이트로 자르기 때문입니다. 위처럼
UTF-8로 먼저 인코딩하세요. base64url(`-_`, 패딩 없음)로 보내도 받는 쪽이
동일하게 처리합니다.

wbible의 `ReadingPane.svelte`에는 이미 `selectedVerses: Set<number>`와 book/chapter가
있으므로, 복사 액션바 옆에 버튼 하나를 붙여 위 함수에 넘기면 됩니다. `cite`는
`formatReference('abbr-dash-suffix', book, chapter, v, v)`처럼 기존 포매터로
만들면 그대로 파싱됩니다.

## 받는 쪽 동작

1. 조각을 해독해 목록을 보여줍니다. 이미 같은 장절이 내 구절에 있으면
   **"이미 있음"** 배지를 달고 기본 해제 상태로 둡니다 — 같은 링크를 두 번 눌러도
   쌍둥이가 생기지 않습니다.
2. 나머지는 모두 선택된 채로 시작합니다. 사용자는 이미 저쪽 앱에서 골랐으니,
   여기서 다시 고르게 하지 않습니다.
3. **내 구절에 담기**를 누르면 `createOyoVerse`로 순차 저장합니다. 병렬로 쓰면
   `max(no) + 1`을 동시에 읽어 기본키가 충돌합니다.
4. 저장에 성공한 뒤에야 조각을 지웁니다. 검토 중에 새로고침해도 링크가 살아
   있도록, 그러나 저장 후 새로고침이 두 번째 가져오기가 되지는 않도록.

## 버전을 올릴 때

`v`를 올리면 **구버전 앱은 거부하고 새로고침을 안내합니다.** 설치된 PWA는
업데이트가 늦을 수 있으니, 필드 추가처럼 하위 호환되는 변경은 `v`를 그대로 두고
선택 필드로 넣으세요. `v`를 올리는 건 기존 필드의 의미가 바뀔 때만입니다.
