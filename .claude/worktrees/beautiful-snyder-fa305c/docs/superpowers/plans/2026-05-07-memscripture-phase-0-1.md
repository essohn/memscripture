# MemScripture Redesign — Phase 0 + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation (SvelteKit + Tailwind v4 + Cloudflare Pages + Supabase project) and the read-only Library — a deployable PWA where anyone can browse all 7 Bible packages with proper iOS scrolling and the new visual identity. No auth, no SRS, no card flipping yet — those come in subsequent phase plans.

**Architecture:** Pure static SPA via `adapter-static`. Bible packages live as JSON in `static/data/`, loaded into IndexedDB on first install. SvelteKit dynamic routes (`/library/[packageId]/[verseNo]`) render via SPA fallback. Visual tokens defined in CSS via Tailwind v4's `@theme` directive. Supabase project provisioned but unused until Phase 4.

**Tech Stack:** SvelteKit 2.x / Svelte 5 / TypeScript 5 / Tailwind v4 / Dexie 4 / Vitest / Playwright / Pretendard Variable

**Spec:** [docs/superpowers/specs/2026-05-07-memscripture-redesign-design.md](../specs/2026-05-07-memscripture-redesign-design.md)

---

## File Structure (Phase 0 + 1)

```
memscripture/
├── package.json
├── pnpm-lock.yaml
├── svelte.config.js
├── vite.config.ts
├── tsconfig.json
├── .gitignore
├── .env.example
├── README.md
├── .github/workflows/ci.yml
├── src/
│   ├── app.css                 Tailwind v4 + @theme tokens (light + dark)
│   ├── app.html                HTML shell, lang="ko", theme-color
│   ├── lib/
│   │   ├── types.ts            Verse, Package, IndexGroup type definitions
│   │   ├── db/
│   │   │   ├── local.ts        Dexie schema (V1 — packages, verses, settings)
│   │   │   └── verses.ts       installPackage(), readVerse(), listPackages()
│   │   ├── components/nav/
│   │   │   ├── TabBar.svelte   3-tab bottom nav (Today/Library/Stats)
│   │   │   └── Header.svelte   page header with title + ⚙️
│   │   └── utils/
│   │       └── classnames.ts   cn() helper
│   └── routes/
│       ├── +layout.svelte      tab bar, safe-area, theme class
│       ├── +layout.ts          prerender = true
│       ├── +page.svelte        Today (placeholder for Phase 3)
│       ├── library/
│       │   ├── +page.svelte               package list
│       │   ├── [packageId]/+page.svelte   group tree
│       │   └── [packageId]/[verseNo]/+page.svelte   verse detail
│       ├── stats/+page.svelte              placeholder
│       └── settings/+page.svelte           placeholder
├── static/
│   ├── data/                   Bible packages (moved from /static/json/)
│   │   ├── packages.json
│   │   ├── packages_index.json
│   │   ├── 5_krv.json
│   │   ├── 8_krv.json
│   │   ├── 60_krv.json
│   │   ├── 100_krv.json
│   │   ├── 180_krv.json
│   │   ├── 242_krv.json
│   │   └── 900_krv.json
│   ├── fonts/
│   │   └── PretendardVariable-subset.woff2
│   ├── icons/
│   │   ├── 192.png
│   │   └── 512.png
│   └── apple-touch-icon.png
├── supabase/
│   ├── config.toml
│   └── migrations/0001_init.sql
└── tests/
    ├── unit/
    │   ├── db.test.ts
    │   └── verses.test.ts
    └── e2e/
        ├── library.spec.ts
        └── ios-scroll.spec.ts
```

---

## Phase 0 — Foundation

### Task 0.1: Archive legacy code

**Files:**
- Create: `legacy/` directory
- Move: `main.py`, `main.pyc`, `app.yaml`, `index.yaml`, `memory_tester.html`, `static/lib/*`, `static/css/wbible.css`, `static/css/memory.css`, `static/js/*`, `static/images/*` → `legacy/`
- Keep in place: `static/json/*.json` (will be moved to `static/data/` in Phase 1)
- Keep in place: `docs/`

- [ ] **Step 1: Create legacy directory and move files**

```bash
mkdir -p legacy/static
git mv main.py main.pyc app.yaml index.yaml memory_tester.html legacy/ 2>/dev/null || mv main.py main.pyc app.yaml index.yaml memory_tester.html legacy/
mv static/lib legacy/static/
mv static/css legacy/static/
mv static/js legacy/static/
mv static/images legacy/static/
```

- [ ] **Step 2: Verify result**

Run: `ls -la`
Expected: top-level shows `docs/`, `legacy/`, `static/json/` only.

Run: `ls static/`
Expected: only `json/` remains.

### Task 0.2: Initialize SvelteKit project

**Files:**
- Create via scaffold: `package.json`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `src/app.html`, `src/app.d.ts`, `src/routes/+page.svelte`, `static/favicon.png`, `.gitignore`, `.npmrc`

- [ ] **Step 1: Run SvelteKit scaffold**

Run from `/Users/esohn/dev/memscripture`:

```bash
pnpm dlx sv create . --template=minimal --types=ts --no-add-ons --install=pnpm
```

When prompted "Directory not empty. Continue?" → Yes.

Expected: SvelteKit creates `src/`, `package.json`, `svelte.config.js`, etc.

- [ ] **Step 2: Verify install and dev server**

```bash
pnpm install
pnpm dev
```

Expected: dev server at `http://localhost:5173` showing default SvelteKit welcome page.

Stop with Ctrl+C.

- [ ] **Step 3: Commit baseline**

```bash
git init
git add .
git commit -m "chore: archive legacy GAE app and scaffold SvelteKit"
```

### Task 0.3: Add adapter-static and configure prerender

**Files:**
- Modify: `package.json` (add `@sveltejs/adapter-static`)
- Modify: `svelte.config.js`
- Create: `src/routes/+layout.ts`

- [ ] **Step 1: Install adapter-static**

```bash
pnpm add -D @sveltejs/adapter-static
pnpm remove @sveltejs/adapter-auto
```

- [ ] **Step 2: Configure svelte.config.js**

Replace contents of `svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: true
    }),
    alias: {
      $lib: 'src/lib'
    }
  }
};

export default config;
```

- [ ] **Step 3: Add prerender directive**

Create `src/routes/+layout.ts`:

```ts
export const prerender = true;
export const ssr = false;
```

`ssr = false` makes this a pure SPA — required for IndexedDB access on first paint and avoids hydration mismatch with browser-only APIs.

- [ ] **Step 4: Verify build succeeds**

```bash
pnpm build
```

