<script lang="ts">
	import { page } from '$app/state';
	import Header from '$lib/components/nav/Header.svelte';
	import QuizScopePicker from '$lib/components/quiz/QuizScopePicker.svelte';
	import QuizTypingRound from '$lib/components/quiz/QuizTypingRound.svelte';
	import QuizOpeningRound from '$lib/components/quiz/QuizOpeningRound.svelte';
	import QuizSpotRound from '$lib/components/quiz/QuizSpotRound.svelte';
	import QuizSummary from '$lib/components/quiz/QuizSummary.svelte';
	import { listTargets, offerableTargets, resolveTarget, type Target } from '$lib/quiz/scope';
	import type { VerseSignal } from '$lib/quiz/priority';
	import { GAME_SOURCE, type Game } from '$lib/quiz/games';
	import { summarize, type ItemRating, type QuizItem, type RoundResult } from '$lib/quiz/session';
	import { recordCheck } from '$lib/db/checkHistory';
	import { NO_COMBO, comboHit, comboMiss, type ComboState } from '$lib/arcade/combo';
	import { spotShown } from '$lib/quiz/spot';
	import { arcade } from '$lib/state/arcade.svelte';
	import { todayLocalKey } from '$lib/db/activity';

	let targets = $state<Target[]>([]);
	let selected = $state<Target | null>(null);
	let items = $state<QuizItem[]>([]);
	let ratings = $state<Map<string, ItemRating>>(new Map());
	let signals = $state<Map<string, VerseSignal>>(new Map());

	/**
	 * Stamped when a 대상 resolves, not when 시작 is pressed.
	 *
	 * The picker ranks the queue to show its count and hands that same queue
	 * to start(). Reading the clock again here would rank twice against two
	 * instants and could hand back a different ten than the number the reader
	 * just read.
	 */
	let now = $state(Date.now());

	let queue = $state<QuizItem[] | null>(null);
	let game = $state<Game>('typing');
	/** Recorded attempts for the verses in play, keyed by QuizItem.id. Empty
	 *  for the other two games, and for verses the reader has never nearly
	 *  landed. */
	let attempts = $state<Map<string, string>>(new Map());
	let index = $state(0);
	let results = $state<RoundResult[]>([]);

	/**
	 * The session's chain, and with it the score.
	 *
	 * Owned here rather than in the rounds because a chain is the thing that
	 * spans them — a round only knows whether it beat its own clock. A session
	 * plays one game throughout, so the multiplier always means "in a row at
	 * this game" and never mixes two scales.
	 */
	let combo = $state<ComboState>(NO_COMBO);

	/**
	 * The sentence each 자주 틀리는 곳 찾기 round shows, drawn once when the run
	 * starts.
	 *
	 * The queue only picks verses it has a recorded attempt for, so showing the
	 * attempt every time made 이상 있음 right in every round — a reader who
	 * noticed could clear a session without reading a word. Half of them now
	 * show the verse intact.
	 *
	 * Drawn here rather than in the round because a component would roll again
	 * on every re-render, and the sentence would change under the reader while
	 * they were deciding about it.
	 */
	let shownById = $state<Map<string, string>>(new Map());

	/** Rounds whose result could not be stored. The run continues either way —
	 *  the reader is mid-quiz — but a silent total failure is how this feature
	 *  once looked perfect while saving nothing. */
	let unsaved = $state(0);

	/** The rounds' record writes. finishRound deliberately does not await
	 *  them — a storage round-trip mid-quiz costs the reader their rhythm —
	 *  but close() must, because it re-resolves the 대상 and a read that
	 *  overtook the last write would miss the verse just asked about. That
	 *  verse would then rank itself straight back to the top of the next
	 *  session, which is the one thing this feature exists to prevent. */
	let writes: Promise<unknown> = Promise.resolve();

	const done = $derived(queue !== null && index >= queue.length);
	const summary = $derived(summarize(results));
	const failedItems = $derived(
		queue === null ? [] : queue.filter((i) => summary.failed.includes(i.id))
	);

	/**
	 * A pick that resolves after a later one must not win.
	 *
	 * Same shape as the guard in fontScale: the read is async and the reader
	 * can tap another 대상 while it is in flight, and without this the earlier
	 * read landing second would replace their choice with the one they left.
	 */
	let pickVersion = 0;

	/** Loaded once. The effect's body reads nothing reactive, but saying so
	 *  with a flag beats relying on what the tracker happens not to see: an
	 *  edit that moves a read into the body would otherwise turn this into a
	 *  refetch on every pick. */
	let loaded = false;

	/**
	 * The 암송 DAY this screen was opened for, when it was opened from one.
	 *
	 * Read through $app/state, the same way the library detail page reads its
	 * own ?v= deep link. Absent — a bookmark, or the tab bar — and the reader
	 * picks a scope here as before.
	 */
	let lockedLabel = $state<string | undefined>(undefined);

	$effect(() => {
		if (loaded) return;
		loaded = true;
		// The sound preference, read once for the whole run. A round that had to
		// wait on storage before it could make a noise would make it late.
		void arcade.load();
		const wanted = page.url.searchParams.get('event');
		listTargets(todayLocalKey())
			.then((t) => {
				const offered = offerableTargets(t);
				targets = offered;
				if (selected !== null) return;
				// An event id that no longer resolves — a stale bookmark, a DAY
				// that has passed — falls back to whatever is on offer rather
				// than locking the reader to a scope that is not there.
				const asked = wanted
					? offered.find((x) => x.kind === 'event' && x.id === wanted)
					: undefined;
				const chosen = asked ?? offered[0];
				if (!chosen) return;
				// Locked when the reader named the DAY on the way in, and also
				// when there is only one thing to name: a list of one is not a
				// choice, it is a button that cannot be pressed wrong.
				if (asked || offered.length === 1) lockedLabel = chosen.label;
				pick(chosen);
			})
			.catch(() => {});
	});

	function pick(t: Target) {
		selected = t;
		const version = ++pickVersion;
		resolveTarget(t)
			.then((r) => {
				if (version !== pickVersion) return;
				items = r.items;
				ratings = r.ratings;
				signals = r.signals;
				attempts = r.attempts;
				now = Date.now();
			})
			.catch(() => {
				if (version !== pickVersion) return;
				items = [];
				ratings = new Map();
				signals = new Map();
				attempts = new Map();
			});
	}

	function start(picked: QuizItem[], chosen: Game) {
		game = chosen;
		queue = picked;
		index = 0;
		results = [];
		unsaved = 0;
		combo = NO_COMBO;
		// Re-drawn per run, so 다시 하기 is a different set of questions rather
		// than the same ones with the answers already known.
		shownById = new Map(picked.map((i) => [i.id, spotShown(i.w, attempts.get(i.id))]));
		arcade.play('select');
	}

	function finishRound(result: RoundResult) {
		results = [...results, result];
		combo = result.passed
			? comboHit(combo, { inTime: result.inTime ?? false, base: result.points ?? 0 })
			: comboMiss(combo);
		// The chime is the chain: each link answers a step higher, so a run
		// sounds like a run. Only for a link that actually extended it.
		if (result.passed && result.inTime) arcade.playCombo(combo.streak);
		const item = queue?.[index];
		if (item) {
			// The reader is mid-quiz. A storage failure costs one record's worth
			// of future evidence; stopping them to report it costs the session.
			const write = recordCheck(item.packageId, item.verseNo, {
				start: null,
				full: null,
				accuracy: result.accuracy,
				elapsedMs: result.elapsedMs,
				missed: result.missed,
				typed: result.typed,
				source: GAME_SOURCE[game]
			}).catch(() => {
				unsaved += 1;
			});
			writes = Promise.all([writes, write]);
		}
		index += 1;
	}

	function again() {
		if (queue) start(queue, game);
	}

	async function close() {
		queue = null;
		index = 0;
		results = [];
		// Re-resolve rather than just returning to the picker. The ten verses
		// just asked about now carry a fresh lastAskedAt, and that is the
		// entire mechanism by which they sink and the next session takes the
		// next ten — without this, 닫기 다음 시작 hands back the identical ten.
		// It also picks up a near-miss just recorded, which is a new question
		// for 틀린 곳 찾기.
		if (!selected) return;
		await writes;
		pick(selected);
	}
