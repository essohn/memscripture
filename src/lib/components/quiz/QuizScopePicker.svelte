<script lang="ts">
	import { Flag, ScanSearch, Sparkles, Trophy } from 'lucide-svelte';
	import { DIFFICULTY_LABELS, DIFFICULTY_LEVELS } from '$lib/db/verseRatings';
	import {
		buildQueue,
		filterByTier,
		type ItemRating,
		type QuizItem,
		type Tier
	} from '$lib/quiz/session';
	import type { Target } from '$lib/quiz/scope';
	import type { VerseSignal } from '$lib/quiz/priority';
	import {
		GAMES,
		GAME_LABELS,
		OPENING_GAME_WORDS,
		OPENING_WORD_CHOICES,
		type Game,
		type OpeningWords
	} from '$lib/quiz/games';

	interface Props {
		targets: Target[];
		selected: Target | null;
		/** Everything the selected 대상 resolves to, before the tier filters. */
		items: QuizItem[];
		ratings: Map<string, ItemRating>;
		signals: Map<string, VerseSignal>;
		/** Per verse, the sentence 자주 틀리는 곳 찾기 can ask about. Verses with
		 *  no usable attempt are absent, which is what attemptCount counts. */
		attempts: Map<string, string>;
		/** Stamped when the 대상 resolved. Held still while the reader moves
		 *  chips, so the count they read and the session they start are ranked
		 *  against one instant rather than two. */
		now: number;
		/**
		 * The 대상 was chosen before this screen — the reader arrived from a
		 * 암송 DAY — so the scope is stated, not offered. Absent means they came
		 * in cold and pick it here.
		 */
		lockedLabel?: string;
		onPick: (t: Target) => void;
		onStart: (queue: QuizItem[], game: Game, openingWords: OpeningWords) => void;
	}
	let {
		targets,
		selected,
		items,
		ratings,
		signals,
		attempts,
		now,
		lockedLabel,
		onPick,
		onStart
	}: Props = $props();

	/** One tile per game, in picker order. */
	const GAME_ICONS = { typing: Trophy, opening: Flag, spot: ScanSearch };

	/** Every chip a row can hold: the six levels, plus 미평가. */
	const ALL_TIERS: Tier[] = [...DIFFICULTY_LEVELS, null];

	/**
	 * The chips each row starts on: all of them.
	 *
	 * It used to open on Impossible, xHard and Hard — the reasoning being that
	 * the quiz is where a reader goes to work on what they keep losing. The
	 * reasoning was fine and the effect was not: the two rows *intersect*, and
	 * a verse is only rated by being checked, so on a library that has barely
	 * been checked almost everything is 미평가 and falls out of both rows. A
	 * 149-verse 암송 DAY was offering two.
	 *
	 * An unrated verse is not known to be hard, but it is not known to be easy
	 * either, and a quiz that will not ask about it can never find out. Opening
	 * on everything and letting the reader narrow is the way round that cannot
	 * present an empty scope as if it were the whole library.
	 */
	let startTiers = $state<Set<Tier>>(new Set<Tier>(ALL_TIERS));
	let fullTiers = $state<Set<Tier>>(new Set<Tier>(ALL_TIERS));

	/** One game for the whole session. 퍼펙트 게임 is the default because it is
	 *  the one that works on every verse from the first day. */
	let game = $state<Game>('typing');
	/** How many opening words 시작 단어 asks for. Fixed here rather than in the
	 *  round, so every verse in a run is asked the same way and the score means
	 *  one thing. */
	let openingWords = $state<OpeningWords>(OPENING_GAME_WORDS);

	/** The chosen scope, unranked. The denominator of both counts below. */
	const pool = $derived(filterByTier(items, startTiers, fullTiers, ratings));

	/** 자주 틀리는 곳 찾기 can only ask about a verse it has a recorded attempt
	 *  for. The other two games ask about anything. */
	const eligible = $derived(game === 'spot' ? new Set(attempts.keys()) : undefined);

	const queue = $derived(buildQueue(pool, { signals, now, eligible }));

	/** How many of the chosen scope have a sentence to ask about. */
	const attemptCount = $derived(pool.filter((i) => attempts.has(i.id)).length);

	/** How many cards the stack draws. Capped: past a handful the shape stops
	 *  reading as "a few more" and starts reading as noise, and the number
	 *  beside it is the exact answer anyway. */
	const STACK_MAX = 6;
	const layers = $derived(Array.from({ length: Math.min(queue.length, STACK_MAX) }, (_, i) => i));

	/** The line explaining why Quiz! cannot be pressed, or undefined when it
	 *  can.
	 *
	 *  An empty pool and an empty queue are different failures: the first means
	 *  the chips exclude everything, the second — only reachable for 자주
	 *  틀리는 곳 찾기, whose eligibility is the only thing that can empty a
	 *  non-empty pool — means there is nothing recorded to ask about. */
	const describedBy = $derived(
		items.length === 0
			? 'quiz-start-empty'
			: pool.length === 0
				? 'quiz-start-no-tier'
				: queue.length === 0
					? 'quiz-start-no-attempts'
					: undefined
	);

	/** Every chip a row can hold, 미평가 included. */

	function setRow(row: 'start' | 'full', next: Set<Tier>) {
		if (row === 'start') startTiers = next;
		else fullTiers = next;
	}

	function toggle(row: 'start' | 'full', t: Tier) {
		const current = row === 'start' ? startTiers : fullTiers;
		const next = new Set(current);
		if (next.has(t)) next.delete(t);
		else next.add(t);
		setRow(row, next);
	}

	/** One press instead of seven. Clearing a row is the more useful half —
	 *  it is how you say "this dimension only" without tapping every chip off
	 *  — so the button offers whichever of the two the row is not already at. */
	function toggleAll(row: 'start' | 'full', chosen: Set<Tier>) {
		setRow(row, chosen.size === ALL_TIERS.length ? new Set<Tier>() : new Set<Tier>(ALL_TIERS));
	}