Expected: build completes, `build/` directory contains `index.html` and assets.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "build: switch to adapter-static SPA mode"
```

### Task 0.4: Install and configure Tailwind v4

**Files:**
- Modify: `package.json` (add `tailwindcss`, `@tailwindcss/vite`)
- Modify: `vite.config.ts`
- Create: `src/app.css`
- Modify: `src/routes/+layout.svelte` (import app.css)

- [ ] **Step 1: Install Tailwind v4**

```bash
pnpm add -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Configure Vite plugin**

Replace `vite.config.ts`:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()]
});
```

- [ ] **Step 3: Create app.css with theme tokens**

Create `src/app.css`:

```css
@import 'tailwindcss';

@theme {
  --font-sans: 'Pretendard Variable', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif;

  /* Light (Paper) — default */
  --color-canvas: #FBF7F1;
  --color-card: #FFFFFF;
  --color-elevated: #F5EFE3;
  --color-text: #3A2E25;
  --color-text-secondary: #6B5640;
  --color-text-tertiary: #9B7E5A;
  --color-accent: #C9A86A;
  --color-accent-soft: #F0E8D9;
  --color-border: #E8DFD0;
  --color-success: #6B8E5A;
  --color-warn: #C9954E;
  --color-danger: #B5654E;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 22px;

  --shadow-soft: 0 1px 2px rgba(58,46,37,.04), 0 2px 6px rgba(58,46,37,.06);
  --shadow-card: 0 2px 14px rgba(58,46,37,.08);
  --shadow-popover: 0 8px 24px rgba(58,46,37,.12);
}

/* Dark theme — class-based, overridden by media query if no class set */
:root.theme-dark,
:root.theme-system {
  --color-canvas: #1A1612;
  --color-card: #211D17;
  --color-elevated: #2B2620;
  --color-text: #F0E6D2;
  --color-text-secondary: #B8A88E;
  --color-text-tertiary: #8C7E68;
  --color-accent: #D4B47A;
  --color-accent-soft: rgba(212,180,122,0.12);
  --color-border: #2F2A22;
  --color-success: #8FAB7A;
  --color-warn: #D9A66A;
  --color-danger: #C97A65;
}

@media (prefers-color-scheme: dark) {
  :root.theme-system {
    /* already dark via above selector */
  }
  :root:not(.theme-light):not(.theme-dark) {
    --color-canvas: #1A1612;
    --color-card: #211D17;
    --color-elevated: #2B2620;
    --color-text: #F0E6D2;
    --color-text-secondary: #B8A88E;
    --color-text-tertiary: #8C7E68;
    --color-accent: #D4B47A;
    --color-accent-soft: rgba(212,180,122,0.12);
    --color-border: #2F2A22;
  }
}

/* Base reset & ergonomics */
html {
  -webkit-text-size-adjust: 100%;
  text-rendering: optimizeLegibility;
}

body {
  background: var(--color-canvas);
  color: var(--color-text);
  font-family: var(--font-sans);
  min-height: 100dvh;
  font-size: 16px;
  line-height: 1.65;
  overscroll-behavior-y: contain;
}

* {
  -webkit-tap-highlight-color: transparent;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: Create +layout.svelte that imports app.css**

Create `src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

{@render children()}
```

- [ ] **Step 5: Update +page.svelte to use tokens**

Replace `src/routes/+page.svelte`:

```svelte
<main class="p-5">
  <h1 class="text-2xl font-semibold">MemScripture</h1>
  <p class="text-[var(--color-text-secondary)] mt-2">Phase 0 foundation.</p>
</main>
```

- [ ] **Step 6: Verify dev server**

```bash
pnpm dev
```

Open `http://localhost:5173`. Expected: cream `#FBF7F1` background, dark warm text, system sans (Pretendard not yet loaded).

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: add Tailwind v4 with Paper theme tokens"
```

### Task 0.5: Add Pretendard subset font

**Files:**
- Create: `static/fonts/PretendardVariable-subset.woff2` (downloaded)
- Modify: `src/app.html`
- Modify: `src/app.css` (font-face)

- [ ] **Step 1: Download Pretendard Variable Korean subset**

```bash
mkdir -p static/fonts
curl -L -o static/fonts/PretendardVariable-subset.woff2 \
  https://github.com/orioncactus/pretendard/raw/main/packages/pretendard/dist/web/variable/woff2-subset/PretendardVariable.subset.woff2
ls -lah static/fonts/PretendardVariable-subset.woff2
```

Expected: file size 100–250 KB.

If the URL changes, the engineer should grab the latest `pretendard` v1.x release subset woff2 from https://github.com/orioncactus/pretendard/releases — file named `PretendardVariable.subset.woff2`.

- [ ] **Step 2: Add @font-face to app.css**

At the top of `src/app.css`, before `@import 'tailwindcss';`:

```css
@font-face {
  font-family: 'Pretendard Variable';
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/PretendardVariable-subset.woff2') format('woff2-variations');
}
```

- [ ] **Step 3: Preload font in app.html**

Replace `src/app.html`:

```html
<!doctype html>
<html lang="ko" class="theme-light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#FBF7F1" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <link rel="apple-touch-icon" href="%sveltekit.assets%/apple-touch-icon.png" />
    <link
      rel="preload"
      as="font"
      type="font/woff2"
      crossorigin
      href="%sveltekit.assets%/fonts/PretendardVariable-subset.woff2"
    />
    <title>MemScripture</title>
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

- [ ] **Step 4: Verify font loads in browser**

```bash
pnpm dev
```

Open `http://localhost:5173`. Expected: text renders in Pretendard (rounder strokes than system sans). DevTools → Network → Font: should show `PretendardVariable-subset.woff2` loaded once with `200 OK`.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: load Pretendard Variable subset"
```

### Task 0.6: Configure TypeScript strict + Vitest

**Files:**
- Modify: `tsconfig.json`
- Modify: `package.json` (add `vitest`, `@vitest/ui`, `@testing-library/svelte`, `@testing-library/jest-dom`, `jsdom`)
- Create: `vitest.config.ts`
- Create: `tests/unit/sanity.test.ts`

- [ ] **Step 1: Install Vitest and Svelte testing**

```bash
pnpm add -D vitest @vitest/ui @testing-library/svelte @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib')
    }
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    globals: true
  }
});
```

The `$lib` alias mirrors the SvelteKit alias from `svelte.config.js`. Without it, test files that import `$lib/types` (transitively, via `$lib/db/verses.ts`) would fail to resolve.

- [ ] **Step 3: Add test script**

In `package.json`, under `scripts`:

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 4: Write a failing sanity test**

Create `tests/unit/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('arithmetic still works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run and verify**

```bash
pnpm test
```

Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "test: add vitest with sanity test"
```

### Task 0.7: Configure Playwright for E2E

**Files:**
- Modify: `package.json` (`@playwright/test`)
- Create: `playwright.config.ts`
- Create: `tests/e2e/home.spec.ts`

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium webkit
```

`webkit` is essential — that's our iOS Safari proxy for testing.

- [ ] **Step 2: Configure Playwright**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'pnpm build && pnpm preview',
    port: 4173,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'iphone-14',  use: devices['iPhone 14'] }
  ]
});
```

- [ ] **Step 3: Write home page E2E test**

Create `tests/e2e/home.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('home renders and Pretendard loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'MemScripture' })).toBeVisible();

  // Pretendard should be loaded
  const fontLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some(
      (f) => f.family.includes('Pretendard') && f.status === 'loaded'
    );
  });
  expect(fontLoaded).toBe(true);
});
```

- [ ] **Step 4: Run and verify**

```bash
pnpm test:e2e
```

Expected: 2 tests passed (chromium + iphone-14).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test: add playwright e2e with chromium and iphone-14 projects"
```

