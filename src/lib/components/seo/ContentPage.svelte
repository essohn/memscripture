<script lang="ts">
	import { SITE_NAME } from '$lib/seo/site';

	let { children } = $props();
</script>

<!-- Shared shell for the search-landing pages. These render server-side into
     real HTML, so the header and footer here are part of what a crawler reads:
     an internal link from every content page back to the app, and to the other
     content page, without depending on the app's tab bar. -->
<div class="min-h-dvh bg-[var(--color-canvas)]">
	<header class="border-b border-[var(--color-border)]">
		<nav
			class="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4 sm:px-6"
			aria-label="주요"
		>
			<a href="/" class="flex items-center gap-2">
				<img src="/icon-192.png" alt="" width="28" height="28" class="rounded-md" />
				<span class="text-[16px] font-bold text-[var(--color-text)]">{SITE_NAME}</span>
			</a>
			<div class="flex items-center gap-4 text-[14px]">
				<!-- Held back on phones. The brand, the two links and the button need
				     414px laid out in a row, and the common phone is 360–390 — so on
				     a phone this row overflowed the screen. The footer carries both
				     links at every width, so nothing is lost. -->
				<a
					href="/guide"
					class="hidden font-medium text-[var(--color-text-secondary)] underline-offset-4 hover:text-[var(--color-text)] hover:underline sm:inline"
				>
					암송 방법
				</a>
				<a
					href="/about"
					class="hidden font-medium text-[var(--color-text-secondary)] underline-offset-4 hover:text-[var(--color-text)] hover:underline sm:inline"
				>
					소개
				</a>
				<a
					href="/"
					class="rounded-full bg-[var(--color-accent)] px-4 py-1.5 font-semibold text-white transition-opacity hover:opacity-90"
				>
					시작하기
				</a>
			</div>
		</nav>
	</header>

	<main class="mx-auto max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
		{@render children()}
	</main>

	<footer class="border-t border-[var(--color-border)]">
		<div
			class="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-[13px] text-[var(--color-text-tertiary)] sm:px-6"
		>
			<p>{SITE_NAME} — 성경 암송 앱</p>
			<div class="flex items-center gap-4">
				<a href="/guide" class="underline-offset-4 hover:underline">암송 방법</a>
				<a href="/about" class="underline-offset-4 hover:underline">소개</a>
				<a href="/" class="underline-offset-4 hover:underline">앱 열기</a>
			</div>
		</div>
	</footer>
</div>
