<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import QuizScopePicker from '$lib/components/quiz/QuizScopePicker.svelte';
	import QuizTypingRound from '$lib/components/quiz/QuizTypingRound.svelte';
	import QuizOpeningRound from '$lib/components/quiz/QuizOpeningRound.svelte';
	import QuizSpotRound from '$lib/components/quiz/QuizSpotRound.svelte';
	import QuizSummary from '$lib/components/quiz/QuizSummary.svelte';
	import { listTargets, resolveTarget, type Target } from '$lib/quiz/scope';
	import type { VerseSignal } from '$lib/quiz/priority';
	import { GAME_SOURCE, type Game } from '$lib/quiz/games';
	import { summarize, type ItemRating, type QuizItem, type RoundResult } from '$lib/quiz/session';
	import { recordCheck } from '$lib/db/checkHistory';
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

	$effect(() => {
		if (loaded) return;
		loaded = true;
		listTargets(todayLocalKey())
			.then((t) => {
				targets = t;
				if (selected === null && t.length > 0) pick(t[0]);
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
	}

	function finishRound(result: RoundResult) {
		results = [...results, result];
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
		<QuizScopePicker {targets} {selected} {items} {ratings} {signals} {attempts} {now} onPick={pick} onStart={start} />
	{:else if done}
		<QuizSummary
			passed={summary.passed}
			total={summary.total}
			failed={failedItems}
			{unsaved}
			onAgain={again}
			onClose={close}
		/>
	{:else}
		{#key `${index}:${queue[index].id}`}
			{#if game === 'opening'}
				<QuizOpeningRound item={queue[index]} {index} total={queue.length} onDone={finishRound} />
			{:else if game === 'spot'}
				<QuizSpotRound
					item={queue[index]}
					shown={attempts.get(queue[index].id) ?? queue[index].w}
					{index}
					total={queue.length}
					onDone={finishRound}
				/>
			{:else}
				<QuizTypingRound item={queue[index]} {index} total={queue.length} onDone={finishRound} />
			{/if}
		{/key}
	{/if}
</main>