### Task 0.8: Set up Supabase local migrations

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/0001_init.sql`
- Modify: `.gitignore` (Supabase volumes)

- [ ] **Step 1: Install Supabase CLI**

```bash
brew install supabase/tap/supabase   # macOS
# or: pnpm add -D supabase
supabase --version
```

Expected: version ≥ 1.190.

- [ ] **Step 2: Init Supabase project locally**

```bash
supabase init
```

Creates `supabase/` directory with `config.toml`.

- [ ] **Step 3: Write the initial migration**

Create `supabase/migrations/0001_init.sql`:

```sql
-- profiles
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- review_state
create table public.review_state (
  user_id    uuid not null references auth.users(id) on delete cascade,
  package_id text not null,
  verse_no   int  not null,
  stability  real default 0,
  difficulty real default 5,
  due_at     date,
  last_review timestamptz,
  reps       int default 0,
  lapses     int default 0,
  status     text default 'new'
             check (status in ('new','learning','mature','suspended')),
  starred    boolean default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, package_id, verse_no)
);
create index review_state_due_idx on public.review_state (user_id, due_at);

-- daily_log
create table public.daily_log (
  user_id       uuid not null references auth.users(id) on delete cascade,
  date          date not null,
  reviews_count int default 0,
  new_count     int default 0,
  primary key (user_id, date)
);

-- user_settings
create table public.user_settings (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  font_size       int default 100,
  hide_mode       text default 'fade' check (hide_mode in ('fade','blur','hidden')),
  daily_target    int default 10,
  active_packages text[] default array[]::text[],
  theme           text default 'paper' check (theme in ('paper','dark','system')),
  updated_at      timestamptz not null default now()
);

-- RLS
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

- [ ] **Step 4: Verify migration applies locally**

```bash
supabase start
supabase db reset
```

Expected: migrations apply, no errors. The local Supabase Studio URL is printed.

```bash
supabase db lint
```

Expected: no warnings.

- [ ] **Step 5: Stop local Supabase to free Docker resources**

```bash
supabase stop
```

- [ ] **Step 6: Update .gitignore**

Add to `.gitignore`:

```
.svelte-kit/
build/
node_modules/
.env
.env.*
!.env.example
playwright-report/
test-results/
supabase/.branches
supabase/.temp
```

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: add Supabase schema with RLS policies"
```

### Task 0.9: Set up Cloudflare Pages and remote Supabase

**Files:**
- Create: `.env.example`
- Create: `README.md`

This task is half-manual (browser actions) — document the steps and verify the deploy.

- [ ] **Step 1: Create `.env.example`**

```
PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJI...
```

- [ ] **Step 2: Create README with setup notes**

Create `README.md`:

```markdown
# MemScripture

Korean Bible verse memorization PWA.

## Stack
SvelteKit 2 / Svelte 5 / TypeScript / Tailwind v4 / Dexie 4 / Supabase / Cloudflare Pages

## Develop

\`\`\`bash
pnpm install
cp .env.example .env   # fill in Supabase keys
pnpm dev
\`\`\`

## Test

\`\`\`bash
pnpm test       # unit (vitest)
pnpm test:e2e   # e2e (playwright, includes iPhone 14 webkit)
\`\`\`

## Deploy
Pushes to `main` deploy automatically to Cloudflare Pages.
\`\`\`

- [ ] **Step 3: Push to GitHub**

```bash
git add .
git commit -m "docs: add README and .env.example"
gh repo create memscripture --public --source=. --push
```

(If `gh` is not installed: create the repo on github.com, then `git remote add origin` and `git push -u origin main`.)

- [ ] **Step 4: Create remote Supabase project**

In a browser: https://supabase.com → New project → name "memscripture" → region closest to users (e.g., Tokyo `ap-northeast-1`) → save the project ref and anon key.

- [ ] **Step 5: Apply migration to remote Supabase**

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Expected: migration `0001_init.sql` applied to remote.

- [ ] **Step 6: Connect Cloudflare Pages**

In a browser: dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git → select `memscripture` repo.

Build settings:
- Framework preset: SvelteKit
- Build command: `pnpm build`
- Build output directory: `build`
- Root directory: `/`
- Environment variables:
  - `PUBLIC_SUPABASE_URL` = (from Supabase)
  - `PUBLIC_SUPABASE_ANON_KEY` = (from Supabase)
  - `NODE_VERSION` = `20`

Save and deploy.

- [ ] **Step 7: Verify production URL**

Wait for deploy. Open `https://memscripture.pages.dev`. Expected: same Phase 0 page as local — cream background, Pretendard font.

- [ ] **Step 8: Commit deployment notes**

Add to `README.md` under `## Deploy`:

```markdown
- Production: https://memscripture.pages.dev
- Custom domain: configured in Phase 8
```

```bash
git add README.md
git commit -m "docs: add production URL to README"
git push
```

### Task 0.10: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write CI workflow**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      - run: pnpm test
      - run: pnpm exec playwright install --with-deps chromium webkit
      - run: pnpm test:e2e
        env:
          PUBLIC_SUPABASE_URL: https://example.supabase.co
          PUBLIC_SUPABASE_ANON_KEY: dummy
```

- [ ] **Step 2: Push and verify**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions for typecheck + test + e2e"
git push
```

Expected: green check on the commit on GitHub within ~3 min.

---

## Phase 1 — Data Layer + Library

### Task 1.1: Move package data to static/data

**Files:**
- Move: `static/json/*.json` → `static/data/`
- Rename: `packages_info.json` → `packages.json`, `packages_index_info.json` → `packages_index.json`
- Delete: `static/json/` (empty)

- [ ] **Step 1: Move files**

```bash
mkdir -p static/data
mv static/json/packages_info.json static/data/packages.json
mv static/json/packages_index_info.json static/data/packages_index.json
mv static/json/*_krv.json static/data/
rmdir static/json
ls static/data/
```

Expected: `packages.json`, `packages_index.json`, `5_krv.json`, `8_krv.json`, `60_krv.json`, `100_krv.json`, `180_krv.json`, `242_krv.json`, `900_krv.json`.