</script>

{#snippet tierRow(row: 'start' | 'full', heading: string, headingId: string, chosen: Set<Tier>)}
	<div>
		<h3 id={headingId} class="text-[11px] font-medium text-[var(--color-text-tertiary)]">
			{heading}
		</h3>
		<div role="group" aria-labelledby={headingId} class="mt-1.5 flex flex-wrap gap-1.5">
			{#each DIFFICULTY_LEVELS as level (level)}
				<button
					type="button"
					onclick={() => toggle(row, level)}
					aria-pressed={chosen.has(level)}
					class="rounded-full px-2.5 py-1 text-[12px] {chosen.has(level)
						? 'bg-[var(--color-accent)] text-white'
						: 'bg-[var(--color-elevated)] text-[var(--color-text-secondary)]'}"
				>
					{DIFFICULTY_LABELS[level]}
				</button>
			{/each}
			<button
				type="button"
				onclick={() => toggle(row, null)}
				aria-pressed={chosen.has(null)}
				class="rounded-full px-2.5 py-1 text-[12px] {chosen.has(null)
					? 'bg-[var(--color-accent)] text-white'
					: 'bg-[var(--color-elevated)] text-[var(--color-text-secondary)]'}"
			>
				미평가
			</button>
			<button
				type="button"
				onclick={() => toggleAll(row, chosen)}
				class="ml-auto rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[12px] text-[var(--color-text-tertiary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
			>
				{chosen.size === ALL_TIERS.length ? '전체 해제' : '전체 선택'}
			</button>
		</div>
	</div>
{/snippet}

