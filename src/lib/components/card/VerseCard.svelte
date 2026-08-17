<script lang="ts">
	import type { StoredVerse } from '$lib/db/local';
	import type { VerseTag } from '$lib/db/verses';
	import type { BookmarkColor } from '$lib/types';
	import CategoryTag from '$lib/components/filter/CategoryTag.svelte';
	import BookmarkControl from '$lib/components/srs/BookmarkControl.svelte';
	import VerseOverflowMenu from '$lib/components/oyo/VerseOverflowMenu.svelte';
	import DifficultyBadge from '$lib/components/card/DifficultyBadge.svelte';
	import MemorizeCheckPanel from './MemorizeCheckPanel.svelte';
	import type { DifficultyLevel } from '$lib/db/verseRatings';
	import { normalizeForGrading } from '$lib/memorize/grade';
	import { activeMarks, tokenizeVerse, type StoredMark } from '$lib/memorize/marks';
	import { Highlighter, Repeat, Square, Volume2 } from 'lucide-svelte';
	import { isTtsSupported, speak, speechSegments, type SpeakHandle } from '$lib/memorize/speak';
	import { getSpeakOptions } from '$lib/db/viewOptions';
	import { listChecks, recordCheck } from '$lib/db/checkHistory';
	import type { CheckRecord } from '$lib/db/local';
	import { goto } from '$app/navigation';

	interface Props {
		verse: StoredVerse;
		packageName?: string;
		packageId?: string;
		tags?: VerseTag[];
		bookmark?: BookmarkColor | null;
		onBookmarkPick?: (color: BookmarkColor) => void;
		onBookmarkClear?: () => void;
		/** When false, hide the verse body in read mode. */
		showBody?: boolean;
		/** When provided, render an overflow `…` menu with edit/delete actions. OYO only. */
		onEdit?: () => void;
		onDelete?: () => void;
		/** Multiplier applied to every text size inside the card via the --vfs
		 *  CSS variable. 1.0 is the default; the picker offers 0.9 / 1.0 / 1.15 / 1.3. */
		fontScale?: number;
		/** User self-assessment: difficulty of recalling the START of the verse. */
		startDifficulty?: DifficultyLevel | null;
		/** User self-assessment: difficulty of memorizing the WHOLE verse. */
		fullDifficulty?: DifficultyLevel | null;
		onPickStartDifficulty?: (level: DifficultyLevel | null) => void;
		onPickFullDifficulty?: (level: DifficultyLevel | null) => void;
		/** Multi-select (package list): true when this card is in the selected set. */
		selected?: boolean;
		/** Multi-select: dim this card because another card is selected and this one isn't. */
		dimmed?: boolean;
		/** When provided, tapping the card body toggles its selection — but only
		 *  while `selecting` is on. Outside selection mode the tap opens
		 *  memorize instead. */
		onToggleSelect?: () => void;
		/** Selection mode is active on the page hosting this card. */
		selecting?: boolean;
		/** Whether a body tap opens the check. Off for the verse detail page,
		 *  where the card fills the screen and any tap would trigger it. */
		tapToCheck?: boolean;
		/** Transient flash to draw the eye when the list is deep-linked to this verse. */
		highlighted?: boolean;
		/** When set, the package label becomes a link (e.g. back to the package list). */
		packageHref?: string;
		/** Words the reader has underlined on this verse. Passed in rather than
		 *  read per card: the page loads a package's marks in one query, the same
		 *  way it already does for ratings and bookmarks. */
		marks?: StoredMark[];
		/** Toggles one word's underline. Marking is offered only when this is
		 *  wired, so pages that cannot persist do not show the control. */
		onToggleMark?: (index: number, word: string) => void;
	}
	let {
		verse,
		packageName,
		packageId,
		tags = [],
		bookmark = null,
		onBookmarkPick,
		onBookmarkClear,
		showBody = true,
		onEdit,
		onDelete,
		fontScale = 1.0,
		startDifficulty = null,
		fullDifficulty = null,
		onPickStartDifficulty,
		onPickFullDifficulty,
		selected = false,
		dimmed = false,
		onToggleSelect,
		selecting = false,
		tapToCheck = true,
		highlighted = false,
		packageHref,
		marks = [],
		onToggleMark
	}: Props = $props();

	const bookmarksEnabled = $derived(Boolean(onBookmarkPick && onBookmarkClear));
	const editingEnabled = $derived(Boolean(onEdit) || Boolean(onDelete));
	const ratingsEnabled = $derived(
		Boolean(onPickStartDifficulty) && Boolean(onPickFullDifficulty)
	);
	const selectable = $derived(Boolean(onToggleSelect) && selecting);

	/**
	 * Two ways to work a verse, and each takes the whole card.
	 *
	 * `rehearse` is the curtain: the verse is there, covered, and dragged into
	 * view a word at a time. `check` hides it outright and asks for it back by
	 * typing. Running both at once made the curtain the answer key to the
	 * typing box sitting under it.
	 */
	let mode = $state<'read' | 'rehearse' | 'check'>('read');

	/** A check needs something to grade against and somewhere to put the result.
	 *  A body of pure punctuation (an OYO verse typed as "***") normalizes to ""
	 *  and would score a perfect match for nothing typed. */
	const checkable = $derived(ratingsEnabled && normalizeForGrading(verse.w).length > 0);

	// The card reacts to a tap when it can select, or when a tap starts a
	// check. Both only apply in read mode; while a mode is open, drags reveal
	// words rather than toggling anything.
	const interactive = $derived((selectable || (tapToCheck && checkable)) && mode === 'read');

	let revealedCount = $state(0);
	// Drag tuning — overwritten on first measure. `pxPerWord` is sized so one full
	// row-width of horizontal drag reveals exactly one row of words.
	let pxPerWord = 36;
	let wordsPerLine = 5;
	let paragraphEl: HTMLParagraphElement | undefined = $state();

	// Read mode renders tokens so the corpus's line breaks survive; the curtain
	// renders `words`. Both number words identically — tokenizeVerse guarantees
	// it — so one stored index means the same word in either.
	const tokens = $derived(tokenizeVerse(verse.w));
	const words = $derived(verse.w.split(/\s+/).filter(Boolean));
	const totalWords = $derived(words.length);
	/** Marks that still point at the word they were placed on. An OYO edit can
	 *  strand one, and an underline on the wrong word is worse than none. */
	const marked = $derived(activeMarks(words, marks));
	const markingEnabled = $derived(Boolean(onToggleMark));
	/** Marking borrows the tap, so it cannot share the drag. While it is on the
	 *  curtain is fully open — you cannot usefully mark a word you cannot read. */
	let marking = $state(false);

	// ─── 읽어주기 ─────────────────────────────────────────────────────────────
	/** Decided once; the control is absent rather than broken where synthesis
	 *  is missing. */
	const ttsSupported = isTtsSupported();
	let speaking = $state(false);
	/** Mirrors the stored setting so the button can show a loop is armed before
	 *  the reader presses it, rather than surprising them with one. */
	let repeatArmed = $state(false);
	let speech: SpeakHandle | null = null;

	$effect(() => {
		getSpeakOptions()
			.then((o) => (repeatArmed = o.speakRepeat))
			.catch(() => {});
	});

	async function toggleSpeak() {
		if (speaking) {
			speech?.stop();
			return;
		}
		const opts = await getSpeakOptions();
		repeatArmed = opts.speakRepeat;
		const segments = speechSegments(
			{ title: verse.title, cite: verse.cite, w: verse.w },
			{ includeTitle: opts.speakTitle }
		);
		speech = speak(segments, {
			rate: opts.speakRate,
			voice: opts.speakVoice || undefined,
			repeat: opts.speakRepeat,
			onEnd: () => {
				speaking = false;
				speech = null;
			}
		});
		speaking = speech !== null;
	}

	// Synthesis is global and outlives the component, so a card scrolled out of
	// a 900-row list must not leave a voice running behind it.
	$effect(() => () => speech?.stop());

	function toggleMarking() {
		marking = !marking;
		if (marking) revealAll();
	}
	const allRevealed = $derived(revealedCount >= totalWords);

	// Loaded when the panel opens rather than on every card render — a 900-row
	// list would otherwise issue 900 queries for history nobody is looking at.
	let checkHistory = $state<CheckRecord[]>([]);

	function enterRehearse() {
		mode = 'rehearse';
		marking = false;
		// Single-word verses have no curtain to drag — show immediately.
		revealedCount = totalWords <= 1 ? totalWords : 0;
	}
	function enterCheck() {
		speech?.stop();
		mode = 'check';
		if (packageId) {
			listChecks(packageId, verse.no)
				.then((rows) => (checkHistory = rows))
				.catch(() => {});
		}
		// The body stays hidden until the check produces a result.
		revealedCount = 0;
	}
	function resetReveal() {
		revealedCount = totalWords <= 1 ? totalWords : 0;
	}
	function revealAll() {
		revealedCount = totalWords;
	}
	function exitMode() {
		mode = 'read';
		marking = false;
		revealedCount = 0;
	}

	let dragBaseline = 0;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragActive = false;
	let dragHorizontal = false;

	function onPointerDown(e: PointerEvent) {
		if (mode !== 'rehearse' || marking || totalWords <= 1) return;
		dragBaseline = revealedCount;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		dragActive = true;
		dragHorizontal = false;
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragActive) return;
		const dx = e.clientX - dragStartX;
		const dy = e.clientY - dragStartY;
		// Direction lock: a vertical-leaning gesture releases so the page scrolls.
		if (!dragHorizontal) {
			if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
				dragActive = false;
				const t = e.currentTarget as Element;
				if (t.hasPointerCapture(e.pointerId)) t.releasePointerCapture(e.pointerId);
				return;
			}
			if (Math.abs(dx) < 4) return;
			dragHorizontal = true;
		}
		// Cap one drag to a single row's words either way, so a fast swipe can't
		// burn through a long verse — lift and drag again to continue.
		const raw = Math.round(dx / pxPerWord);
		const advance = raw > wordsPerLine ? wordsPerLine : raw < -wordsPerLine ? -wordsPerLine : raw;
		revealedCount = Math.max(0, Math.min(totalWords, dragBaseline + advance));
	}

	function onPointerUp(e: PointerEvent) {
		dragActive = false;
		const t = e.currentTarget as Element;
		if (t.hasPointerCapture(e.pointerId)) t.releasePointerCapture(e.pointerId);
	}

	// Recompute drag tuning on memorize entry + paragraph resizes. `wordsPerLine`
	// comes from rendered height / line-height; `pxPerWord` is then sized so a
	// full-row-width drag reveals one row's worth of words.
	$effect(() => {
		if (mode !== 'rehearse' || !paragraphEl || totalWords === 0) return;
		const el = paragraphEl;
		const measure = () => {
			const rect = el.getBoundingClientRect();
			const cs = getComputedStyle(el);
			const fontSize = parseFloat(cs.fontSize) || 19;
			const lhStr = cs.lineHeight;
			const lineHeight =
				lhStr === 'normal'
					? fontSize * 1.4
					: lhStr.endsWith('px')
						? parseFloat(lhStr)
						: fontSize * parseFloat(lhStr);
			const lineCount = Math.max(1, Math.round(rect.height / lineHeight));
			wordsPerLine = Math.max(1, Math.ceil(totalWords / lineCount));
			pxPerWord = rect.width / wordsPerLine;
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	});

	// The card hosts its own interactive controls (bookmark ribbon, difficulty
	// badges, tags) plus their full-screen popover backdrops. Selection-toggle
	// must ignore clicks that originate from any of those — match the elements
	// and ARIA roles they render so a tap on a control never flips selection.
	// The card itself also carries role="button" when selectable, so the match
	// is only treated as a control when it's something *other than* the card.
	function innerControlClicked(e: MouseEvent): boolean {
		const el = e.target as HTMLElement | null;
		const hit = el?.closest(
			'button, a, [role="button"], [role="menu"], [role="menuitem"], [role="menuitemradio"], [role="presentation"], [role="group"]'
		);
		return Boolean(hit && hit !== e.currentTarget);
	}

	function handleCardClick(e: MouseEvent) {
		if (innerControlClicked(e)) return;
		// Selection mode owns the tap while it is on, and the toolbar shows that
		// it is — so which action a tap performs is never a guess.
		if (selectable) {
			onToggleSelect!();
			return;
		}
		if (tapToCheck && checkable) enterCheck();
	}

	function handleCardKey(e: KeyboardEvent) {
		if (!selectable && !(tapToCheck && checkable)) return;
		// Only the card itself toggles on Enter/Space — let inner controls keep
		// their own keyboard behaviour.
		if (e.target !== e.currentTarget) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			// Same split as the pointer path, so keyboard and touch never
			// disagree about what activating the card does.
			if (selectable) onToggleSelect!();
			else if (tapToCheck && checkable) enterCheck();
		}
	}

	const cardClass = $derived(
		[
			'verse-card relative rounded-[14px] border bg-[var(--color-card)] px-5 py-5 transition-[opacity,border-color,box-shadow] duration-200',
			selected
				? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]'
				: 'border-[var(--color-border)]',
			dimmed ? 'opacity-50' : '',
			interactive ? 'cursor-pointer select-none' : '',
			highlighted ? 'verse-card--highlight' : ''
		]
			.filter(Boolean)
			.join(' ')
	);

	function tagHref(tag: VerseTag): string {
		if (!packageId) return '#';
		const params = new URLSearchParams();
		params.set('s', String(tag.seriesIndex));
		if (tag.level === 2) {
			params.set('g', String(tag.groupIndex));
		}
		return `/library/${packageId}?${params.toString()}`;
	}

	function onTagClick(tag: VerseTag) {
		goto(tagHref(tag));
	}