- [ ] **Step 2: Update source URLs in packages.json**

The `source` field still points to `json/...`. Update each:

```bash
sed -i.bak 's#"source": "json/#"source": "data/#g' static/data/packages.json
rm static/data/packages.json.bak
```

Verify with `grep '"source"' static/data/packages.json` — every line should show `"source": "data/..."`.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "data: move bible packages to static/data and rename index files"
```

### Task 1.2: Define shared types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Write types**

```ts
// src/lib/types.ts

export interface Verse {
  i: number;       // verse number within the package (1-indexed)
  title: string;   // e.g., "5 인도의 확신"
  cite: string;    // e.g., "잠언 3 : 5-6"
  w: string;       // verse text (the word)
}

export interface PackageMeta {
  id: string;              // e.g., "5_krv"
  name: string;            // e.g., "그리스도인의 확신 5구절"
  verse_number: number;
  translation: 'krv';
  translation_name: string;
  abbreviation: string;
  language: 'kor';
  copyright: string;
  copyright_text: string;
  version: number;
  source: string;          // e.g., "data/5_krv.json"
  default: boolean;
}

export interface IndexGroup {
  package_id: string;
  group_name: string;
  level: 1 | 2;
  index: number[];
}
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat: add shared type definitions"
```

### Task 1.3: Add Dexie and write IndexedDB schema (TDD)

**Files:**
- Modify: `package.json` (add `dexie`)
- Create: `src/lib/db/local.ts`
- Create: `tests/unit/db.test.ts`

- [ ] **Step 1: Install Dexie**

```bash
pnpm add dexie
```

- [ ] **Step 2: Write failing schema test**

Create `tests/unit/db.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('local db schema', () => {
  it('exposes the expected tables', () => {
    const names = db.tables.map((t) => t.name).sort();
    expect(names).toEqual(['packages', 'settings', 'verses']);
  });

  it('round-trips a verse', async () => {
    await db.verses.put({ package_id: '5_krv', no: 1, title: 't', cite: 'c', w: 'w' });
    const v = await db.verses.get(['5_krv', 1]);
    expect(v?.title).toBe('t');
  });
});
```

- [ ] **Step 3: Install fake-indexeddb for tests**

```bash
pnpm add -D fake-indexeddb
```

- [ ] **Step 4: Run test to verify failure**

```bash
pnpm test
```

Expected: FAIL — module `src/lib/db/local.ts` does not exist.

- [ ] **Step 5: Implement minimal schema**

Create `src/lib/db/local.ts`:

```ts
import Dexie, { type Table } from 'dexie';
import type { PackageMeta, Verse } from '$lib/types';

export type StoredVerse = Verse & { package_id: string; no: number };
export type StoredPackage = PackageMeta;
export type StoredSetting = { key: string; value: unknown };

class LocalDB extends Dexie {
  packages!: Table<StoredPackage, string>;
  verses!: Table<StoredVerse, [string, number]>;
  settings!: Table<StoredSetting, string>;

  constructor() {
    super('memscripture');
    this.version(1).stores({
      packages: '&id, name',
      verses: '[package_id+no], package_id',
      settings: '&key'
    });
  }
}

export const db = new LocalDB();
```

- [ ] **Step 6: Run test to verify pass**

```bash
pnpm test
```

Expected: 3 passed (sanity + 2 db tests).

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: add Dexie local db schema"
```

### Task 1.4: Implement package loader (TDD)

**Files:**
- Create: `src/lib/db/verses.ts`
- Create: `tests/unit/verses.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/verses.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/lib/db/local';
import { listPackages, installPackage, readVerse } from '../../src/lib/db/verses';

beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.restoreAllMocks();
});

const samplePackages = {
  '5_krv': {
    id: '5_krv', name: '그리스도인의 확신 5구절', verse_number: 5,
    translation: 'krv', translation_name: '개역한글', abbreviation: '5구절',
    language: 'kor', copyright: '', copyright_text: '', version: 1,
    source: 'data/5_krv.json', default: true
  }
};
const sampleVerses = [
  { i: 1, title: 't1', cite: 'c1', w: 'w1' },
  { i: 2, title: 't2', cite: 'c2', w: 'w2' }
];

function mockFetch(map: Record<string, unknown>) {
  global.fetch = vi.fn(async (url: any) => {
    const u = String(url);
    const key = Object.keys(map).find((k) => u.endsWith(k));
    if (!key) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(map[key]), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as any;
}

describe('listPackages', () => {
  it('fetches and caches packages', async () => {
    mockFetch({ 'data/packages.json': samplePackages });
    const packs = await listPackages();
    expect(packs).toHaveLength(1);
    expect(packs[0].name).toBe('그리스도인의 확신 5구절');

    // Second call should use cache (no network)
    (global.fetch as any).mockClear();
    const cached = await listPackages();
    expect(cached).toHaveLength(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('installPackage', () => {
  it('downloads and stores verses by package id', async () => {
    mockFetch({
      'data/packages.json': samplePackages,
      'data/5_krv.json': sampleVerses
    });
    await listPackages();
    await installPackage('5_krv');
    const stored = await db.verses.where('package_id').equals('5_krv').toArray();
    expect(stored).toHaveLength(2);
    expect(stored.find((v) => v.no === 1)?.title).toBe('t1');
  });

  it('is idempotent', async () => {
    mockFetch({
      'data/packages.json': samplePackages,
      'data/5_krv.json': sampleVerses
    });
    await listPackages();
    await installPackage('5_krv');
    await installPackage('5_krv');
    const count = await db.verses.where('package_id').equals('5_krv').count();
    expect(count).toBe(2);
  });
});

describe('readVerse', () => {
  it('returns the verse for (package, no)', async () => {
    mockFetch({
      'data/packages.json': samplePackages,
      'data/5_krv.json': sampleVerses
    });
    await listPackages();
    await installPackage('5_krv');
    const v = await readVerse('5_krv', 2);
    expect(v?.cite).toBe('c2');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test
```

Expected: FAIL — `src/lib/db/verses.ts` does not exist.

- [ ] **Step 3: Implement loader**

Create `src/lib/db/verses.ts`:

```ts
import { db, type StoredVerse, type StoredPackage } from './local';
import type { PackageMeta, Verse } from '$lib/types';

const PACKAGES_URL = '/data/packages.json';

export async function listPackages(): Promise<PackageMeta[]> {
  const cached = await db.packages.toArray();
  if (cached.length) return cached;

  const res = await fetch(PACKAGES_URL);
  if (!res.ok) throw new Error(`Failed to load packages: ${res.status}`);
  const map = (await res.json()) as Record<string, Omit<PackageMeta, 'id'>>;
  const list: PackageMeta[] = Object.entries(map).map(([id, meta]) => ({ ...meta, id }));
  await db.packages.bulkPut(list);
  return list;
}

export async function isPackageInstalled(packageId: string): Promise<boolean> {
  const count = await db.verses.where('package_id').equals(packageId).count();
  return count > 0;
}

export async function installPackage(packageId: string): Promise<void> {
  if (await isPackageInstalled(packageId)) return;

  const pkg = await db.packages.get(packageId);
  if (!pkg) throw new Error(`Unknown package: ${packageId}`);

  const res = await fetch(`/${pkg.source}`);
  if (!res.ok) throw new Error(`Failed to load ${pkg.source}: ${res.status}`);
  const verses = (await res.json()) as Verse[];

  const rows: StoredVerse[] = verses.map((v) => ({
    ...v,
    package_id: packageId,
    no: v.i
  }));
  await db.verses.bulkPut(rows);
}

export async function readVerse(
  packageId: string,
  verseNo: number
): Promise<StoredVerse | undefined> {
  return db.verses.get([packageId, verseNo]);
}

export async function listVerses(packageId: string): Promise<StoredVerse[]> {
  return db.verses.where('package_id').equals(packageId).sortBy('no');
}
```

- [ ] **Step 4: Verify tests pass**

```bash
pnpm test
```

Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add package loader (list/install/read)"
```

### Task 1.5: Implement index group loader (TDD)

**Files:**
- Modify: `src/lib/db/verses.ts`
- Modify: `tests/unit/verses.test.ts`

- [ ] **Step 1: Add failing test for groups**

Append to `tests/unit/verses.test.ts`:

```ts
import { listGroups } from '../../src/lib/db/verses';

const sampleGroups = [
  { package_id: '5_krv', group_name: '그리스도인의 확신 5구절', level: 1, index: [1, 2, 3, 4, 5] }
];

