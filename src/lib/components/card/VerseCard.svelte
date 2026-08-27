<script lang="ts">
	import type { StoredVerse } from '$lib/db/local';
	import type { VerseTag } from '$lib/db/verses';
	import type { BookmarkColor } from '$lib/types';
	import CategoryTag from '$lib/components/filter/CategoryTag.svelte';
	import BookmarkControl from '$lib/components/srs/BookmarkControl.svelte';
	import VerseOverflowMenu from '$lib/components/oyo/VerseOverflowMenu.svelte';
	import DifficultyBadge from '$lib/components/card/DifficultyBadge.svelte';
	import MemorizeCheckPanel from './MemorizeCheckPanel.svelte';
	import CheckHistorySheet from './CheckHistorySheet.svelte';
	import { relativeTimeKo } from '$lib/utils/relativeTime';
	import type { DifficultyLevel } from '$lib/db/verseRatings';
	import { normalizeForGrading } from '$lib/memorize/grade';
	import { activeMarks, tokenizeVerse, type StoredMark } from '$lib/memorize/marks';
	import { suggestedMarks } from '$lib/memorize/missStats';
	import { BookOpen, Highlighter, PartyPopper, Square, Volume2 } from 'lucide-svelte';
	import { readerHref } from '$lib/bible/reference';
	import { createPlayer, isTtsSupported, speechSegments, type PlayerHandle } from '$lib/memorize/speak';
	import VersePlayer from './VersePlayer.svelte';
	import { getSpeakOptions, setSpeakOption, type SpeakOptionsStored } from '$lib/db/viewOptions';
	import { listChecks, recordCheck } from '$lib/db/checkHistory';
	import type { CheckRecord } from '$lib/db/local';
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { citeShownSeparately, displayTitle } from '$lib/utils/verseTitle';
	import { cardActivity } from '$lib/state/cardActivity';
	import { fitModalCard } from '$lib/utils/modalCard';

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
		/** This verse has been recited flawlessly at least once. */
		perfect?: boolean;
		/** When this verse was last 점검'd, or null if never. Passed in rather
		 *  than read per card, the same way `marks` and `perfect` are: a
		 *  900-verse list must not issue 900 queries for a line most cards do
		 *  not even show. Quiz rounds are excluded upstream — see
		 *  listLastCheckedAt. */
		lastCheckedAt?: number | null;
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
		onToggleMark,
		perfect = false,
		lastCheckedAt = null
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

	/** Null for a citation the reader app cannot place — a hand-written OYO one,
	 *  say — in which case no link is offered at all. */
	const reader = $derived(readerHref(verse.cite));
	/** The citation stands in when a user's verse was left unnamed. */
	const heading = $derived(displayTitle(verse));

	/**
	 * Hold off an unattended sync while this card is being worked in.
	 *
	 * Applying a snapshot rewrites every table, so a pull landing mid-점검 would
	 * change the verse under the reader. Cleanup covers leaving the mode and
	 * the card unmounting alike — a card scrolled out of a virtualised list
	 * must not leave the counter stuck above zero.
	 */
	$effect(() => {
		if (mode === 'read') return;
		cardActivity.enter();
		return () => cardActivity.leave();
	});
	const citeOnOwnLine = $derived(citeShownSeparately(verse));

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
	/**
	 * The stored options, held in memory.
	 *
	 * Loaded ahead of time on purpose. iOS Safari only honours
	 * speechSynthesis.speak() when it is reached synchronously from the tap
	 * that triggered it, and reading these from IndexedDB first put an await in
	 * that path — which ended the gesture and made iOS refuse to speak, with no
	 * error and no sound. Desktop Chrome has no such rule, which is why this
	 * only ever failed on the phone.
	 */
	let speakOpts = $state<SpeakOptionsStored>({
		speakTitle: false,
		speakRate: 0.9,
		speakRepeat: false,
		speakVoice: '',
		speakGender: 'auto'
	});
	let player: PlayerHandle | null = null;
	/** Shown while the player bar is open, which outlives a pause — closing it
	 *  is a separate act from pausing, the same as any player. */
	let playerOpen = $state(false);
	let progress = $state({ fraction: 0, elapsedMs: 0, totalMs: 0 });

	function refreshSpeakOpts() {
		getSpeakOptions()
			.then((o) => (speakOpts = o))
			.catch(() => {});
	}
	$effect(refreshSpeakOpts);

	/** Synchronous from tap to speak(). Do not make this async: iOS only honours
	 *  synthesis reached straight from the gesture. */
	function startSpeaking(seekTo = 0) {
		const segments = speechSegments(
			{ title: verse.title, cite: verse.cite, w: verse.w },
			{ includeTitle: speakOpts.speakTitle }
		);
		player = createPlayer(segments, {
			rate: speakOpts.speakRate,
			voice: speakOpts.speakVoice || undefined,
			gender: speakOpts.speakGender === 'auto' ? undefined : speakOpts.speakGender,
			repeat: speakOpts.speakRepeat,
			onProgress: (p) => (progress = p),
			onEnd: () => {
				speaking = false;
				player = null;
			}
		});
		speaking = player !== null;
		playerOpen = speaking;
		if (seekTo > 0) player?.seek(seekTo);
		// Pick up a settings change for next time, now that the gesture is spent.
		refreshSpeakOpts();
	}

	function toggleSpeak() {
		if (speaking) {
			player?.pause();
			speaking = false;
			return;
		}
		// Recorded on the way in, not on the way out: a reader who starts the
		// audio, hears the opening and stops it has still heard it.
		heardAloud = true;
		if (player) {
			player.resume();
			speaking = true;
			return;
		}
		startSpeaking();
	}

	function closePlayer() {
		player?.stop();
		player = null;
		speaking = false;
		playerOpen = false;
		progress = { fraction: 0, elapsedMs: 0, totalMs: 0 };
	}

	function toggleSpeakRepeat() {
		const next = !speakOpts.speakRepeat;
		speakOpts = { ...speakOpts, speakRepeat: next };
		setSpeakOption('speakRepeat', next).catch(() => {});
		// The running utterance was created with the old setting, so restart to
		// apply it rather than having the toggle take effect a verse later.
		if (speaking) {
			const at = progress.fraction;
			player?.stop();
			player = null;
			startSpeaking(at);
		}
	}

	// Synthesis is global and outlives the component, so a card scrolled out of
	// a 900-row list must not leave a voice running behind it.
	$effect(() => () => player?.stop());

	function toggleMarking() {
		marking = !marking;
		if (!marking) return;
		revealAll();
		loadCheckHistory();
	}
	const allRevealed = $derived(revealedCount >= totalWords);

	let checkHistory = $state<CheckRecord[]>([]);

	/** Loads this verse's checks. Lazy for the reason 점검 has always been: a
	 *  900-row list must not issue 900 queries for history nobody opened. Both
	 *  점검 and 밑줄 come through here and share the one piece of state, so a
	 *  reader who checks a verse and then opens 밑줄 sees the check they just
	 *  finished. */
	function loadCheckHistory(): Promise<void> {
		if (!packageId) return Promise.resolve();
		return listChecks(packageId, verse.no)
			.then((rows) => {
				checkHistory = rows;
			})
			.catch(() => {});
	}

	/** 점검 only. A quiz round is the same act without the rating, so the
	 *  underline suggestions count it — but anything that shows a difficulty
	 *  has nothing to show for one. */
	const checkOnlyHistory = $derived(checkHistory.filter((r) => !r.source));

	let historyOpen = $state(false);

	/**
	 * Loads before it opens, and declines to open on nothing.
	 *
	 * The line is drawn from `lastCheckedAt`, which the page read once; a sync
	 * that arrived since could have taken the last 점검 away. Opening first and
	 * filling in after would flash an empty sheet in that case, so the read
	 * settles first and an empty result simply does nothing.
	 */
	async function openHistory() {
		await loadCheckHistory();
		if (checkOnlyHistory.length > 0) historyOpen = true;
	}

	/**
	 * When this card last saw a check, preferring one finished in this session.
	 *
	 * Overrides the prop for the reason `lastCheckPerfect` overrides `perfect`:
	 * the prop was read when the page loaded, so a card the reader just checked
	 * would still say 3일 전 about the check before it.
	 */
	let lastCheckedLocal = $state<number | null>(null);
	const shownLastCheckedAt = $derived(lastCheckedLocal ?? lastCheckedAt);

	/** Words this reader keeps missing, proposed as underlines. Derived rather
	 *  than stored: a saved suggestion would outlive the history it came from
	 *  and point at a place already fixed. Empty outside marking mode, where a
	 *  dot would be a remark with nothing to tap. */
	const suggested = $derived(
		marking ? suggestedMarks(checkHistory, totalWords) : new Set<number>()
	);
	/** A proposal still waiting to be taken. The hint line speaks off this
	 *  rather than off `suggested` itself: once the reader has underlined every
	 *  word that was dotted, nothing on screen is dotted any more, and a line
	 *  still telling them to press the dots describes a screen that is gone. */
	const hasOpenSuggestion = $derived([...suggested].some((i) => !marked.has(i)));
	/** Set by a perfect check in this session, so the badge appears with the
	 *  confetti rather than only after the page is next loaded. */
	/**
	 * How the check that just happened went, or null when none has this
	 * session.
	 *
	 * Overrides the `perfect` prop rather than adding to it: that prop was
	 * loaded when the page did, so after a slip it still says the verse was
	 * flawless and would keep the popper lit on a verse the reader just got
	 * wrong.
	 */
	let lastCheckPerfect = $state<boolean | null>(null);

	/** The verse has been played aloud since this card was last idle. Hearing
	 *  it and then reciting it tests recognition, so the grading treats it the
	 *  way it treats a hint. */
	let heardAloud = $state(false);

	function enterRehearse() {
		mode = 'rehearse';
		marking = false;
		// Single-word verses have no curtain to drag — show immediately.
		revealedCount = totalWords <= 1 ? totalWords : 0;
	}
	function enterCheck() {
		closePlayer();
		// Measured before the mode flips, while the card is still the size the
		// list gave it — a frame later it is a modal and its own rect is the
		// answer to a different question.
		lift();
		mode = 'check';
		loadCheckHistory();
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
		heardAloud = false;
		anchor = null;
		rowHeight = 0;
		maxHeight = null;
	}

	/**
	 * A check used to grow the card in place, which pushed everything below it
	 * down and pulled it back up on close — so the button someone was reaching
	 * for moved out from under their finger at the worst moment. The card now
	 * lifts out of the list to be checked and settles back afterwards, and the
	 * list itself never changes height.
	 */
	let cardEl: HTMLElement | undefined = $state();
	/** Where the card sat in the list: its left, width, and the top it keeps
	 *  whenever the panel is short enough to allow it. */
	let anchor = $state<{ left: number; top: number; width: number } | null>(null);
	let appliedTop = $state(0);
	let maxHeight = $state<number | null>(null);
	/** The space the card occupied, held open while it is lifted. */
	let rowHeight = $state(0);

	/** The fixed tab bar at the foot of every screen; a lifted card must not
	 *  end up underneath it. */
	const TAB_BAR_INSET = 64;

	function lift() {
		if (!cardEl) return;
		const r = cardEl.getBoundingClientRect();
		rowHeight = r.height;
		anchor = { left: r.left, top: r.top, width: r.width };
		appliedTop = r.top;
		maxHeight = null;
	}

	/**
	 * Re-place the card against its own rendered height.
	 *
	 * The panel changes size as it is used — a hint line appears, the success
	 * view replaces the form — and the card slides up to keep its foot on
	 * screen rather than growing a scrollbar of its own.
	 */
	function refit() {
		if (!cardEl || !anchor) return;
		const fit = fitModalCard(
			anchor.top,
			cardEl.offsetHeight,
			window.innerHeight,
			TAB_BAR_INSET,
			appliedTop
		);
		if (fit.top !== appliedTop) appliedTop = fit.top;
		if (fit.maxHeight !== maxHeight) maxHeight = fit.maxHeight;
	}

	const lifted = $derived(anchor !== null && mode === 'check');

	function onWindowKey(e: KeyboardEvent) {
		if (lifted && e.key === 'Escape') exitMode();
	}

	// Measured, not predicted: the panel's height depends on the verse, the
	// reader's text size and which of its states it is in.
	$effect(() => {
		if (!lifted || !cardEl) return;
		const el = cardEl;
		// Placed as soon as the DOM has the modal styles, via tick() rather than
		// a frame callback. requestAnimationFrame and ResizeObserver both
		// deliver as part of the rendering steps, which a hidden tab does not
		// run — so a card opened near the foot of the screen stayed hanging
		// under the tab bar until some unrelated resize happened to fire.
		// tick() resolves off the DOM update instead, whatever the tab is doing.
		let live = true;
		tick().then(() => {
			if (live) refit();
		});
		const ro = new ResizeObserver(() => refit());
		ro.observe(el);
		window.addEventListener('resize', refit);
		return () => {
			live = false;
			ro.disconnect();
			window.removeEventListener('resize', refit);
		};
	});

	const modalStyle = $derived(
		anchor
			? `position: fixed; left: ${anchor.left}px; top: ${appliedTop}px; width: ${anchor.width}px; z-index: 50;` +
				(maxHeight === null ? '' : ` max-height: ${maxHeight}px; overflow-y: auto;`)
			: ''
	);

	/**
	 * The page must not scroll while a card is lifted: the card is fixed and
	 * the list behind it is not, so scrolling would slide the two apart.
	 */
	$effect(() => {
		if (!lifted) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});

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