</script>

<!-- role/tabindex are applied dynamically (button only when selectable); the
     static a11y check can't see that, so the noninteractive-tabindex rule is a
     false positive here. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<article
	data-testid="verse-row"
	style="--vfs: {fontScale};"
	class={cardClass}
	role={interactive ? 'button' : undefined}
	tabindex={interactive ? 0 : undefined}
	aria-pressed={selectable ? selected : undefined}
	aria-label={selectable ? undefined : tapToCheck && checkable ? `${verse.title} 점검 시작` : undefined}
	onclick={interactive ? handleCardClick : undefined}
	onkeydown={interactive ? handleCardKey : undefined}
>
	<header class="space-y-1">
		<div class="flex items-start justify-between gap-3">
			<h2
				class="min-w-0 flex-1 text-[calc(19px*var(--vfs))] font-bold leading-tight text-[var(--color-text)]"
			>
				{verse.title}
			</h2>
			<div class="flex shrink-0 items-center gap-1">
				{#if mode === 'read'}
					{#if ratingsEnabled}
						<div class="flex items-center gap-1">
							<DifficultyBadge
								value={startDifficulty}
								label="첫 시작 난이도"
								onpick={onPickStartDifficulty!}
							/>
							<DifficultyBadge
								value={fullDifficulty}
								label="전체 암송 난이도"
								onpick={onPickFullDifficulty!}
							/>
						</div>
					{/if}
					{#if ttsSupported}
						<!-- Icon only: the header already carries two badges and two
						     mode buttons, and a fifth text pill does not fit a phone.
						     The repeat icon stands in for the speaker when looping is
						     armed, so a loop is never a surprise. -->
						<button
							type="button"
							onclick={toggleSpeak}
							aria-pressed={speaking}
							aria-label={speaking
								? '읽기 중지'
								: repeatArmed
									? `${verse.title} 반복해서 듣기`
									: `${verse.title} 듣기`}
							class="inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors {speaking
								? 'bg-[var(--color-accent)] text-white'
								: 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]'}"
						>
							{#if speaking}
								<Square size={11} strokeWidth={2.5} fill="currentColor" />
							{:else if repeatArmed}
								<Repeat size={15} strokeWidth={2} />
							{:else}
								<Volume2 size={15} strokeWidth={2} />
							{/if}
						</button>
					{/if}
					<button
						type="button"
						onclick={enterRehearse}
						class="rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)] transition-opacity hover:opacity-90"
					>
						암송
					</button>
					{#if checkable}
						<button
							type="button"
							onclick={enterCheck}
							class="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
						>
							점검
						</button>
					{/if}
					{#if editingEnabled}
						<VerseOverflowMenu {onEdit} {onDelete} />
					{/if}
				{:else}
					<button
						type="button"
						onclick={exitMode}
						aria-label={mode === 'check' ? '점검 종료' : '암송 종료'}
						class="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
					>
						✕
					</button>
				{/if}
			</div>
		</div>
		<p class="text-[calc(19px*var(--vfs))] text-[var(--color-text-secondary)]">
			{verse.cite}
		</p>
	</header>

	{#if mode !== 'rehearse'}
		<!--
			In read mode the body is always rendered so the card height is stable
			when toggling Eye; !showBody only makes the glyphs transparent, so line
			wrap and padding stay identical and screen readers still get the text.

			A check removes it outright rather than hiding it in place. Transparent
			text still occupies its lines, which left a blank gap the height of the
			verse between the reference and the panel — the reader saw the check
			pushed down the card by nothing. It comes back once a result is
			recorded or the reader gives up.
		-->
		{#if mode === 'read' || allRevealed}
			{@const bodyVisible = mode === 'check' || showBody}
			<p
				data-testid="verse-body"
				class="mt-1.5 whitespace-pre-line break-keep text-[calc(19px*var(--vfs))] leading-[1.6] {bodyVisible
					? 'text-[var(--color-text)]'
					: 'select-none text-transparent'}"
			>{#each tokens as t, i (i)}{#if t.wordIndex === null}{t.text}{:else}<span
							class:underlined={bodyVisible && marked.has(t.wordIndex)}>{t.text}</span
						>{/if}{/each}</p>
		{/if}
		{#if mode === 'check'}
			<MemorizeCheckPanel
				verse={verse.w}
				onPickStart={onPickStartDifficulty!}
				onPickFull={onPickFullDifficulty!}
				history={checkHistory}
				onGraded={(outcome) => {
					revealAll();
					if (!packageId) return;
					recordCheck(packageId, verse.no, outcome)
						.then(() => listChecks(packageId, verse.no))
						.then((rows) => (checkHistory = rows))
						.catch(() => {});
				}}
				onClose={exitMode}
				onRestart={() => (revealedCount = 0)}
			/>
		{/if}
	{:else}
		<!-- Rehearsal curtain: words start covered; drag left→right to reveal them. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<p
			bind:this={paragraphEl}
			class="memorize-body mt-1.5 break-keep text-[calc(19px*var(--vfs))] leading-[1.9] text-[var(--color-text)] select-none touch-pan-y"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
		>{#each words as word, i (i)}<span
				class="word"
				class:covered={i >= revealedCount}
				class:markable={marking}
				class:underlined={marked.has(i)}
				role={marking ? 'button' : undefined}
				tabindex={marking ? 0 : undefined}
				onclick={marking ? () => onToggleMark?.(i, word) : undefined}
				onkeydown={marking
					? (e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onToggleMark?.(i, word);
							}
						}
					: undefined}
			><span class="word-text">{word}</span></span>{' '}{/each}</p>
		<div class="mt-3 flex items-center justify-between gap-3 text-[11px]">
			<span class="text-[var(--color-text-tertiary)]">
				{#if marking}자주 틀리는 단어를 눌러 밑줄{:else if allRevealed}모두 열렸습니다{:else}← 좌→우로 드래그해서 단어 열기{/if}
			</span>
			<div class="flex items-center gap-3">
				{#if markingEnabled}
					<button
						type="button"
						onclick={toggleMarking}
						aria-pressed={marking}
						class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium transition-colors {marking
							? 'bg-[var(--color-accent)] text-white'
							: 'text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)]'}"
					>
						<Highlighter size={12} strokeWidth={2} />
						밑줄
					</button>
				{/if}
				<button
					type="button"
					onclick={resetReveal}
					class="font-medium text-[var(--color-text-secondary)] underline-offset-4 hover:underline"
				>
					처음부터
				</button>
				{#if !allRevealed}
					<button
						type="button"
						onclick={revealAll}
						class="font-medium text-[var(--color-text-secondary)] underline-offset-4 hover:underline"
					>
						전체 보기
					</button>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Bottom meta row: package name + tags. The verse number and bookmark ribbon
	     sit together at the bottom-right (ribbon immediately left of the number);
	     pr reserves space so the tags don't run under them. -->
	<div class="mt-3 flex flex-wrap items-center gap-2 {bookmarksEnabled ? 'pr-20' : 'pr-12'}">
		{#if packageName}
			{#if packageHref}
				<a
					href={packageHref}
					class="text-[calc(11px*var(--vfs))] font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)] underline-offset-4 transition-colors hover:text-[var(--color-accent)] hover:underline"
				>
					{packageName}
				</a>
			{:else}
				<span
					class="text-[calc(11px*var(--vfs))] font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]"
				>
					{packageName}
				</span>
			{/if}
		{/if}
		{#each tags as tag (tag.level + ':' + tag.seriesIndex + ':' + ('groupIndex' in tag ? tag.groupIndex : -1))}
			<CategoryTag label={tag.group.group_name} level={tag.level} onclick={() => onTagClick(tag)} />
		{/each}
	</div>

	<!-- Verse number: small, pinned to the bottom-right corner. -->
	<span
		class="absolute bottom-5 right-5 w-7 text-right text-[calc(13px*var(--vfs))] font-semibold tabular-nums text-[var(--color-text-tertiary)]"
	>
		{verse.no}
	</span>

	{#if bookmarksEnabled}
		<!-- Draping ribbon, immediately left of the verse number. Hangs ~8px past the
		     bottom edge; the article must be position:relative and not overflow-hidden. -->
		<div class="absolute -bottom-2 right-[3.25rem]">
			<BookmarkControl current={bookmark} onpick={onBookmarkPick!} onclear={onBookmarkClear!} />
		</div>
	{/if}
</article>

<style>
	.verse-card {
		box-shadow: var(--shadow-card);
	}
	/* One-shot flash when the list is deep-linked to this verse. Reverts to the
	   base card styling once the animation completes (no fill-forwards). */
	.verse-card--highlight {
		animation: verse-card-flash 1.7s ease-out;
	}
	@keyframes verse-card-flash {
		0% {
			background-color: var(--color-accent-soft);
			box-shadow: 0 0 0 3px var(--color-accent), var(--shadow-card);
		}
		60% {
			background-color: var(--color-card);
		}
		100% {
			box-shadow: var(--shadow-card);
		}
	}

	/* Reader-placed underline: "I keep missing this one". Sits below the
	   baseline rather than through the text so it never fights the Korean
	   glyphs, and uses the accent so it reads as a note rather than an error —
	   the red/green marking in the check panel already means something else. */
	.underlined {
		text-decoration: underline;
		text-decoration-color: var(--color-accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 5px;
	}

	/* While marking, every word is a target. The cue is the cursor and a hover
	   tint; outlining each word would redraw the whole verse. */
	.markable {
		cursor: pointer;
		border-radius: 4px;
	}
	.markable:hover {
		background-color: var(--color-accent-soft);
	}

	/* Memorize-mode curtain: each word sits under a striped cover until revealed. */
	.word {
		display: inline-block;
		position: relative;
		padding: 0 2px;
	}
	.word-text {
		transition: opacity 150ms ease;
	}
	.word.covered .word-text {
		opacity: 0;
	}
	.word::after {
		content: '';
		position: absolute;
		inset: 2px 0;
		border-radius: 4px;
		background: repeating-linear-gradient(
			135deg,
			var(--color-border),
			var(--color-border) 4px,
			var(--color-accent-soft) 4px,
			var(--color-accent-soft) 8px
		);
		opacity: 0;
		transition: opacity 150ms ease;
		pointer-events: none;
	}
	.word.covered::after {
		opacity: 1;
	}
</style>
