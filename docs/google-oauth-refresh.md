# 로그인 창 없는 Drive 갱신 (OAuth code flow)

## 왜 바꿨나

이전에는 GIS의 **implicit flow**로 액세스 토큰만 받았습니다. 구글 액세스 토큰은
**1시간 고정**이고 늘릴 방법이 없어서, 만료될 때마다 GIS에게 다시 달라고 해야 했고
GIS는 그걸 **팝업 창으로만** 줍니다. 아무것도 묻지 않고 스스로 닫히지만, 사용자가
한 일과 무관하게 창이 떴다 사라지는 건 그대로였습니다.

**authorization code flow**는 refresh token을 줍니다. 그걸로 갱신하면 평범한
fetch라서 창이 없습니다. 단, code를 토큰으로 바꾸려면 **client secret**이 필요하고
secret은 브라우저에 둘 수 없습니다 — 그래서 이 앱의 Cloudflare Worker가 중개합니다.

## 구성

```
최초 1회   브라우저 → 구글 동의 화면 → /auth/google/callback?code=…
           code + verifier → POST /api/google/token → 구글      ← secret은 여기서만
           ← { access_token, refresh_token }  → IndexedDB (기기 로컬)

이후       refresh_token → POST /api/google/refresh → 구글
           ← { access_token }                  팝업 없음, GIS 없음
```

- **Worker는 아무것도 저장하지 않습니다.** secret을 붙여 구글에 중계하고 응답을
  좁혀서(`access_token`, `refresh_token`, `expires_in`, `token_type`만) 돌려줄 뿐입니다.
  `id_token`은 이 앱이 읽지 않으므로 브라우저로 넘기지 않습니다.
- refresh token은 액세스 토큰이 원래 있던 자리(`google_drive_auth` 설정 행)에
  저장됩니다. 이 키는 `DEVICE_LOCAL_KEYS`라 **동기화 파일에 실려 나가지 않습니다.**
- PKCE(S256)를 씁니다. code가 리다이렉트를 통해 브라우저에 노출되므로, verifier가
  없으면 가로챈 code가 쓸모없도록.
- 실패 응답은 평평하게 `{"error":"token_exchange_failed"}`로 바꿉니다. 구글의 오류
  본문은 요청을 되돌려 인용하는데, 거기엔 secret 관련 문구가 들어갑니다.

## 배포에 필요한 수동 작업 두 가지

### 1. 리다이렉트 URI 등록

Google Cloud 콘솔 → 사용자 인증 정보 → 해당 OAuth 클라이언트 →
**승인된 리디렉션 URI**에 추가:

```
https://mem.lifescripture.org/auth/google/callback
```

로컬에서 시험한다면 `http://localhost:4180/auth/google/callback`도 함께.

### 2. client secret을 Worker secret으로

같은 화면에서 client secret을 확인한 뒤:

```sh
wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
```

**`wrangler.jsonc`의 `vars`에 넣지 마세요.** 그 파일은 버전 관리에 들어갑니다 —
옆에 있는 공개 client ID는 거기가 맞지만 secret은 그러면 유출입니다.

secret이 없으면 두 엔드포인트는 `503 {"error":"not_configured"}`를 돌려주고,
앱은 예전 GIS 흐름으로 계속 동작합니다(= 팝업이 다시 보임). 즉 **설정 전에 배포해도
망가지지 않습니다.**

## 기존 사용자

이미 연결된 기기에는 refresh token이 없습니다. 그 상태에서는
- 열 때 자동 동기화는 **건너뜁니다**(팝업을 부르지 않으려고),
- 수동 동기화는 예전처럼 GIS로 갱신합니다(팝업).

설정 화면이 "다시 연결하면 로그인 창 없이…"를 띄우고, 한 번 다시 연결하면 두 가지
모두 해결됩니다. `prompt=consent`를 붙여 보내므로 이미 동의한 계정이라도 refresh
token을 확실히 새로 받습니다.