<svelte:window onkeydown={onWindowKey} />

{#if lifted}
	<!-- Holds the row's space so the list behind does not close up and reopen
	     around the lifted card. -->
	<div style="height: {rowHeight}px;" aria-hidden="true"></div>
	<!-- Dimmed and blurred, and a tap anywhere on it leaves — the same exit as
	     ✕ and Escape. A button rather than a div so it is a real target for a
	     keyboard and for assistive tech, which a bare click handler is not. -->
	<button
		type="button"
		aria-label="점검 닫기"
		class="fixed inset-0 z-40 cursor-default bg-black/30 backdrop-blur-sm"
		onclick={exitMode}
	></button>
{/if}
<!-- role/tabindex are applied dynamically (button only when selectable); the
     static a11y check can't see that, so the noninteractive-tabindex rule is a
     false positive here. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<article
	bind:this={cardEl}
	data-testid="verse-row"
	data-lifted={lifted}
	aria-modal={lifted ? 'true' : undefined}
	style="--vfs: {fontScale}; {modalStyle}"
	class="{cardClass}{lifted ? ' shadow-[var(--shadow-popover)]' : ''}"
	role={lifted ? 'dialog' : interactive ? 'button' : undefined}
	tabindex={interactive ? 0 : undefined}
	aria-pressed={selectable ? selected : undefined}
	aria-label={selectable ? undefined : tapToCheck && checkable ? `${heading} 점검 시작` : undefined}
	onclick={interactive ? handleCardClick : undefined}
	onkeydown={interactive ? handleCardKey : undefined}
>
	<header class="space-y-1">
		<!-- Wraps rather than squeezes. The controls need ~228px once the
		     last-checked line joins them, and a 320px card has 280px in total —
		     the title, free to shrink to nothing, was being erased outright.
		     Given a floor it pushes the cluster onto its own row instead, which
		     also relieves a squeeze the title already had before this line
		     existed (52px, two lines, for a reference like 창세기 28 : 14). -->
		<div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
			<!-- The popper rides with the title, not with the difficulty badges: it
			     is something the verse earned, while that cluster is a set of
			     controls.

			     Inline inside the h2, and with no whitespace before it, so it
			     trails the last word and wraps with it. As a flex sibling it sat
			     centred against the whole block, which on a phone — where the
			     button cluster leaves the title barely a third of the row, and
			     most titles take two lines — left it floating in the margin
			     beside neither line. It joins the heading's accessible name,
			     which is the truth about the verse rather than noise. -->
			<h2
				class="min-w-[7rem] flex-1 text-[calc(19px*var(--vfs))] font-bold leading-tight text-[var(--color-text)]"
			>{heading}{#if mode === 'read' && (lastCheckPerfect ?? perfect)}<PartyPopper
					size={15}
					strokeWidth={2}
					class="ml-1.5 inline align-middle text-[var(--color-accent)]"
					aria-label="완벽하게 암송한 구절"
				/>{/if}</h2>
			<!-- gap-2 rather than gap-1: these are four separate targets on a
			     phone, each smaller than a fingertip, and 4px between them made
			     난이도 and 암송 trade taps. -->
			<!-- ml-auto is only felt on the wrapped row, where the cluster is
			     alone and would otherwise sit left, away from the edge it lines
			     up with everywhere else. On one line the title's flex-1 has
			     already eaten the slack. -->
			<div class="ml-auto flex shrink-0 items-center gap-2">
				{#if mode === 'read'}
					<!-- Only when there is a check to report. Most verses have none,
					     and on a 320px phone this row already leaves the title a
					     third of its width — so the cost of the line is paid only by
					     the verses actually being worked on.

					     Kept at the badges' 28px so the cluster stays one row, with
					     the touch target grown to 44px by a pseudo-element instead:
					     making the element itself 44px would push every control
					     beside it out of line. -->
					{#if shownLastCheckedAt !== null}
						<button
							type="button"
							data-testid="last-checked"
							onclick={(e) => {
								// The card's own tap starts a check. Without this the
								// reader would get the history and lose the card behind
								// a panel at the same time.
								e.stopPropagation();
								openHistory();
							}}
							aria-haspopup="dialog"
							aria-label="최근 점검 {relativeTimeKo(shownLastCheckedAt)}, 점검 기록 보기"
							class="relative inline-flex h-7 shrink-0 items-center rounded-md px-1 text-[11px] text-[var(--color-text-tertiary)] transition-colors before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] hover:bg-[var(--color-elevated)] hover:text-[var(--color-text-secondary)]"
						>
							{relativeTimeKo(shownLastCheckedAt)}
						</button>
					{/if}
					{#if ratingsEnabled}
						<div class="flex items-center gap-1.5">
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
					<button
						type="button"
						onclick={enterRehearse}
						class="rounded-full bg-[var(--color-accent-soft)] px-3.5 py-1 text-[11px] font-semibold text-[var(--color-accent)] transition-opacity hover:opacity-90"
					>
						암송
					</button>
					{#if checkable}
						<button
							type="button"
							onclick={enterCheck}
							class="rounded-full border border-[var(--color-border)] px-3.5 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
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
		<!-- The reference text is dropped when the heading is already showing it,
		     so an untitled verse does not print its citation twice. The controls
		     that share this line stay put either way. -->
		<p class="flex items-center gap-2 text-[calc(19px*var(--vfs))] text-[var(--color-text-secondary)]">
			{#if citeOnOwnLine}{verse.cite}{/if}
			{#if reader}
				<!-- Opens the verse in its chapter, which is the question a memorised
				     verse most often raises: what comes either side of it. New tab,
				     because leaving mid-check would lose the attempt. -->
				<a
					href={reader}
					target="_blank"
					rel="noopener"
					aria-label="{verse.cite} 성경에서 보기"
					class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] transition-opacity hover:opacity-80"
				>
					<BookOpen size={15} strokeWidth={2} />
				</a>
			{/if}
			{#if mode === 'read' && ttsSupported}
				<!-- On the reference line beside the book link, not up in the button
				     cluster: both of these open the verse elsewhere — one to read it
				     in its chapter, one to hear it — while the cluster is where the
				     card's own modes live. It also gives the title room and keeps
				     four small targets from crowding one corner.

				     A speaker, not a transport control: beside the book link it has
				     to read as "hear this verse" the way the book reads as "read this
				     verse", and a play triangle beside a book looked like a media
				     widget the card does not have. Filled where the book link is
				     tinted, because this one acts on the card while the book leaves
				     for another site. It also stays one symbol — it used
				     to swap to a repeat mark when looping was armed, which announced a
				     setting rather than what pressing it does. The loop stays visible
				     where it can be acted on: the player bar's own repeat toggle
				     lights up. -->
				<button
					type="button"
					onclick={toggleSpeak}
					aria-pressed={speaking}
					aria-label={speaking
						? '읽기 중지'
						: speakOpts.speakRepeat
							? `${heading} 반복해서 듣기`
							: `${heading} 듣기`}
					class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors {speaking
						? 'bg-[var(--color-text)] text-[var(--color-canvas)]'
						: 'bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:opacity-90'}"
				>
					{#if speaking}
						<!-- Stop, not a muted speaker: the tap has to promise what it does.
						     The chip inks over while speaking — the gold fill is now the
						     idle look, so playing needs a state of its own. -->
						<Square size={11} strokeWidth={2.5} fill="currentColor" />
					{:else}
						<Volume2 size={15} strokeWidth={2} />
					{/if}
				</button>
			{/if}
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
			<!-- 점검 only. One `checkHistory` state feeds two consumers that want
			     different things: this list counts 점검 and its label says so,
			     while the underline suggestions count quiz rounds too — same act
			     without the rating. Filtering here rather than at the query keeps
			     it to one read. -->
			<MemorizeCheckPanel
				verse={verse.w}
				currentStart={startDifficulty}
				currentFull={fullDifficulty}
				{heardAloud}
				onPickStart={onPickStartDifficulty!}
				onPickFull={onPickFullDifficulty!}
				history={checkOnlyHistory}
				onGraded={(outcome) => {
					revealAll();
					// Assigned, not just raised: a flawed attempt takes the popper back.
					lastCheckPerfect = outcome.accuracy >= 1;
					if (!packageId) return;
					const checkedAt = Date.now();
					lastCheckedLocal = checkedAt;
					recordCheck(packageId, verse.no, outcome, checkedAt)
						.then(loadCheckHistory)
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
				class:suggested={suggested.has(i) && !marked.has(i)}
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
				{#if marking && hasOpenSuggestion}자주 틀린 곳을 점선으로 표시했습니다 · 눌러서 밑줄{:else if marking}자주 틀리는 단어를 눌러 밑줄{:else if allRevealed}모두 열렸습니다{:else}← 좌→우로 드래그해서 단어 열기{/if}
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

	{#if playerOpen}
		<VersePlayer
			playing={speaking}
			fraction={progress.fraction}
			elapsedMs={progress.elapsedMs}
			totalMs={progress.totalMs}
			repeat={speakOpts.speakRepeat}
			onToggle={toggleSpeak}
			onSeek={(f) => {
				player?.seek(f);
				if (!speaking) {
					speaking = true;
				}
			}}
			onToggleRepeat={toggleSpeakRepeat}
			onClose={closePlayer}
		/>
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

<!-- Outside the article: the sheet is fixed to the viewport, and a card in a
     list is inside a transformed, clipped ancestor that would trap it. -->
{#if historyOpen}
	<CheckHistorySheet
		heading={verse.cite}
		records={checkOnlyHistory}
		onClose={() => (historyOpen = false)}
	/>
{/if}

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

	/* Proposed from the check history rather than placed by the reader — so it
	   is dotted and tertiary, plainly a suggestion beside the solid accent of a
	   real underline. Tapping it makes it real through the handler marking mode
	   already binds to every word. */
	.suggested {
		text-decoration: underline dotted;
		text-decoration-color: var(--color-text-tertiary);
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