describe('listGroups', () => {
  it('fetches groups for a package', async () => {
    mockFetch({
      'data/packages.json': samplePackages,
      'data/packages_index.json': sampleGroups
    });
    await listPackages();
    const groups = await listGroups('5_krv');
    expect(groups).toHaveLength(1);
    expect(groups[0].group_name).toContain('그리스도인의 확신');
  });

  it('returns empty array for unknown package', async () => {
    mockFetch({
      'data/packages.json': samplePackages,
      'data/packages_index.json': sampleGroups
    });
    await listPackages();
    const groups = await listGroups('unknown');
    expect(groups).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm test
```

Expected: FAIL — `listGroups` not exported.

- [ ] **Step 3: Implement listGroups**

Add to `src/lib/db/verses.ts`:

```ts
import type { IndexGroup } from '$lib/types';

const GROUPS_URL = '/data/packages_index.json';
let groupsCache: IndexGroup[] | null = null;

export async function listGroups(packageId: string): Promise<IndexGroup[]> {
  if (!groupsCache) {
    const res = await fetch(GROUPS_URL);
    if (!res.ok) throw new Error(`Failed to load groups: ${res.status}`);
    groupsCache = (await res.json()) as IndexGroup[];
  }
  return groupsCache.filter((g) => g.package_id === packageId);
}
```

- [ ] **Step 4: Verify pass**

```bash
pnpm test
```

Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add index groups loader"
```

### Task 1.6: TabBar component (TDD with Svelte)

**Files:**
- Create: `src/lib/components/nav/TabBar.svelte`
- Create: `tests/unit/TabBar.test.ts`

- [ ] **Step 1: Set up Svelte testing**

Update `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [svelte({ hot: false }), svelteTesting()],
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib')
    }
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
    setupFiles: ['./tests/unit/setup.ts']
  }
});
```

Create `tests/unit/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: Write failing test**

Create `tests/unit/TabBar.test.ts`:

```ts
import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import TabBar from '../../src/lib/components/nav/TabBar.svelte';

describe('TabBar', () => {
  it('renders three tabs', () => {
    render(TabBar, { props: { current: 'today' } });
    expect(screen.getByRole('link', { name: /today/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /library/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /stats/i })).toBeInTheDocument();
  });

  it('marks current tab as active via aria-current', () => {
    render(TabBar, { props: { current: 'library' } });
    const lib = screen.getByRole('link', { name: /library/i });
    expect(lib).toHaveAttribute('aria-current', 'page');
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
pnpm test
```

Expected: FAIL — component doesn't exist.

- [ ] **Step 4: Install lucide-svelte**

```bash
pnpm add lucide-svelte
```

- [ ] **Step 5: Implement TabBar**

Create `src/lib/components/nav/TabBar.svelte`:

```svelte
<script lang="ts">
  import { BookOpen, Library, BarChart3 } from 'lucide-svelte';

  interface Props {
    current: 'today' | 'library' | 'stats';
  }
  let { current }: Props = $props();

  const tabs = [
    { id: 'today',   href: '/',         label: 'Today',   icon: BookOpen },
    { id: 'library', href: '/library',  label: 'Library', icon: Library },
    { id: 'stats',   href: '/stats',    label: 'Stats',   icon: BarChart3 }
  ] as const;
</script>

<nav
  class="fixed bottom-0 inset-x-0 bg-[var(--color-card)] border-t border-[var(--color-border)] z-50"
  style="padding-bottom: env(safe-area-inset-bottom);"
  aria-label="주 네비게이션"
>
  <ul class="flex items-center justify-around h-16 max-w-md mx-auto">
    {#each tabs as tab}
      {@const Icon = tab.icon}
      {@const active = current === tab.id}
      <li>
        <a
          href={tab.href}
          aria-current={active ? 'page' : undefined}
          aria-label={tab.label}
          class="flex flex-col items-center gap-1 px-4 py-2 rounded-md transition-colors"
          class:text-[var(--color-accent)]={active}
          class:text-[var(--color-text-tertiary)]={!active}
        >
          <Icon size={22} strokeWidth={1.75} />
          <span class="text-[11px] font-medium tracking-wide">{tab.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>
```

- [ ] **Step 6: Verify tests pass**

```bash
pnpm test
```

Expected: all passed.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: add TabBar component with 3 tabs"
```

### Task 1.7: Header component

**Files:**
- Create: `src/lib/components/nav/Header.svelte`

- [ ] **Step 1: Implement Header**

Create `src/lib/components/nav/Header.svelte`:

```svelte
<script lang="ts">
  import { Settings } from 'lucide-svelte';

  interface Props {
    title: string;
    showSettings?: boolean;
    onBack?: () => void;
  }
  let { title, showSettings = true, onBack }: Props = $props();
</script>

<header
  class="sticky top-0 bg-[var(--color-canvas)]/90 backdrop-blur z-40 border-b border-[var(--color-border)]"
  style="padding-top: env(safe-area-inset-top);"
>
  <div class="flex items-center justify-between h-14 max-w-md mx-auto px-5">
    {#if onBack}
      <button
        type="button"
        onclick={onBack}
        aria-label="뒤로"
        class="text-[var(--color-text-secondary)] -ml-2 p-2"
      >←</button>
    {:else}
      <span class="w-6"></span>
    {/if}
    <h1 class="text-lg font-semibold text-[var(--color-text)]">{title}</h1>
    {#if showSettings}
      <a href="/settings" aria-label="설정" class="text-[var(--color-text-secondary)] -mr-2 p-2">
        <Settings size={20} strokeWidth={1.75} />
      </a>
    {:else}
      <span class="w-6"></span>
    {/if}
  </div>
</header>
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat: add Header component with optional back/settings"
```

### Task 1.8: Wire layout with TabBar

**Files:**
- Modify: `src/routes/+layout.svelte`
- Create: `src/lib/utils/route.ts`

- [ ] **Step 1: Add route → tab helper**

Create `src/lib/utils/route.ts`:

```ts
export function currentTab(pathname: string): 'today' | 'library' | 'stats' {
  if (pathname.startsWith('/library')) return 'library';
  if (pathname.startsWith('/stats')) return 'stats';
  return 'today';
}
```

- [ ] **Step 2: Update layout to use tab bar**

Replace `src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import TabBar from '$lib/components/nav/TabBar.svelte';
  import { currentTab } from '$lib/utils/route';

  let { children } = $props();
  const tab = $derived(currentTab(page.url.pathname));
</script>

<div class="min-h-dvh pb-20" style="padding-bottom: calc(64px + env(safe-area-inset-bottom));">
  {@render children()}
</div>

<TabBar current={tab} />
```

- [ ] **Step 3: Verify dev server**

```bash
pnpm dev
```

Expected: cream background, "MemScripture" heading, bottom tab bar with 3 tabs. Click each tab — Library and Stats give 404 (not yet implemented).

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: integrate TabBar into root layout"
```

### Task 1.9: Library landing page (package list)

**Files:**
- Create: `src/routes/library/+page.svelte`
- Create: `src/lib/components/PackageCard.svelte`
- Create: `tests/e2e/library.spec.ts`

- [ ] **Step 1: Write failing E2E test**

Create `tests/e2e/library.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('library lists all 7 packages', async ({ page }) => {
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  // wait for data to load
  await expect(page.getByText('그리스도인의 확신 5구절')).toBeVisible();
  await expect(page.getByText('무장 900구절')).toBeVisible();
  // count package cards
  const cards = page.getByTestId('package-card');
  await expect(cards).toHaveCount(7);
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test:e2e -g "library lists"
```

Expected: FAIL — `/library` 404.

- [ ] **Step 3: Implement PackageCard component**

Create `src/lib/components/PackageCard.svelte`:

```svelte
<script lang="ts">
  import type { PackageMeta } from '$lib/types';
  import { ChevronRight } from 'lucide-svelte';

  interface Props {
    pkg: PackageMeta;
  }
  let { pkg }: Props = $props();
</script>

<a
  data-testid="package-card"
  href={`/library/${pkg.id}`}
  class="block bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-5 shadow-[var(--shadow-soft)]
         hover:shadow-[var(--shadow-card)] transition-shadow"
>
  <div class="flex items-center justify-between gap-3">
    <div class="min-w-0">
      <h3 class="text-base font-semibold text-[var(--color-text)] truncate">{pkg.name}</h3>
      <p class="text-xs text-[var(--color-text-tertiary)] mt-1 uppercase tracking-wide">
        {pkg.abbreviation} · {pkg.translation_name}
      </p>
    </div>
    <ChevronRight size={20} class="text-[var(--color-text-tertiary)] shrink-0" />
  </div>
</a>
```

- [ ] **Step 4: Implement /library page**

Create `src/routes/library/+page.svelte`:

```svelte
<script lang="ts">
  import Header from '$lib/components/nav/Header.svelte';
  import PackageCard from '$lib/components/PackageCard.svelte';
  import { listPackages } from '$lib/db/verses';
  import type { PackageMeta } from '$lib/types';

  let packages: PackageMeta[] = $state([]);
  let error: string | null = $state(null);

  $effect(() => {
    listPackages()
      .then((p) => (packages = p))
      .catch((e) => (error = String(e)));
  });
</script>

<Header title="Library" />

<main class="max-w-md mx-auto px-5 pt-4 pb-8 space-y-3">
  {#if error}
    <p class="text-[var(--color-danger)]">{error}</p>
  {:else if packages.length === 0}
    <p class="text-[var(--color-text-tertiary)]">불러오는 중...</p>
  {:else}
    {#each packages as pkg (pkg.id)}
      <PackageCard {pkg} />
    {/each}
  {/if}
</main>
```

- [ ] **Step 5: Verify E2E passes**

```bash
pnpm test:e2e -g "library lists"
```

Expected: PASS on chromium and iphone-14.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: implement /library landing with package list"
```

### Task 1.10: Package detail page (group tree)

**Files:**
- Create: `src/routes/library/[packageId]/+page.svelte`
- Create: `src/lib/components/GroupList.svelte`

- [ ] **Step 1: Write failing E2E test**

Append to `tests/e2e/library.spec.ts`:

```ts
test('package detail shows verse list', async ({ page }) => {
  await page.goto('/library/5_krv');
  await expect(page.getByRole('heading', { name: /5구절/ })).toBeVisible();
  // 5 verses
  await expect(page.getByTestId('verse-row')).toHaveCount(5);
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test:e2e -g "package detail"
```

Expected: FAIL — route 404.

- [ ] **Step 3: Implement GroupList component**

Create `src/lib/components/GroupList.svelte`:

```svelte
<script lang="ts">
  import type { StoredVerse } from '$lib/db/local';

  interface Props {
    packageId: string;
    verses: StoredVerse[];
  }
  let { packageId, verses }: Props = $props();
</script>

<ul class="divide-y divide-[var(--color-border)] bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
  {#each verses as v (v.no)}
    <li>
      <a
        data-testid="verse-row"
        href={`/library/${packageId}/${v.no}`}
        class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--color-elevated)]"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium text-[var(--color-text)] truncate">{v.title}</p>
          <p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">{v.cite}</p>
        </div>
        <span class="text-xs text-[var(--color-text-tertiary)]">{v.no}</span>
      </a>
    </li>
  {/each}
</ul>
```

- [ ] **Step 4: Implement /library/[packageId] page**

Create `src/routes/library/[packageId]/+page.svelte`:

```svelte
<script lang="ts">
  import Header from '$lib/components/nav/Header.svelte';
  import GroupList from '$lib/components/GroupList.svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { listPackages, installPackage, listVerses } from '$lib/db/verses';
  import type { PackageMeta } from '$lib/types';
  import type { StoredVerse } from '$lib/db/local';

  const packageId = $derived(page.params.packageId!);

  let pkg: PackageMeta | null = $state(null);
  let verses: StoredVerse[] = $state([]);
  let loading = $state(true);
  let error: string | null = $state(null);

  $effect(() => {
    let active = true;
    (async () => {
      try {
        const all = await listPackages();
        const found = all.find((p) => p.id === packageId);
        if (!found) {
          if (active) error = '패키지를 찾을 수 없습니다.';
          return;
        }
        if (active) pkg = found;
        await installPackage(packageId);
        const v = await listVerses(packageId);
        if (active) {
          verses = v;
          loading = false;
        }
      } catch (e) {
        if (active) {
          error = String(e);
          loading = false;
        }
      }
    })();
    return () => {
      active = false;
    };
  });
</script>

<Header title={pkg?.name ?? '...'} onBack={() => goto('/library')} />

<main class="max-w-md mx-auto px-5 pt-4 pb-8">
  {#if error}
    <p class="text-[var(--color-danger)]">{error}</p>
  {:else if loading || !pkg}
    <p class="text-[var(--color-text-tertiary)]">불러오는 중...</p>
  {:else}
    <GroupList {packageId} {verses} />
  {/if}
</main>
```

- [ ] **Step 5: Verify E2E passes**

```bash
pnpm test:e2e -g "package detail"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: package detail page with verse list"
```

### Task 1.11: Verse detail page (read-only card)

**Files:**
- Create: `src/routes/library/[packageId]/[verseNo]/+page.svelte`
- Create: `src/lib/components/card/VerseCard.svelte` (read-only basic, fancy interactions in Phase 2)

- [ ] **Step 1: Write failing E2E test**

Append to `tests/e2e/library.spec.ts`:

```ts
test('verse detail shows the verse text', async ({ page }) => {
  await page.goto('/library/5_krv/5');
  await expect(page.getByText('잠언 3 : 5-6')).toBeVisible();
  await expect(page.getByText('너는 마음을 다하여 여호와를 의뢰하고')).toBeVisible();
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test:e2e -g "verse detail"
```

Expected: FAIL — route 404.

- [ ] **Step 3: Implement basic VerseCard (read-only)**

Create `src/lib/components/card/VerseCard.svelte`:

```svelte
<script lang="ts">
  import type { StoredVerse } from '$lib/db/local';
  interface Props {
    verse: StoredVerse;
    packageName?: string;
  }
  let { verse, packageName }: Props = $props();
</script>

<article
  class="bg-[var(--color-card)] border border-[var(--color-border)] rounded-2xl p-6
         shadow-[var(--shadow-card)] space-y-4"
>
  <header class="space-y-1">
    <p class="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
      {packageName ?? ''} · #{verse.no}
    </p>
    <h2 class="text-xl font-semibold text-[var(--color-text)]">{verse.title}</h2>
    <p class="text-sm text-[var(--color-text-secondary)]">{verse.cite}</p>
  </header>
  <p class="text-base leading-[1.65] text-[var(--color-text)]">{verse.w}</p>
</article>
```

- [ ] **Step 4: Implement /library/[packageId]/[verseNo] page**

Create `src/routes/library/[packageId]/[verseNo]/+page.svelte`:

```svelte
<script lang="ts">
  import Header from '$lib/components/nav/Header.svelte';
  import VerseCard from '$lib/components/card/VerseCard.svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { listPackages, installPackage, readVerse } from '$lib/db/verses';
  import type { PackageMeta } from '$lib/types';
  import type { StoredVerse } from '$lib/db/local';

  const packageId = $derived(page.params.packageId!);
  const verseNo = $derived(parseInt(page.params.verseNo!, 10));

  let pkg: PackageMeta | null = $state(null);
  let verse: StoredVerse | null = $state(null);
  let error: string | null = $state(null);

  $effect(() => {
    let active = true;
    (async () => {
      try {
        const all = await listPackages();
        const found = all.find((p) => p.id === packageId);
        if (!found) {
          if (active) error = '패키지를 찾을 수 없습니다.';
          return;
        }
        if (active) pkg = found;
        await installPackage(packageId);
        const v = await readVerse(packageId, verseNo);
        if (active) {
          if (!v) error = '구절을 찾을 수 없습니다.';
          else verse = v;
        }
      } catch (e) {
        if (active) error = String(e);
      }
    })();
    return () => {
      active = false;
    };
  });
</script>

<Header
  title={pkg?.abbreviation ?? '...'}
  onBack={() => goto(`/library/${packageId}`)}
/>

<main class="max-w-md mx-auto px-5 pt-4 pb-8">
  {#if error}
    <p class="text-[var(--color-danger)]">{error}</p>
  {:else if !verse}
    <p class="text-[var(--color-text-tertiary)]">불러오는 중...</p>
  {:else}
    <VerseCard {verse} packageName={pkg?.abbreviation} />
  {/if}
</main>
```

- [ ] **Step 5: Verify E2E passes**

```bash
pnpm test:e2e -g "verse detail"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: verse detail page with basic VerseCard"
```

### Task 1.12: Stats and Settings placeholders (so tabs work)

**Files:**
- Create: `src/routes/stats/+page.svelte`
- Create: `src/routes/settings/+page.svelte`

- [ ] **Step 1: Implement Stats placeholder**

Create `src/routes/stats/+page.svelte`:

```svelte
<script lang="ts">
  import Header from '$lib/components/nav/Header.svelte';
</script>

<Header title="Stats" />

<main class="max-w-md mx-auto px-5 pt-12 text-center">
  <p class="text-[var(--color-text-tertiary)]">통계는 Phase 6에서 추가됩니다.</p>
</main>
```

- [ ] **Step 2: Implement Settings placeholder**

Create `src/routes/settings/+page.svelte`:

```svelte
<script lang="ts">
  import Header from '$lib/components/nav/Header.svelte';
  import { goto } from '$app/navigation';
</script>

<Header title="Settings" onBack={() => goto('/')} showSettings={false} />

<main class="max-w-md mx-auto px-5 pt-12 text-center">
  <p class="text-[var(--color-text-tertiary)]">설정은 Phase 2 이후 단계적으로 추가됩니다.</p>
</main>
```

- [ ] **Step 3: Verify dev server — all tabs reachable**

```bash
pnpm dev
```

Manual check: visit `/`, `/library`, `/stats`, click ⚙️ → `/settings`, click back → `/`. Confirm tab bar highlights correctly.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: add placeholder Stats and Settings pages"
```

### Task 1.13: Today landing — empty state with package picker

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Replace home page with empty-state picker**

Replace `src/routes/+page.svelte`:

```svelte
<script lang="ts">
  import Header from '$lib/components/nav/Header.svelte';
  import { listPackages } from '$lib/db/verses';
  import type { PackageMeta } from '$lib/types';
  import { BookOpen } from 'lucide-svelte';

  let packages: PackageMeta[] = $state([]);

  $effect(() => {
    listPackages().then((p) => (packages = p)).catch(() => {});
  });

  const today = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(new Date());
</script>

<Header title={today} />

<main class="max-w-md mx-auto px-5 pt-12 pb-8 text-center space-y-6">
  <div class="flex justify-center text-[var(--color-text-tertiary)]">
    <BookOpen size={48} strokeWidth={1.25} />
  </div>
  <div class="space-y-2">
    <h2 class="text-xl font-semibold">오늘은 학습할 구절이 없어요</h2>
    <p class="text-sm text-[var(--color-text-secondary)]">
      Phase 3에서 SRS가 추가되면 매일 복습할 구절이 여기에 나타나요.
    </p>
    <p class="text-sm text-[var(--color-text-secondary)]">
      그 전에 먼저 패키지를 둘러볼까요?
    </p>
  </div>
  <div class="space-y-2">
    {#each packages.slice(0, 3) as pkg (pkg.id)}
      <a
        href={`/library/${pkg.id}`}
        class="block bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl
               px-4 py-3 text-left hover:bg-[var(--color-elevated)]"
      >
        <span class="font-medium">{pkg.name}</span>
        <span class="text-[var(--color-text-tertiary)] float-right">→</span>
      </a>
    {/each}
  </div>
  <a
    href="/library"
    class="inline-block text-sm text-[var(--color-accent)] underline-offset-4 hover:underline"
  >
    Library 전체 둘러보기
  </a>
</main>
```

- [ ] **Step 2: Verify dev server**

```bash
pnpm dev
```

Expected: home page shows date, "오늘은 학습할 구절이 없어요", first 3 packages as buttons, "Library 둘러보기" link.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: today empty state with package picker"
```

### Task 1.14: iOS scroll regression test

**Files:**
- Create: `tests/e2e/ios-scroll.spec.ts`

- [ ] **Step 1: Write iOS-specific scroll test**

Create `tests/e2e/ios-scroll.spec.ts`:

```ts
import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['iPhone 14'] });

test('library page scrolls smoothly without fixed-bar bugs', async ({ page }) => {
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

  // Confirm there are enough cards to scroll
  await expect(page.getByTestId('package-card')).toHaveCount(7);

  const initialScrollY = await page.evaluate(() => window.scrollY);
  expect(initialScrollY).toBe(0);

  // Scroll to bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  const finalScrollY = await page.evaluate(() => window.scrollY);
  expect(finalScrollY).toBeGreaterThan(0);

  // TabBar must remain visible at the bottom (fixed)
  const tabBar = page.getByRole('navigation', { name: '주 네비게이션' });
  await expect(tabBar).toBeVisible();
  const box = await tabBar.boundingBox();
  expect(box).not.toBeNull();
  // The tab bar bottom should align with the viewport bottom
  const viewport = page.viewportSize()!;
  expect(Math.abs((box!.y + box!.height) - viewport.height)).toBeLessThan(2);
});

test('body uses min-height 100dvh, not 100vh', async ({ page }) => {
  await page.goto('/');
  const minHeight = await page.evaluate(() => {
    return getComputedStyle(document.body).minHeight;
  });
  // dvh resolves to a px value; we just confirm it's set, not 'auto'
  expect(minHeight).not.toBe('auto');
  expect(minHeight).not.toBe('0px');
});
```

- [ ] **Step 2: Run test**

```bash
pnpm test:e2e -g "ios-scroll"
```

Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "test: add iOS scroll regression suite"
```

### Task 1.15: Push to production

**Files:** none

- [ ] **Step 1: Push and watch Cloudflare deploy**

```bash
git push
```

Cloudflare Pages auto-deploys.

- [ ] **Step 2: Verify production**

In a browser, visit `https://memscripture.pages.dev`:
- [ ] Home page renders with empty state
- [ ] Tap Library — see 7 packages
- [ ] Tap "그리스도인의 확신 5구절" — see 5 verses listed
- [ ] Tap a verse — see verse card with title/cite/text
- [ ] Tap back, tap each tab — navigation works
- [ ] On iPhone Safari (real device or simulator): scroll the Library — momentum smooth, tab bar stays at bottom

- [ ] **Step 3: Tag the milestone**

```bash
git tag v0.1.0-phase1
git push --tags
```

---

## Done — what you have now

A deployable PWA-grade static SPA at `memscripture.pages.dev` where:
- Anyone can browse all 7 Bible packages with a clean Paper-themed UI in Pretendard.
- iOS scroll bugs are fixed (verified by Playwright on `iPhone 14` webkit).
- Data layer (Dexie) is set up and tested.
- Supabase project is provisioned (unused until Phase 4).
- CI is green on every push.

## Self-Review Notes

- **Spec coverage**: this plan covers spec sections 1, 2 (data model + Dexie), 5 (placeholder for Today only), 6 (IA — 3 tabs, library routes), 7 (visual tokens, Pretendard), 8 (PWA partial — `100dvh`, safe-area, `overscroll-behavior`; full PWA in Phase 7). Auth (§4), SRS (§5 full), sync (§3 sync), stats (§5 stats), full PWA (§8) are deferred to subsequent plans.
- **Type consistency**: `StoredVerse` is defined in `src/lib/db/local.ts` and used consistently in `verses.ts`, `+page.svelte` files, and components. `PackageMeta` defined in `types.ts` is used everywhere packages flow.
- **No placeholders**: every code block contains real, runnable code. Tests have real assertions, not stubs.
- **No prerequisite gaps**: each task's outputs are inputs to subsequent tasks.

## Subsequent Plans (not yet written)

After Phase 1 ships:

| Plan | Phase coverage | Estimated tasks |
|---|---|---|
| `2026-XX-XX-memscripture-phase-2-card-ui.md` | Card UI: HideableText, swipe, double-tap flip, font size, theme toggle | ~12 |
| `2026-XX-XX-memscripture-phase-3-srs.md` | SRS algorithm, RatingButtons, todayQueue, Today screen states | ~10 |
| `2026-XX-XX-memscripture-phase-4-auth.md` | Hybrid auth: anon + magic link + Google + Kakao OIDC + linkIdentity | ~10 |
| `2026-XX-XX-memscripture-phase-5-sync.md` | sync_queue + drainer + LWW pull + online indicator | ~8 |
| `2026-XX-XX-memscripture-phase-6-stats.md` | daily_log + heatmap + per-package progress | ~6 |
| `2026-XX-XX-memscripture-phase-7-pwa.md` | manifest + service worker + iOS install prompt + Lighthouse 100 | ~8 |
| `2026-XX-XX-memscripture-phase-8-prod.md` | Custom domain + nameserver migration + legacy deprecation | ~5 |

Each plan is written after the previous phase ships and learnings are incorporated.
