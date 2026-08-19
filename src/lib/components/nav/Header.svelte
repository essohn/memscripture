<script lang="ts">
	import { Settings, Eye, EyeOff, Search } from 'lucide-svelte';
	import { verseVisibility } from '$lib/state/verseVisibility.svelte';
	import { fontScale } from '$lib/state/fontScale.svelte';
	import FontScalePicker from '$lib/components/card/FontScalePicker.svelte';

	interface Props {
		title: string;
		showSettings?: boolean;
		onBack?: () => void;
		/** Screens with no verse text on them hide the reveal toggle. */
		showVerseToggle?: boolean;
		/** Off on the search screen itself, which would otherwise offer a way
		 *  back to where you already are. */
		showSearch?: boolean;
		/** Text-size picker. Shown wherever verses are, which is the same set of
		 *  screens as the reveal toggle. */
		showFontScale?: boolean;
	}
	let {
		title,
		showSettings = true,
		onBack,
		showVerseToggle = true,
		showSearch = true,
		showFontScale = true
	}: Props = $props();

	// Header is on every screen, so this is also where the stored preference
	// gets read — once, guarded inside the store.
	$effect(() => {
		if (showVerseToggle) verseVisibility.load();
		if (showFontScale) fontScale.load();
	});
</script>

<header
	class="sticky top-0 bg-[var(--color-canvas)]/90 backdrop-blur z-40 border-b border-[var(--color-border)]"
	style="padding-top: env(safe-area-inset-top);"
>
	<div class="flex items-center justify-between h-14 max-w-2xl mx-auto px-5">
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
		<div class="-mr-2 flex items-center">
			{#if showSearch}
				<a
					href="/search"
					aria-label="구절 검색"
					class="p-2 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
				>
					<Search size={20} strokeWidth={1.75} />
				</a>
			{/if}
			{#if showFontScale}
				<FontScalePicker value={fontScale.value} onpick={(s) => fontScale.pick(s)} />
			{/if}
			{#if showVerseToggle}
				<button
					type="button"
					onclick={() => verseVisibility.toggle()}
					aria-pressed={verseVisibility.shown}
					aria-label={verseVisibility.shown ? '성경 구절 가리기' : '성경 구절 보이기'}
					class="p-2 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
				>
					{#if verseVisibility.shown}
						<Eye size={20} strokeWidth={1.75} />
					{:else}
						<EyeOff size={20} strokeWidth={1.75} />
					{/if}
				</button>
			{/if}
			{#if showSettings}
				<a href="/settings" aria-label="설정" class="p-2 text-[var(--color-text-secondary)]">
					<Settings size={20} strokeWidth={1.75} />
				</a>
			{:else if !showVerseToggle}
				<span class="w-6"></span>
			{/if}
		</div>
	</div>
</header>
