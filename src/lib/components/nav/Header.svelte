<script lang="ts">
	import { Settings, Eye, EyeOff, Search, ArrowLeft } from 'lucide-svelte';
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
	<!--
		Three layers rather than a flex row with justify-between: that centres the
		title in the space left over, so it drifted left whenever the right side
		carried more icons than the left — which is every screen. Absolute
		positioning centres it against the header itself, whatever flanks it.
	-->
	<div class="relative flex items-center h-14 max-w-2xl mx-auto px-5">
		<div class="flex items-center -ml-2">
			{#if onBack}
				<button
					type="button"
					onclick={onBack}
					aria-label="뒤로"
					class="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
				>
					<ArrowLeft size={24} strokeWidth={2.5} />
				</button>
			{/if}
			{#if showSearch}
				<!-- Left, beside back. Four icons on the right read as one dense
				     cluster, and search is the one that opens a screen of its own
				     rather than adjusting the one you are on. -->
				<a
					href="/search"
					aria-label="구절 검색"
					class="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
				>
					<Search size={20} strokeWidth={2} />
				</a>
			{/if}
		</div>

		<!-- Centred on the header, not between its neighbours. Truncates rather
		     than running under the icons, and ignores pointer events so the
		     overlap can never eat a tap. -->
		<h1
			class="pointer-events-none absolute left-1/2 max-w-[52%] -translate-x-1/2 truncate text-center text-lg font-semibold text-[var(--color-text)]"
		>
			{title}
		</h1>

		<div class="-mr-2 ml-auto flex items-center">
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
			{/if}
		</div>
	</div>
</header>