</script>

<Header title="퀴즈" showVerseToggle={false} />

<main class="mx-auto w-full max-w-2xl px-4 py-4">
	{#if queue === null}
		<QuizScopePicker
			{targets}
			{selected}
			{items}
			{ratings}
			{signals}
			{attempts}
			{now}
			{lockedLabel}
			onPick={pick}
			onStart={start}
		/>
	{:else if done}
		<QuizSummary
			passed={summary.passed}
			total={summary.total}
			points={combo.points}
			bestCombo={combo.best}
			failed={failedItems}
			{unsaved}
			onAgain={again}
			onClose={close}
		/>
	{:else}
		<!-- A run had no way out of it: the only exits were answering every round
		     or leaving the page. Kept small and above the card so they are
		     reachable without being in the way of the game — 나가기 goes back to
		     the picker, 다시 starts these same verses over. -->
		<div class="mb-2 flex justify-end gap-2">
			<!-- Surfaced rather than left as bare text: they were 12px labels in
			     the secondary colour, which is what this app uses for captions,
			     and a way out of a run should not have to be looked for. -->
			<button
				type="button"
				onclick={again}
				class="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-[14px] font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-elevated)]"
			>
				다시
			</button>
			<button
				type="button"
				onclick={close}
				class="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-[14px] font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-elevated)]"
			>
				나가기
			</button>
		</div>

		<!-- One wrapper per round, keyed, so the animation runs on every verse
		     rather than once for the run. -->
		{#key `${index}:${queue[index].id}`}
			<div class="round-enter">
			{#if game === 'opening'}
				<QuizOpeningRound
					item={queue[index]}
					{index}
					total={queue.length}
					streak={combo.streak}
					onDone={finishRound}
				/>
			{:else if game === 'spot'}
				<QuizSpotRound
					item={queue[index]}
					shown={shownById.get(queue[index].id) ?? queue[index].w}
					{index}
					total={queue.length}
					streak={combo.streak}
					onDone={finishRound}
				/>
			{:else}
				<QuizTypingRound
					item={queue[index]}
					{index}
					total={queue.length}
					streak={combo.streak}
					onDone={finishRound}
				/>
			{/if}
			</div>
		{/key}
	{/if}
</main>

<style>
	/* Stepped rather than smooth: four frames is what a cabinet had, and an
	   eased fade would be the one transition in the quiz that had never seen
	   one. Short enough that it never delays an answer. */
	@keyframes round-in {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.985);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.round-enter {
		animation: round-in 200ms steps(4, end) both;
	}
	/* The reader's answer, given once to the whole system. */
	@media (prefers-reduced-motion: reduce) {
		.round-enter {
			animation: none;
		}
	}
</style>
