# MemScripture Redesign — Design Spec

**Date:** 2026-05-07
**Status:** Draft for implementation planning

## 1. Background & Goals

The existing app is a single-page Bible verse memorization tool built in 2014 on Google App Engine Python 2.7 with jQuery 2.1.0 and the now-defunct Furatto 2 CSS framework. The backend platform was retired in early 2024, the frontend has accumulated drift (iOS scrolling glitches, a dropped string concatenation in `prepare_a_card`, localStorage size pressure with the 900-verse package), and several frameworks in `static/lib/` are unmaintained.

The data assets (seven Korean Bible packages: 5/8/60/100/180/242/900 verses, plus index metadata) are clean and reusable. The app is fundamentally a client-side experience — the server only renders a static template. This makes a full client-side rewrite straightforward.

### Goals (V1)

- **Reimagine** the experience while preserving the data assets and the core memorization concepts (cards, hide-text, multi-state bookmarks).
- Modern, stable, lightweight tech stack with a polished visual identity.
- Truly mobile-first — solve the iOS scrolling and storage-purge issues.
- Add proper spaced repetition (FSRS), streak tracking, and basic stats.
- Public app: anyone with the link can use it. Friends register easily via Kakao/Google/magic-link.
- Keep the URL shape shareable so individual verses can be sent in a chat message.

### Non-Goals (deferred to V2)

- Typing mode (write the verse from memory)
- Text-to-speech audio
- Apple Sign-In (avoids the $99/year developer fee for V1)
- User-tunable SRS parameters (`request_retention` is fixed at 0.9)
- Cross-package collections / per-verse notes
- Manual export/import (sync covers backup needs)
- Languages other than Korean

### Existing-data migration

Skipped by user decision. New users start with empty SRS state.

## 2. Architecture Overview

```
Browser (PWA)
├── SvelteKit 2 SPA (Svelte 5 runes, TypeScript, Tailwind v4)
├── Local data: IndexedDB (Dexie) + Cache API (fonts, packages)
└── Service Worker (vite-plugin-pwa, Workbox)
        │
        ▼ HTTPS
Supabase (free tier)
├── Auth (Kakao OIDC, Google, Magic Link)
├── Postgres (review_state, daily_log, user_settings, profiles)
└── Row-Level Security per user_id

Cloudflare Pages — static hosting (adapter-static)
```

### Principles

- **Local-first.** All writes hit IndexedDB immediately. Supabase is sync, not source of truth.
- **Static-first.** `adapter-static` produces pure static files. No server runtime, no cold start.
- **Bible verses are content, not user data.** Packages live in `static/data/` as JSON, lazy-loaded into IndexedDB on first install. Only review state and settings sync to Supabase.
- **Anonymous → linked.** First visit silently creates a Supabase anonymous session. OAuth login uses `linkIdentity` so the same `user_id` is preserved and no data merge is needed.

### Dependency budget

| Package | Version |
|---|---|
| svelte | 5.x |
| @sveltejs/kit | 2.x |
| @sveltejs/adapter-static | 3.x |
| typescript | 5.x |
| tailwindcss | 4.x (Oxide engine) |
| @supabase/supabase-js | 2.x |
| vite-plugin-pwa | 0.21.x |
| dexie | 4.x |
| ts-fsrs | 4.x |
| lucide-svelte | latest |

Target first-load JS: < 80 KB gzipped, CSS < 30 KB.

## 3. Data Model

### Where data lives

| Data | Location | Why |
|---|---|---|
| Bible packages (verse text + index metadata) | `static/data/*.json` → IndexedDB on first install | Static content, identical for all users, ~220 KB largest file. |
| Review state (one row per user × verse) | IndexedDB + Supabase | Frequent writes, must work offline, must sync across devices. |
| User settings | IndexedDB + Supabase | Per-device immediate, sync optional. |
| Daily log (streak/stats) | IndexedDB + Supabase | Same as settings. |
| Auth session (JWT) | Supabase JS auto-managed | Standard. |