<section class="space-y-5">
	<!-- The game comes first: it decides what the other two choices mean. 자주
	     틀리는 곳 찾기 narrows the scope to verses with a recorded mistake, so
	     picking it after setting a range would silently change the range. -->
	<div>
		<h2 id="quiz-game-heading" class="text-[13px] font-semibold text-[var(--color-text-secondary)]">
			게임
		</h2>
		<div role="group" aria-labelledby="quiz-game-heading" class="mt-2 grid grid-cols-3 gap-2">
			{#each GAMES as g (g)}
				{@const Icon = GAME_ICONS[g]}
				{@const on = game === g}
				<button
					type="button"
					onclick={() => (game = g)}
					aria-pressed={on}
					class="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border px-2 text-center transition-colors {on
						? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
						: 'border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-accent)]/50'}"
				>
					<Icon
						size={26}
						strokeWidth={1.75}
						class={on ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-tertiary)]'}
					/>
					<span
						class="text-[12px] leading-[1.35] font-medium break-keep {on
							? 'text-[var(--color-text)]'
							: 'text-[var(--color-text-secondary)]'}">{GAME_LABELS[g]}</span
					>
				</button>
			{/each}
		</div>
		<!-- Only for the game that has an opening to ask about.

		     A slider rather than a row of pills: this is one dial with a range,
		     and a range is a thing you slide. Four buttons made the reader read
		     four labels and choose between them, where a knob is read at a
		     glance and moved with a thumb — which on a phone is the difference
		     between a decision and a gesture.

		     Native, so the keyboard, the screen reader and the drag all come
		     for free and behave the way the reader's own device does. -->
		{#if game === 'opening'}
			<div class="mt-4 flex items-baseline justify-between">
				<h3
					id="quiz-opening-words-heading"
					class="text-[13px] font-semibold text-[var(--color-text-secondary)]"
				>
					시작 단어 수
				</h3>
				<span
					data-testid="opening-words-value"
					class="text-[13px] font-semibold tabular-nums text-[var(--color-accent)]"
				>
					{openingWords}단어
				</span>
			</div>
			<input
				type="range"
				class="dial mt-2 w-full"
				style="--fill: {((openingWords - OPENING_WORD_CHOICES[0]) /
					(OPENING_WORD_CHOICES[OPENING_WORD_CHOICES.length - 1] - OPENING_WORD_CHOICES[0])) *
					100}%"
				aria-labelledby="quiz-opening-words-heading"
				min={OPENING_WORD_CHOICES[0]}
				max={OPENING_WORD_CHOICES[OPENING_WORD_CHOICES.length - 1]}
				step="1"
				value={openingWords}
				aria-valuetext="{openingWords}단어"
				oninput={(e) => (openingWords = Number(e.currentTarget.value) as OpeningWords)}
			/>
			<!-- The steps, under the track. Four numbers the thumb lands on,
			     so the range is legible before it is touched. -->
			<div
				aria-hidden="true"
				class="mt-1 flex justify-between px-0.5 text-[10px] tabular-nums text-[var(--color-text-tertiary)]"
			>
				{#each OPENING_WORD_CHOICES as n (n)}
					<span>{n}</span>
				{/each}
			</div>
		{/if}
	</div>

	<div>
		<h2 id="quiz-scope-heading" class="text-[13px] font-semibold text-[var(--color-text-secondary)]">
			범위
		</h2>
		{#if lockedLabel}
			<!-- Stated, not offered: the reader picked this 암송 DAY on the way in,
			     and re-asking would invite them to answer differently from the
			     screen they came from. Still shown, because a session that does
			     not say what it is about is a session you cannot trust. -->
			<p class="mt-2 rounded-xl bg-[var(--color-elevated)] px-3 py-2 text-[14px] text-[var(--color-text)]">
				{lockedLabel}
			</p>
		{:else}
			<div role="group" aria-labelledby="quiz-scope-heading" class="mt-2 flex flex-col gap-1.5">
				{#each targets as t (t.kind + t.id)}
					<button
						type="button"
						onclick={() => onPick(t)}
						aria-pressed={selected?.kind === t.kind && selected?.id === t.id}
						class="rounded-xl px-3 py-2 text-left text-[14px] {selected?.kind === t.kind &&
						selected?.id === t.id
							? 'bg-[var(--color-accent)] text-white'
							: 'bg-[var(--color-elevated)] text-[var(--color-text)]'}"
					>
						{t.label}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div>
		<h2 class="text-[13px] font-semibold text-[var(--color-text-secondary)]">난이도 그룹 선택</h2>
		<!-- Two rows because the app rates the two separately, and a verse can be
		     brutal to begin and easy once running. They intersect: a row with
		     everything on stops constraining, which is the only reading where
		     turning a chip on cannot widen the result. -->
		<div class="mt-2 space-y-2.5">
			{@render tierRow('start', '시작 난이도', 'quiz-start-tier-heading', startTiers)}
			{@render tierRow('full', '전체 난이도', 'quiz-full-tier-heading', fullTiers)}
		</div>
	</div>

	<!-- Always rendered: this count changes as the chips move, and a live region
	     that appears alongside its own new text announces nothing. -->
	<div aria-live="polite">
		{#if game === 'spot'}
			<p class="text-[12px] text-[var(--color-text-tertiary)]">
				{pool.length}구절 중 {attemptCount}개에 내 오답 기록이 있습니다
			</p>
		{/if}
	</div>

	<div class="flex items-end justify-between gap-3">
		<div class="flex items-end gap-3">
			<!-- The pile is the count made physical: one card per verse this
			     sitting will ask about, so "오늘 10구절" has a shape before it has
			     a number. Decorative — the sentence beside it is the accessible
			     answer. -->
			<div class="stack" aria-hidden="true">
				{#each layers as i (i)}
					<span class="card-layer" style="--i:{i}"></span>
				{/each}
			</div>
			<span class="text-[13px] text-[var(--color-text-secondary)]">
				{#if queue.length < pool.length}
					{pool.length}구절 중 오늘 {queue.length}구절
				{:else}
					{queue.length}구절
				{/if}
			</span>
		</div>
		<button
			type="button"
			onclick={() => onStart(queue, game, openingWords)}
			disabled={queue.length === 0}
			aria-describedby={describedBy}
			class="quiz-go inline-flex items-center gap-1.5 rounded-2xl px-6 py-3 text-[16px] font-bold text-white disabled:opacity-40 disabled:shadow-none"
		>
			<Sparkles size={17} strokeWidth={2.25} />
			Quiz!
		</button>
	</div>

	<!-- Always rendered, even with nothing to say. A live region has to exist
	     before its text changes or the change is never announced, and these
	     lines come and go with the scope. -->
	<div aria-live="polite">
		{#if items.length === 0}
			<p id="quiz-start-empty" class="text-[12px] text-[var(--color-text-tertiary)]">
				고른 범위에 구절이 없습니다
			</p>
		{:else if pool.length === 0}
			<!-- Distinct from the line above, because the fix is different. The
			     range is full; the chips emptied it. A freshly installed package
			     is 미평가 on both dimensions and the rows open on the hard end,
			     so this is the first thing a reader sees there — and "고른 범위에
			     구절이 없습니다" would send them looking for the wrong problem. -->
			<p id="quiz-start-no-tier" class="text-[12px] text-[var(--color-text-tertiary)]">
				고른 난이도 그룹에 해당하는 구절이 없습니다
			</p>
		{:else if queue.length === 0}
			<p id="quiz-start-no-attempts" class="text-[12px] text-[var(--color-text-tertiary)]">
				아직 내 오답 기록이 없어 출제할 문제가 없습니다
			</p>
		{/if}
	</div>
</section>

<style>
	/* A native range, dressed to match. The thumb has to be styled per engine —
	   there is no shared pseudo-element for it — and the track is left to the
	   browser except for its colour and height, so the drag physics stay the
	   ones the reader's own device uses. */
	.dial {
		-webkit-appearance: none;
		appearance: none;
		height: 24px;
		background: transparent;
		cursor: pointer;
	}

	/* The travelled part of the track, filled. A native range gives no
	   cross-engine way to colour it, so it is a hard-stop gradient at the
	   knob's own position — which is also why --fill is set on the element
	   rather than in here. */
	.dial::-webkit-slider-runnable-track {
		height: 6px;
		border-radius: 999px;
		background: linear-gradient(
			to right,
			var(--color-accent) var(--fill, 0%),
			var(--color-elevated) var(--fill, 0%)
		);
	}

	.dial::-moz-range-track {
		height: 6px;
		border-radius: 999px;
		background: linear-gradient(
			to right,
			var(--color-accent) var(--fill, 0%),
			var(--color-elevated) var(--fill, 0%)
		);
	}

	.dial::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 22px;
		height: 22px;
		margin-top: -8px;
		border: 3px solid var(--color-card);
		border-radius: 999px;
		background: var(--color-accent);
		box-shadow: var(--shadow-card);
	}

	.dial::-moz-range-thumb {
		width: 22px;
		height: 22px;
		border: 3px solid var(--color-card);
		border-radius: 999px;
		background: var(--color-accent);
		box-shadow: var(--shadow-card);
	}

	.dial:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 4px;
	}

	/* A leaning pile. Each card sits a little higher and further right than the
	   one under it, so the stack grows visibly with the count without needing
	   to be counted. */
	.stack {
		position: relative;
		width: 34px;
		height: 30px;
		flex: none;
	}
	.card-layer {
		position: absolute;
		bottom: calc(var(--i) * 3px);
		left: calc(var(--i) * 2px);
		width: 22px;
		height: 15px;
		border-radius: 3px;
		border: 1px solid var(--color-accent);
		background-color: var(--color-card);
		opacity: calc(0.45 + var(--i) * 0.11);
		transform: rotate(calc(var(--i) * -1.5deg));
	}

	/* The one button on the screen that starts something, so it is allowed to
	   look like it. */
	.quiz-go {
		/* Warm the whole way across. The first version ran accent → ribbon-blue,
		   which travels from warm to cool through grey and landed muddy; amber
		   and accent are neighbours, so the sheen reads as depth rather than as
		   two colours fighting. The glow under it does the rest of the work. */
		background-image: linear-gradient(135deg, var(--color-ribbon-amber), var(--color-accent));
		box-shadow:
			0 8px 20px -8px var(--color-accent),
			inset 0 1px 0 rgb(255 255 255 / 0.28);
	}
	.quiz-go:active:not(:disabled) {
		transform: translateY(1px);
	}
	.quiz-go:disabled {
		background-image: none;
		background-color: var(--color-elevated);
		color: var(--color-text-tertiary);
	}
</style>
