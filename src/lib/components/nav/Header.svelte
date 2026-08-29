<script lang="ts">
	import { Settings, Eye, EyeOff, Search, ArrowLeft, Info } from 'lucide-svelte';
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
		/** When set, an (i) beside the title opens this text. For a title that
		 *  carries a term the reader has no way to expand on their own. */
		titleInfo?: string;
	}
	let {
		title,
		showSettings = true,
		onBack,
		showVerseToggle = true,
		showSearch = true,
		showFontScale = true,
		titleInfo
	}: Props = $props();

	// Header is on every screen, so this is also where the stored preference
	// gets read — once, guarded inside the store.
	$effect(() => {
		if (showVerseToggle) verseVisibility.load();
		if (showFontScale) fontScale.load();
	});

	let infoOpen = $state(false);

	const verseToggleLabel = $derived(
		verseVisibility.shown ? '성경 구절 가리기' : '성경 구절 보이기'
	);

	/**
	 * Matched on the physical key rather than the character it produces: with
	 * the Hangul IME on — which, for these readers, is most of the time — the
	 * same key reports 'ㅎ', and a shortcut that dies whenever the keyboard is
	 * in 한글 is dead exactly where it is wanted.
	 */
	function isVerseToggleKey(e: KeyboardEvent): boolean {
		if (e.code !== 'KeyH') return false;
		// ⌘H hides the window, Ctrl+H is history. Combinations belong to whoever
		// owns them already.
		if (e.metaKey || e.ctrlKey || e.altKey) return false;
		// A half-composed syllable delivers keydowns of its own; none is a
		// shortcut.
		return !e.isComposing;
	}

	/** Whether the keypress belongs to something the reader is typing into —
	 *  search, the OYO table, the 점검 answer box. */
	function isTyping(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		// The attribute rather than `isContentEditable`: that property is
		// browser-only and undefined under jsdom, so the guard would pass its
		// test and still let a keystroke through in a real editable.
		return (
			target.closest(
				'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
			) !== null
		);
	}

	/**
	 * Whether a sheet or dialog is currently up. Every modal in the app carries
	 * aria-modal while open — 점검 and 암송 on the card, the check history, the
	 * OYO editor, the confirm dialog — so the DOM already holds this state and
	 * the header needs no prop to learn it.
	 *
	 * A modal owns the keyboard while it is open, and the list behind one is
	 * blurred: toggling there is a change the reader cannot watch happen, and
	 * only meets when they close the panel.
	 */
	function modalIsOpen(): boolean {
		return document.querySelector('[aria-modal="true"]') !== null;
	}

	function onWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape') infoOpen = false;
		// The shortcut is the button: it exists on exactly the screens the button
		// does, and nowhere else.
		if (showVerseToggle && isVerseToggleKey(e) && !isTyping(e.target) && !modalIsOpen()) {
			verseVisibility.toggle();
		}
	}
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
		     overlap can never eat a tap — except the (i), which re-enables them
		     for itself alone. -->
		<div
			class="pointer-events-none absolute left-1/2 flex max-w-[52%] -translate-x-1/2 items-center gap-1"
		>
			<h1 class="truncate text-center text-lg font-semibold text-[var(--color-text)]">
				{title}
			</h1>
			{#if titleInfo}
				<button
					type="button"
					onclick={() => (infoOpen = !infoOpen)}
					aria-expanded={infoOpen}
					aria-label="{title} 설명"
					class="pointer-events-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
				>
					<Info size={16} strokeWidth={2} />
				</button>
			{/if}
		</div>

		<div class="-mr-2 ml-auto flex items-center">
			{#if showFontScale}
				<FontScalePicker value={fontScale.value} onpick={(s) => fontScale.pick(s)} />
			{/if}
			{#if showVerseToggle}
				<button
					type="button"
					onclick={() => verseVisibility.toggle()}
					aria-pressed={verseVisibility.shown}
					aria-label={verseToggleLabel}
					title="{verseToggleLabel} (H)"
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

	{#if titleInfo && infoOpen}
		<!-- A tap-toggled panel rather than a hover tooltip: this text exists for
		     someone meeting the term for the first time, and on a phone there is
		     no hover to meet it with. -->
		<div class="relative z-40 mx-auto max-w-2xl px-5 pb-3" role="note">
			<p
				class="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 text-[13px] leading-relaxed text-[var(--color-text-secondary)] shadow-[var(--shadow-popover)]"
			>
				{titleInfo}
			</p>
		</div>
	{/if}
</header>

{#if titleInfo && infoOpen}
	<!-- Outside the header on purpose. `backdrop-blur` up there is a filter, and
	     a filtered element becomes the containing block for its fixed-position
	     descendants — so a `fixed inset-0` backdrop declared inside covered the
	     header strip and nothing else, and a tap on the page did not dismiss.
	     Sat below the header's z-40 so the panel stays clickable above it. -->
	<button
		type="button"
		class="fixed inset-0 z-30 cursor-default"
		aria-label="설명 닫기"
		onclick={() => (infoOpen = false)}
	></button>
{/if}

<svelte:window onkeydown={onWindowKey} />