### Supabase schema (Postgres)

```sql
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.review_state (
  user_id    uuid not null references auth.users(id) on delete cascade,
  package_id text not null,
  verse_no   int  not null,
  -- FSRS scheduling state
  stability  real default 0,
  difficulty real default 5,
  due_at     date,
  last_review timestamptz,
  reps       int default 0,
  lapses     int default 0,
  -- User-facing labels (derived from FSRS state, except 'suspended' which is manual)
  status     text default 'new'
             check (status in ('new','learning','mature','suspended')),
  starred    boolean default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, package_id, verse_no)
);
create index review_state_due_idx on public.review_state (user_id, due_at);

create table public.daily_log (
  user_id       uuid not null references auth.users(id) on delete cascade,
  date          date not null,
  reviews_count int default 0,
  new_count     int default 0,
  primary key (user_id, date)
);

create table public.user_settings (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  font_size       int default 100,
  hide_mode       text default 'fade' check (hide_mode in ('fade','blur','hidden')),
  daily_target    int default 10,
  active_packages text[] default array[]::text[],
  theme           text default 'paper' check (theme in ('paper','dark','system')),
  updated_at      timestamptz not null default now()
);

-- Row-Level Security
alter table public.profiles      enable row level security;
alter table public.review_state  enable row level security;
alter table public.daily_log     enable row level security;
alter table public.user_settings enable row level security;

create policy "own row" on public.profiles
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row" on public.review_state
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row" on public.daily_log
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row" on public.user_settings
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### Client IndexedDB schema (Dexie)

```ts
db.version(1).stores({
  packages:     '&id, name',
  verses:       '[package_id+no], package_id',
  review_state: '[package_id+no], status, due_at, starred',
  daily_log:    '&date',
  settings:     '&key',
  sync_queue:   '++id, table, action, created_at'
});
```

### Sync strategy

1. All writes hit IndexedDB first; UI updates immediately.
2. Each write also enqueues `(table, primary_key, payload, ts)` to `sync_queue`.
3. When online and authenticated, the queue drains via Supabase upsert. Successful entries are removed.
4. On app start, pull rows from Supabase where `updated_at > local.last_sync` and apply with last-write-wins by `updated_at`.

LWW is acceptable because conflict surface is small (a user typically uses one device at a time, and the same row rarely gets concurrent edits).

## 4. Authentication (Hybrid)

### Flow

1. App loads → `supabase.auth.signInAnonymously()` if no session exists. Anonymous `user_id` is created silently.
2. User can browse, learn, rate cards, and bookmark — all data accumulates locally and against the anonymous account if Supabase is reachable.
3. When the user requests sync (settings → "기기 간 sync 켜기"), a login sheet appears with Kakao / Google / Magic Link options.
4. Linking semantics:
   - **OAuth providers (Kakao, Google):** call `supabase.auth.linkIdentity({ provider })`. The anonymous `user_id` is preserved and the OAuth identity is attached.
   - **Magic link:** call `supabase.auth.updateUser({ email })`, which sends a confirmation email. After click-through, the anonymous account is upgraded to a permanent email-authenticated user; `user_id` is preserved.
5. Cross-device linking edge case: on a second device the user signs in anonymously (creating a new local anon `user_id`) and then logs in with their existing identity. `linkIdentity` will fail because the identity already exists on the first anon account; the client must catch this, sign out the local anon, and call `signInWithOAuth({ provider })` to land on the original `user_id`. Any unsynced local writes on the second device are lost (acceptable: usually empty since the user just opened the app on a new device). After this, app-start pull restores the cloud state.

### Login is required only for

- Settings → My account
- "Enable cross-device sync" button

Everything else (Today, Library, Stats, all card interactions, bookmarks) works anonymously. A gentle prompt to add to home screen + log in appears once around day three.

### Provider configuration

| Provider | Setup | Notes |
|---|---|---|
| Google | Google Cloud OAuth client → Supabase | Standard. |
| Kakao | "Custom OIDC provider" in Supabase, issuer `https://kauth.kakao.com` | Not built-in, but supported. |
| Magic Link | Built-in; SMTP via Resend (3000/month free) | Replace Supabase default SMTP for production. |
| Apple | Deferred to V2 | Avoids $99/year fee. iPhone users use Google or magic link in V1. |

