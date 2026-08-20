<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Header from '$lib/components/nav/Header.svelte';
	import { BookPlus, Check } from 'lucide-svelte';
	import {
		duplicateIndexes,
		parseImportFragment,
		type ImportVerse
	} from '$lib/oyo/importLink';
	import { createOyoVerse, listOyoVerses, seedOyoPackageIfMissing } from '$lib/db/oyo';

	type Screen =
		| { kind: 'loading' }
		| { kind: 'review'; source: string | null; verses: ImportVerse[] }
		| { kind: 'saved'; count: number }
		| { kind: 'failed'; message: string };

	let screen = $state<Screen>({ kind: 'loading' });
	let chosen = $state<Set<number>>(new Set());
	let duplicates = $state<Set<number>>(new Set());
	let saving = $state(false);

	const FAILURES: Record<string, string> = {
		missing: '가져올 구절이 없습니다. 성경에서 구절을 선택한 뒤 다시 보내주세요.',
		malformed: '링크를 읽을 수 없습니다. 주소가 잘린 것 같으니 다시 보내주세요.',
		version: '보내는 앱이 더 새로운 형식을 씁니다. 암송 앱을 새로고침해주세요.',
		empty: '가져올 구절이 없습니다.',
		'too-many': '한 번에 보낼 수 있는 구절 수를 넘었습니다. 나눠서 보내주세요.'
	};

	/**
	 * Read once, on mount.
	 *
	 * The fragment is deliberately NOT cleared here. A reader who refreshes
	 * mid-review would otherwise land on "가져올 구절이 없습니다" holding a link
	 * they have not used yet. It is cleared after a successful save instead,
	 * where re-reading it really would be a second import.
	 */
	$effect(() => {
		void page.url;
		let cancelled = false;
		(async () => {
			const result = parseImportFragment(location.hash);
			if (!result.ok) {
				if (!cancelled) screen = { kind: 'failed', message: FAILURES[result.reason] };
				return;
			}
			const existing = await listOyoVerses().catch(() => []);
			if (cancelled) return;
			const { verses, source } = result.payload;
			const dupes = duplicateIndexes(
				verses,
				existing.map((v) => v.cite)
			);
			duplicates = dupes;
			// Everything the reader does not already have starts checked: they
			// chose these verses in the other app, so the import should not make
			// them choose again — only reconsider the ones already on file.
			chosen = new Set(verses.map((_, i) => i).filter((i) => !dupes.has(i)));
			screen = { kind: 'review', source, verses };
		})();
		return () => {
			cancelled = true;
		};
	});

	function toggle(i: number) {
		const next = new Set(chosen);
		if (!next.delete(i)) next.add(i);
		chosen = next;
	}

	function toggleAll(verses: ImportVerse[]) {
		chosen = chosen.size === verses.length ? new Set() : new Set(verses.map((_, i) => i));
	}

	async function save(verses: ImportVerse[]) {
		if (saving || chosen.size === 0) return;
		saving = true;
		try {
			// Seeded first: a reader who has never opened 내 구절 has no OYO
			// package row, and the verses would land in a package the library
			// cannot render.
			await seedOyoPackageIfMissing();
			// Sequential, not Promise.all: createOyoVerse reads max(no) + 1 to
			// pick the next number, so parallel writes would all read the same
			// max and collide on the primary key.
			const order = [...chosen].sort((a, b) => a - b);
			for (const i of order) {
				await createOyoVerse(verses[i]);
			}
			history.replaceState(history.state, '', location.pathname);
			screen = { kind: 'saved', count: order.length };
		} catch {
			screen = { kind: 'failed', message: '구절을 저장하지 못했습니다. 다시 시도해주세요.' };
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>구절 가져오기 · MemScripture</title></svelte:head>

<Header
	title="구절 가져오기"
	onBack={() => goto('/library/oyo')}
	showVerseToggle={false}
	showFontScale={false}
	showSearch={false}
/>

<main class="mx-auto max-w-2xl px-5 pb-8 pt-6">
	{#if screen.kind === 'loading'}
		<p class="text-[14px] text-[var(--color-text-secondary)]">불러오는 중…</p>
	{:else if screen.kind === 'failed'}
		<p class="text-[14px] leading-relaxed text-[var(--color-text-secondary)]">{screen.message}</p>
		<a
			href="/library/oyo"
			class="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[var(--color-on-accent)] transition-opacity hover:opacity-90"
		>
			내 구절로
		</a>
	{:else if screen.kind === 'saved'}
		<div class="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text)]">
			<Check size={18} strokeWidth={2.25} class="text-[var(--color-success)]" />
			{screen.count}개 구절을 내 구절에 담았습니다
		</div>
		<a
			href="/library/oyo"
			class="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[var(--color-on-accent)] transition-opacity hover:opacity-90"
		>
			내 구절 보기
		</a>
	{:else}
		{@const verses = screen.verses}
		<div class="flex items-baseline justify-between gap-3">
			<h2 class="text-[15px] font-semibold text-[var(--color-text)]">
				구절 {verses.length}개
			</h2>
			<button
				type="button"
				onclick={() => toggleAll(verses)}
				class="text-[12px] font-medium text-[var(--color-accent)] hover:underline"
			>
				{chosen.size === verses.length ? '전체 해제' : '전체 선택'}
			</button>
		</div>
		{#if screen.source}
			<p class="mt-1 text-[12px] text-[var(--color-text-tertiary)]">
				{screen.source}에서 보냈습니다
			</p>
		{/if}

		<ul class="mt-4 space-y-2">
			{#each verses as v, i (i)}
				<li>
					<!-- The whole row is the target. These are two-line blocks on a
					     phone and a 16px checkbox beside them would be the only part
					     that answered a tap. -->
					<button
						type="button"
						onclick={() => toggle(i)}
						aria-pressed={chosen.has(i)}
						class="flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors {chosen.has(
							i
						)
							? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
							: 'border-[var(--color-border)] bg-[var(--color-card)]'}"
					>
						<span
							class="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border {chosen.has(
								i
							)
								? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]'
								: 'border-[var(--color-border)]'}"
						>
							{#if chosen.has(i)}<Check size={12} strokeWidth={3} />{/if}
						</span>
						<span class="min-w-0 flex-1">
							<span class="flex flex-wrap items-center gap-1.5">
								<span class="text-[13px] font-semibold text-[var(--color-text)]">{v.cite}</span>
								{#if duplicates.has(i)}
									<span
										class="rounded-full bg-[var(--color-elevated)] px-2 py-0.5 text-[11px] text-[var(--color-text-tertiary)]"
									>
										이미 있음
									</span>
								{/if}
							</span>
							<span class="mt-1 block text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
								{v.w}
							</span>
						</span>
					</button>
				</li>
			{/each}
		</ul>

		<button
			type="button"
			disabled={saving || chosen.size === 0}
			onclick={() => save(verses)}
			class="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2.5 text-[14px] font-semibold text-[var(--color-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-40"
		>
			<BookPlus size={16} strokeWidth={2} />
			{saving ? '담는 중…' : `내 구절에 담기 (${chosen.size})`}
		</button>
	{/if}
</main>
