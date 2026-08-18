<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import { goto } from '$app/navigation';
	import { Search, X } from 'lucide-svelte';
	import { listPackages, listVerses } from '$lib/db/verses';
	import { searchVerses, type SearchableVerse, type SearchHit } from '$lib/search/verseSearch';

	let query = $state('');
	let corpus = $state<SearchableVerse[]>([]);
	let loaded = $state(false);
	let inputEl = $state<HTMLInputElement | undefined>();

	// Every installed package, read once. 1495 verses is small enough to hold
	// and scan directly, so the search stays instant and needs no index.
	$effect(() => {
		let active = true;
		(async () => {
			const packages = await listPackages();
			const all: SearchableVerse[] = [];
			for (const pkg of packages) {
				const verses = await listVerses(pkg.id).catch(() => []);
				for (const v of verses) {
					all.push({
						packageId: pkg.id,
						packageName: pkg.abbreviation || pkg.name,
						no: v.no,
						title: v.title,
						cite: v.cite,
						w: v.w
					});
				}
			}
			if (!active) return;
			corpus = all;
			loaded = true;
		})().catch(() => (loaded = true));
		return () => {
			active = false;
		};
	});

	/**
	 * Focus on creation, via an action rather than an effect.
	 *
	 * The box exists from the first render, so `bind:this` lands in the same
	 * flush as the effect's first run and the effect never sees it change — it
	 * simply never fired. An action runs when the element is created, which is
	 * exactly the moment meant.
	 */
	function focusOnMount(node: HTMLInputElement) {
		// Deferred by a tick on purpose. Svelte builds the subtree before
		// inserting it, so the action can run while the node is still detached —
		// and focus() on a detached node silently does nothing. A timeout rather
		// than requestAnimationFrame, which does not fire in a background tab and
		// so cannot be verified.
		setTimeout(() => node.focus(), 0);
	}

	const hits = $derived(searchVerses(corpus, query));

	/** The text the match was found in — not always the body. */
	function matchedText(hit: SearchHit): string {
		if (hit.field === 'cite') return hit.verse.cite;
		if (hit.field === 'title') return hit.verse.title;
		return hit.verse.w;
	}

	/**
	 * The matched text split around the match, windowed so a long verse shows
	 * the part that matched rather than its opening line.
	 *
	 * The span comes from the search rather than from the query's length: the
	 * match is made with spacing stripped, so three typed characters can cover
	 * four on screen — measuring here instead would underline the wrong words.
	 */
	function excerpt(hit: SearchHit): { before: string; hit: string; after: string } {
		const text = matchedText(hit);
		const end = hit.at + hit.length;
		const from = Math.max(0, hit.at - 24);
		return {
			before: (from > 0 ? '…' : '') + text.slice(from, hit.at),
			hit: text.slice(hit.at, end),
			after: text.slice(end, end + 44) + (end + 44 < text.length ? '…' : '')
		};
	}

	const FIELD_LABEL = { cite: '장절', title: '제목', body: '' } as const;

	function open(hit: SearchHit) {
		goto(`/library/${hit.verse.packageId}?v=${hit.verse.no}`);
	}
</script>

<svelte:head><title>구절 검색 | MemScripture</title></svelte:head>

<Header title="구절 검색" onBack={() => history.back()} showVerseToggle={false} showSearch={false} />

<main class="mx-auto max-w-2xl px-5 pt-4">
	<div class="relative">
		<Search
			size={16}
			strokeWidth={2}
			class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
		/>
		<input
			bind:this={inputEl}
			use:focusOnMount
			bind:value={query}
			type="search"
			enterkeyhint="search"
			aria-label="구절 검색"
			placeholder="본문 · 장절 · 제목 · 초성(ㅎㄴㄴ)"
			class="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-card)] py-2.5 pl-9 pr-9 text-[15px] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)]"
		/>
		{#if query}
			<button
				type="button"
				onclick={() => {
					query = '';
					inputEl?.focus();
				}}
				aria-label="검색어 지우기"
				class="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-text-tertiary)] hover:bg-[var(--color-elevated)]"
			>
				<X size={14} strokeWidth={2} />
			</button>
		{/if}
	</div>

	{#if query.trim().length === 0}
		<p class="mt-8 text-center text-[13px] leading-[1.8] text-[var(--color-text-tertiary)]">
			기억나는 한 구절을 입력해보세요.<br />
			띄어쓰기가 달라도 찾습니다<br />
			초성으로도 찾습니다 — <span class="text-[var(--color-text-secondary)]">ㅎㄴㄴ</span><br />
			장절로도 찾습니다 — <span class="text-[var(--color-text-secondary)]">요한복음 3</span>
		</p>
	{:else if !loaded}
		<p class="mt-8 text-center text-[13px] text-[var(--color-text-tertiary)]">구절을 읽는 중…</p>
	{:else if hits.length === 0}
		<p class="mt-8 text-center text-[13px] text-[var(--color-text-tertiary)]">
			찾는 구절이 없습니다.
		</p>
	{:else}
		<p class="mt-4 text-[12px] text-[var(--color-text-tertiary)]">
			{hits.length}개{hits.length >= 100 ? ' 이상' : ''}
		</p>
		<ul class="mt-2 space-y-2 pb-6">
			{#each hits as hit (hit.verse.packageId + ':' + hit.verse.no)}
				{@const ex = excerpt(hit)}
				<li>
					<button
						type="button"
						onclick={() => open(hit)}
						class="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-elevated)]"
					>
						<div class="flex items-baseline justify-between gap-2">
							<span class="text-[13px] font-semibold text-[var(--color-text)]">
								{#if hit.field === 'cite'}
									{ex.before}<mark
										class="rounded bg-[var(--color-accent-soft)] px-0.5 text-[var(--color-text)]"
										>{ex.hit}</mark
									>{ex.after}
								{:else}
									{hit.verse.cite}
								{/if}
							</span>
							<span class="shrink-0 text-[11px] text-[var(--color-text-tertiary)]">
								{#if FIELD_LABEL[hit.field]}{FIELD_LABEL[hit.field]}{' · '}{/if}{hit.verse
									.packageName} · {hit.verse.no}
							</span>
						</div>
						{#if hit.field === 'title'}
							<p class="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">
								{ex.before}<mark
									class="rounded bg-[var(--color-accent-soft)] px-0.5 text-[var(--color-text)]"
									>{ex.hit}</mark
								>{ex.after}
							</p>
						{/if}
						<p class="mt-1 text-[14px] leading-[1.6] text-[var(--color-text-secondary)]">
							{#if hit.field === 'body'}
								{ex.before}<mark
									class="rounded bg-[var(--color-accent-soft)] px-0.5 font-semibold text-[var(--color-text)]"
									>{ex.hit}</mark
								>{ex.after}
							{:else}
								{hit.verse.w.slice(0, 60)}{hit.verse.w.length > 60 ? '…' : ''}
							{/if}
						</p>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</main>