### Security

- Only the public anon key is shipped to the client; RLS is the real boundary.
- Service role key never appears in client code.
- PKCE flow is enabled (Supabase JS 2.x default).
- CSP `connect-src` allowlists `*.supabase.co` and `kauth.kakao.com`.

## 5. Learning Loop & SRS

### Card state machine

`new` → `learning` (after first rating) → `mature` (FSRS stability ≥ 30 days) → `suspended` (user-initiated only).

`status` is derived from `stability` for `learning`/`mature`. `suspended` is the only manual state and excludes the card from `todayQueue`.

### FSRS algorithm

Library: `ts-fsrs` (~4 KB gzipped).

- `request_retention: 0.9` — schedule next review at the point where 90% recall is expected. Fixed for V1.
- `enable_fuzz: true` — small random spread so cards don't all become due on the same future day.
- Three rating buttons map to FSRS:
  - **다시** → `Rating.Again` (re-shows card later in the same session, increments `lapses`)
  - **보통** → `Rating.Good` (standard scheduling)
  - **쉬움** → `Rating.Easy` (next interval × 1.3)

The standard FSRS `Hard` rating is dropped because users find the difference between Hard and Good ambiguous. Three buttons are clearer.

### Today queue

```ts
function todayQueue(rows, today, target = 10) {
  const due  = rows.filter(r => r.due_at <= today && r.status !== 'suspended')
                   .sort(by_due_then_stability_asc);
  const fresh = rows.filter(r => r.status === 'new' && active_packages.has(r.package_id))
                    .sort(by_package_then_no);
  return [...due, ...fresh].slice(0, target);
}
```

Default ratio: 80% review, 20% new. Configurable via `daily_target` setting.

### Card interactions

| Gesture | Action |
|---|---|
| Tap | Toggle hide / reveal whole verse |
| Long-press (0.5s) | Switch to per-word reveal mode |
| Double-tap or `⇄` icon | Flip card (citation ↔ verse text) |
| Swipe left/right | Previous / next card without rating |
| Tap rating button | Submit rating, advance to next card |
| Keyboard 1/2/3 | Same as the three rating buttons |

Haptic feedback (`navigator.vibrate(8|14)`) on rating, where supported (Android only — iOS Safari blocks `vibrate` and Web Vibration in PWAs is unavailable).

### Hide-text rendering (Paper theme)

- Hidden text: each word wrapped in a span; the span is colored to match the canvas (`#FBF7F1`) and has `user-select: none`. A separate visual layer (`▬▬`) renders to preserve word width and line layout.
- Per-word reveal mode: tapping a word toggles its individual visibility.
- Dark theme uses the same approach with the dark canvas color.

### Streak & stats

- Streak: a row in `daily_log` for any day where `reviews_count > 0`.
- Stats screen renders a 30-day heatmap, package-level mature/learning/new ratio bars, and aggregate counts. All computed from `daily_log` + `review_state`.

## 6. Information Architecture

### Routes

```
/                         Today
/library                  Package list & browser
/library/:packageId       Package detail (group tree)
/library/:packageId/:verseNo   Verse detail (shareable URL)
/stats                    Stats
/settings                 Settings
/auth/callback            OAuth & magic-link redirect
```

Static routes (`/`, `/library`, `/stats`, `/settings`, `/auth/callback`) prerender at build time via `export const prerender = true`. Dynamic routes (`/library/[packageId]`, `/library/[packageId]/[verseNo]`) use `adapter-static` SPA fallback (`fallback: 'index.html'`); the client hydrates and resolves the params from IndexedDB / static JSON. Cloudflare Pages serves `index.html` for unmatched paths so deep links work.

