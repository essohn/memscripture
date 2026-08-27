<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import QuizScopePicker from '$lib/components/quiz/QuizScopePicker.svelte';
	import QuizTypingRound from '$lib/components/quiz/QuizTypingRound.svelte';
	import QuizOpeningRound from '$lib/components/quiz/QuizOpeningRound.svelte';
	import QuizSpotRound from '$lib/components/quiz/QuizSpotRound.svelte';
	import QuizSummary from '$lib/components/quiz/QuizSummary.svelte';
	import { listTargets, loadAttempts, resolveTarget, type Target } from '$lib/quiz/scope';
	import { GAME_SOURCE, type Game } from '$lib/quiz/games';
	import { summarize, type ItemRating, type QuizItem, type RoundResult } from '$lib/quiz/session';
	import { recordCheck } from '$lib/db/checkHistory';
	import { todayLocalKey } from '$lib/db/activity';

	let targets = $state<Target[]>([]);
	let selected = $state<Target | null>(null);
	let items = $state<QuizItem[]>([]);
	let ratings = $state<Map<string, ItemRating>>(new Map());

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

	/**
	 * A spot-attempts read that resolves after a later run started must not
	 * win.
	 *
	 * Same shape as pickVersion, and not by coincidence: comparing the loaded
	 * array against `queue` doesn't work, because assigning a plain array into
	 * `$state` hands back a reactive proxy — the reference captured before the
	 * read is never `===` the one `queue` returns afterwards, so an
	 * identity-based guard fires on every run and the read's result is
	 * silently dropped. A counter sidesteps that: it doesn't care what the
	 * reactivity layer did to the array.
	 */
	let runVersion = 0;

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
			})
			.catch(() => {
				if (version !== pickVersion) return;
				items = [];
				ratings = new Map();
			});
	}

	function start(picked: QuizItem[], chosen: Game) {
		game = chosen;
		const version = ++runVersion;

		// The other two games never read attempts, so nothing to wait for —
		// they start immediately, same as before.
		if (chosen !== 'spot') {
			queue = picked;
			index = 0;
			results = [];
			unsaved = 0;
			attempts = new Map();
			return;
		}

		// Rounds must not mount before this settles: `shown` is a prop, read
		// once at mount, not re-derived per round. Setting `queue` early and
		// letting `attempts` arrive later — the previous shape — let a round
		// mount against the intact verse and then have its text swapped out
		// from under an answer already in progress once the read resolved.
		loadAttempts(picked)
			.then((m) => {
				if (version !== runVersion) return;
				attempts = m;
				queue = picked;
				index = 0;
				results = [];
				unsaved = 0;
			})
			.catch(() => {
				if (version !== runVersion) return;
				// The read failed, so nothing here is known to be a real
				// question — every round would show the intact verse and every
				// 이상 없음 would pass. The run still happens (the picker
				// already promised a scope of this size), but the reader is
				// told the same way a storage failure is told: on the summary,
				// via the same counter finishRound uses below.
				attempts = new Map();
				queue = picked;
				index = 0;
				results = [];
				unsaved = picked.length;
			});
	}

	function finishRound(result: RoundResult) {
		results = [...results, result];
		const item = queue?.[index];
		if (item) {
			// The reader is mid-quiz. A storage failure costs one record's worth
			// of future evidence; stopping them to report it costs the session.
			recordCheck(item.packageId, item.verseNo, {
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
		}
		index += 1;
	}

	function again() {
		if (queue) start(queue, game);
	}

	function close() {
		queue = null;
		index = 0;
		results = [];
	}
</script>

<Header title="퀴즈" showVerseToggle={false} />

<main class="mx-auto w-full max-w-2xl px-4 py-4">
	{#if queue === null}
		<QuizScopePicker {targets} {selected} {items} {ratings} onPick={pick} onStart={start} />
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