### Navigation

Bottom tab bar with three tabs: **Today / Library / Stats**. Settings and account are accessed via a `⚙️` icon in each screen header. On widths ≥ 768 px, the tab bar promotes to a left sidebar.

### Today screen states

- **With queue**: header (date · streak), the active card, three rating buttons, progress dots.
- **Empty (new user)**: prompts for picking a first package, links to Library.
- **Completed**: summary with reviews completed, time spent, streak count, "내일 N구절 예정", and an option to add 5 more new cards.

### Library screen

- Starred favorites collapsed at top.
- Active packages with progress bars.
- Available (uninstalled) packages with `+` to install.
- Tapping a package navigates to `/library/:packageId` with the existing group tree (current app's index hierarchy preserved).

### Stats screen

- Streak count.
- 30-day contribution-style heatmap.
- Memorized count, average accuracy, total reviews.
- Per-package breakdown (mature/learning/new dots).

### Settings screen

Sections: Learning (daily target, hide mode), Design (font size, theme), Packages (active packages manager), Account (anon notice + "Enable sync" CTA, or email + logout).

### Onboarding

Three short cards on first visit, dismissible: welcome, interaction preview (with a sample card demo), pick a package and start. Records `localStorage.onboarded`.

### Shareable URLs

`https://memscripture.app/library/5_krv/3` deep-links to a single verse card. Anonymous session is auto-created. If the user later logs in, the data follows. This is the primary growth surface.

## 7. Visual Design System

### Principles

- Quiet confidence — verse text is the hero; UI recedes.
- Warm but modern — paper canvas with Pretendard sans, no nostalgia overload.
- Single accent (gold) — no rainbow.
- Same structure, two skins (light "Paper" + dark "Quiet Night").

### Color tokens

**Light (Paper)**

| Token | Value | Use |
|---|---|---|
| `bg/canvas` | `#FBF7F1` | App background |
| `bg/card` | `#FFFFFF` | Card surface |
| `bg/elevated` | `#F5EFE3` | Sheets, modals |
| `text/primary` | `#3A2E25` | Body |
| `text/secondary` | `#6B5640` | Subtitles, meta |
| `text/tertiary` | `#9B7E5A` | Labels |
| `accent` | `#C9A86A` | Selected, focus |
| `accent/soft` | `#F0E8D9` | Tinted backgrounds |
| `border` | `#E8DFD0` | Hairlines |
| `success` | `#6B8E5A` | Easy / mature |
| `warn` | `#C9954E` | Hard / amber |
| `danger` | `#B5654E` | Again / lapse |

**Dark (Quiet Night)**

| Token | Value |
|---|---|
| `bg/canvas` | `#1A1612` |
| `bg/card` | `#211D17` |
| `bg/elevated` | `#2B2620` |
| `text/primary` | `#F0E6D2` |
| `text/secondary` | `#B8A88E` |
| `text/tertiary` | `#8C7E68` |
| `accent` | `#D4B47A` |
| `accent/soft` | `rgba(212,180,122,0.12)` |
| `border` | `#2F2A22` |
| `success` | `#8FAB7A` |
| `warn` | `#D9A66A` |
| `danger` | `#C97A65` |

### Card-state colors

| State | Light | Dark |
|---|---|---|
| `new` | `#A39E94` | `#7A746A` |
| `learning` | `#C9A86A` | `#D4B47A` |
| `mature` | `#6B8E5A` | `#8FAB7A` |
| `suspended` | `#9B9489` | `#6B6760` |
| `starred` | `#B5654E` | `#C97A65` |

Always paired with a text label for accessibility.

### Typography (Pretendard Variable)

| Style | Size / Line / Weight |
|---|---|
| Display | 28 / 1.20 / 600 |
| Headline | 22 / 1.30 / 600 |
| Title | 18 / 1.35 / 600 |
| Body | 16 / 1.65 / 400 |
| Body strong | 16 / 1.65 / 600 |
| Caption | 13 / 1.50 / 500 |
| Label (uppercase, tracking 0.08em) | 11 / 1.30 / 600 |

Korean body line-height is set to 1.65 (vs the Latin-default 1.5) for breathing room appropriate to Hangul.

Numbers in stats and progress use `tabular-nums`.

### Font loading

Pretendard Variable subset (Hangul completed-syllable block + ASCII) ≈ 100 KB woff2, preloaded and cached for one year via Cache API.

### Spacing (4 px base)

`0 / 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64`. Card interior padding 24, between cards 12, sections 32, screen edge 20, tab bar 64 + safe-area.

### Radius & shadow

`sm 6 / md 10 / lg 14 / xl 22 (cards) / pill 999`.

Light shadows only (`soft / card / popover`); dark uses borders instead because shadows on dark backgrounds look awkward.

### Tailwind v4 config

CSS-first via `@theme` directive (no JS config file). Dark mode is implemented as a class toggle plus `prefers-color-scheme: dark` defaults; root variables redefine on dark.

### Iconography

`lucide-svelte`. 1.5 px stroke, 24 px default, 16 px inline.

### Motion

- Default transition: 150 ms, `cubic-bezier(.2,.7,.3,1)` (sharp ease-out).
- Card entry: 200 ms fade + 4 px slide up.
- Rating → next card: 220 ms cross-fade.
- `prefers-reduced-motion: reduce` shortens all transitions to near-zero (0.01 ms).

## 8. PWA & iOS Considerations

### Manifest

- `display: standalone`, `start_url: /?source=pwa`, `lang: ko`, theme/background `#FBF7F1`.
- Icons: 192, 512, maskable-512.

### Service Worker (vite-plugin-pwa + Workbox)

| Asset | Strategy |
|---|---|
| Build outputs (hashed JS/CSS/HTML) | Precache (auto-invalidated by hash) |
| Pretendard subset font | CacheFirst, 1 year |
| Bible package JSON | CacheFirst, 30 days |
| Icons / static images | CacheFirst |
| Supabase API | NetworkFirst with 5 s timeout, then IndexedDB fallback |
| OAuth redirects | NetworkOnly |

Update UX: a non-blocking toast offers "새 버전 [업데이트]". User opt-in only.

### Offline behavior

- After first install of any package, full offline learning works (data, rating, bookmarking — all queued).
- New package install requires online.
- First visit requires online.

### iOS-specific

- Use `100dvh` (dynamic viewport) instead of `100vh` to avoid the Safari address-bar height bug. This is the single largest scrolling fix vs. the legacy app.
- Drop `-webkit-overflow-scrolling: touch` (iOS 13+ has correct momentum by default; explicit declaration creates stacking-context bugs).
- `body` does not declare `height: 100%`; instead `min-height: 100dvh` allows natural document scroll.
- Apply `env(safe-area-inset-*)` to header (top), tab bar (bottom), and app container (left/right).
- `overscroll-behavior-y: contain` on `html, body` blocks pull-to-refresh interfering with card swipes.
- `touch-action: pan-y` on cards and `-webkit-touch-callout: none` to suppress the long-press system menu.
- Call `navigator.storage.persist()` after onboarding to attempt persistent storage (granted automatically when added to home screen).
- `apple-touch-icon` 180×180; iOS handles masking. No splash screens in V1.
- OAuth from a standalone PWA on iOS occasionally bounces to external Safari; mitigate by passing `?source=pwa` in `redirectTo` and handling re-entry in `/auth/callback`.
- Vibration: graceful no-op on iOS; rely on visual feedback.

### Performance budget

| Metric | Target |
|---|---|
| LCP, first load (4G) | < 2.5 s |
| LCP, cached repeat | < 0.5 s |
| INP | < 100 ms |
| First-load JS | < 80 KB gzipped |
| First-load CSS | < 30 KB gzipped |
| Lighthouse PWA | 100 |
| Lighthouse a11y | ≥ 95 |

### Accessibility checklist (V1)

Body contrast ≥ 4.5:1 in both themes; full keyboard reachability for tab bar / cards / rating; skip link; `lang="ko"`; semantic-color labels never rely on color alone; `aria-live="polite"` for rating updates; `prefers-reduced-motion` respected; user-adjustable font size (existing feature preserved); per-word reveal accessible to keyboard users; screen readers always read full verse text regardless of visual hide state.

### SEO / sharing

`adapter-static` produces real HTML pages, so:

- Per-route meta description (verse pages include citation in `<meta>`).
- Open Graph tags so Kakao previews show verse title and citation.
- `<link rel="canonical">`.
- `robots.txt` and `sitemap.xml` generated at build time.

## 9. Repo Structure

The new app overwrites the current repo (no separate folder). Legacy files (`main.py`, `app.yaml`, `static/lib/*`, `static/css/wbible.css`, `static/js/bible*.js`, `memory_tester.html`) are removed once the new app reaches phase 8 production. JSON data in `static/json/` moves to `static/data/`.

```
memscripture/
├── src/
│   ├── lib/
│   │   ├── db/{local.ts, verses.ts, sync.ts}
│   │   ├── srs/{fsrs.ts, queue.ts}
│   │   ├── auth/{client.ts, session.svelte.ts, providers.ts}
│   │   ├── stores/{settings.svelte.ts, deck.svelte.ts}
│   │   ├── components/{card/, nav/, auth/, stats/}
│   │   ├── ui/                           Button, Sheet, Toast, Input
│   │   └── utils/                        haptic, format, dates
│   ├── routes/
│   │   ├── +layout.svelte                tab bar, toast, offline indicator
│   │   ├── +layout.ts                    prerender = true
│   │   ├── +page.svelte                  Today
│   │   ├── library/{+page.svelte, [packageId]/+page.svelte, [packageId]/[verseNo]/+page.svelte}
│   │   ├── stats/+page.svelte
│   │   ├── settings/+page.svelte
│   │   └── auth/callback/+page.svelte
│   ├── service-worker.ts
│   ├── app.css                           @theme tokens
│   ├── app.html
│   └── hooks.client.ts
├── static/
│   ├── data/                             packages.json, packages_index.json, *_krv.json
│   ├── fonts/PretendardVariable-kr.woff2
│   ├── icons/{192,512,maskable-512}.png
│   ├── manifest.webmanifest
│   └── apple-touch-icon.png
├── supabase/
│   ├── migrations/0001_init.sql
│   └── config.toml
├── tests/
│   ├── unit/                             vitest
│   └── e2e/                              playwright
├── .github/workflows/{ci.yml}
├── svelte.config.js                      adapter-static
├── vite.config.ts                        vite-plugin-pwa
├── tsconfig.json
├── package.json
└── README.md
```

The repository is not currently a git repository. Phase 0 includes `git init` and pushing to a fresh GitHub repo so Cloudflare Pages can connect.

## 10. Phased Rollout

Each phase produces a working artifact deployable to a Cloudflare Pages preview URL.

### Phase 0 — Foundation (≈ half day)
SvelteKit + TS + Tailwind v4 init. Pretendard subset. Supabase project + migration. Cloudflare Pages connected. First "hello" deploy.

### Phase 1 — Data layer + read-only Library (1–2 days)
Dexie schema, package loader from `static/data/`. Routes `/library`, `/library/:pkg`, `/library/:pkg/:verse`. TabBar, Header. Equivalent of current app's browse capability, no auth.

### Phase 2 — Card UI + interactions (2–3 days)
`VerseCard`, `HideableText` (tap, long-press, double-tap), swipe, font size, light/dark theme toggle. Single perfectly-styled card.

### Phase 3 — SRS + Today queue (2–3 days)
`ts-fsrs` integration, `RatingButtons`, `todayQueue`, Today screen states (queue / empty / done). Real learning, anonymous local data only.

### Phase 4 — Hybrid auth (2–3 days)
Anonymous sign-in on app start. `LoginSheet`. Magic link → Google → Kakao OIDC, in that order. `linkIdentity` flow tested with anonymous → linked transition.

### Phase 5 — Sync (2–3 days)
`sync_queue` writer, drainer when online, app-start pull (LWW). Online/offline indicator. Two-device verification with same account.

### Phase 6 — Stats + streak (1–2 days)
`daily_log` writer, heatmap, package progress bars, aggregate counts.

### Phase 7 — PWA polish + iOS verification (2–3 days)
`vite-plugin-pwa` config, manifest, icons, "Add to home screen" prompt. iOS device testing for scrolling, safe-area, dvh. Lighthouse 100 PWA achieved.

### Phase 8 — Production + domain switch (1–2 days)
Cloudflare custom domain. Move nameservers from AWS Route 53 to Cloudflare (no-downtime, 24–48 h propagation). Old GAE app gets a deprecation banner or redirect for a few weeks. Beta invite to 5–10 friends.

**Total estimated working time: ~3 weeks.**

## 11. Testing Strategy

| Type | Tool | Scope |
|---|---|---|
| Unit | Vitest | FSRS scheduling, `todayQueue`, sync queue, formatters |
| Component | Vitest + @testing-library/svelte | `VerseCard`, `RatingButtons`, `HideableText` |
| E2E | Playwright | Onboarding → Today → rate → next; login; offline mode; sync between two contexts |
| Visual regression | Playwright screenshots | Light/dark cards, empty states |
| Lighthouse CI | `@lhci/cli` in GitHub Actions | PWA = 100, a11y ≥ 95 as a gate |
| iOS device | Manual, every phase end | Real iPhone, both Safari and home-screen PWA |

## 12. Risks

| Risk | Mitigation |
|---|---|
| Kakao OIDC setup is fiddly | Ship Magic Link first in Phase 4, add Kakao after it works. |
| iOS scrolling still glitchy after fixes | Hard-test at Phase 2 end with real device; tune dvh / safe-area / touch-action before adding more layers. |
| Pretendard licensing | OFL 1.1 — free for commercial and redistribution. Confirmed safe. |
| Supabase free-tier limits | DB 500 MB, 50K MAU/month. More than sufficient at "friends" scale; monitor only. |
| FSRS default parameters not optimal | Defaults are fine for V1. If a month of usage data accumulates, custom fitting becomes possible (deferred). |

## 13. Open Questions

None blocking V1 implementation as of this draft. Items deferred by explicit decision:

- Apple Sign-In (V2)
- Existing-localStorage migration (skipped per user)
- User-tunable SRS parameters (V2)
- Typing & TTS modes (V2)

## 14. Decisions Log

| # | Decision | Rationale |
|---|---|---|
| 1 | Reimagine UI/UX, preserve data assets | User chose option C in scope question. |
| 2 | Public app, hybrid auth | Friends register easily without forced login. |
| 3 | Kakao + Google + Magic Link in V1; Apple V2 | Cost avoidance ($99/yr); magic link covers iPhone fallback. |
| 4 | FSRS, three rating buttons (다시/보통/쉬움) | Better than SM-2; three buttons less ambiguous than four. |
| 5 | SvelteKit 2 + Svelte 5 + TS + Tailwind v4 | Smallest bundles, most stable modern Korean DX. |
| 6 | Visual: Paper palette + Pretendard | User chose B + Pretendard. |
| 7 | Today-first home + tap/swipe/buttons | Today-first matches SRS centrality. |
| 8 | Cloudflare Pages, domain moved from AWS | Korean PoP, free unlimited bandwidth, simpler deploy. |
| 9 | No legacy data migration | Skipped per user request; reduces code burden. |
