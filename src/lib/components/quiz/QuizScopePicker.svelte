<script lang="ts">
	import { DIFFICULTY_LABELS, DIFFICULTY_LEVELS } from '$lib/db/verseRatings';
	import { buildQueue, type ItemRating, type QuizItem, type Tier } from '$lib/quiz/session';
	import { loadAttempts, type Target } from '$lib/quiz/scope';
	import { GAMES, GAME_LABELS, type Game } from '$lib/quiz/games';

	interface Props {
		targets: Target[];
		selected: Target | null;
		/** Everything the selected 대상 resolves to, before the tier filter. */
		items: QuizItem[];
		ratings: Map<string, ItemRating>;
		onPick: (t: Target) => void;
		onStart: (queue: QuizItem[], game: Game) => void;
	}
	let { targets, selected, items, ratings, onPick, onStart }: Props = $props();

	/** Every chip on to begin with: the reader opened this to quiz a scope,
	 *  not to narrow one. null is 미평가. */
	let tiers = $state<Set<Tier>>(new Set<Tier>([...DIFFICULTY_LEVELS, null]));

	/** One game for the whole session. 전체 타이핑 is the default because it
	 *  is the one that works on every verse from the first day. */
	let game = $state<Game>('typing');

	/** How many of the queue's verses have a sentence to ask about. Loaded
	 *  only for 틀린 곳 찾기 — the other two games never need it. */
	let attemptCount = $state<number | null>(null);

	const queue = $derived(buildQueue(items, tiers, ratings));

	/** The line explaining why 시작 cannot be pressed, or undefined when it
	 *  can. Tabbing onto a dead button should say what would revive it. */
	const describedBy = $derived(
		queue.length === 0
			? 'quiz-start-empty'
			: game === 'spot' && attemptCount === 0
				? 'quiz-start-no-attempts'
				: undefined
	);

	function toggle(t: Tier) {
		const next = new Set(tiers);
		if (next.has(t)) next.delete(t);
		else next.add(t);
		tiers = next;
	}

	$effect(() => {
		if (game !== 'spot') {
			attemptCount = null;
			return;
		}
		// Reset before the read is kicked off, not just when leaving 'spot':
		// the total (queue.length, template-read) updates the instant a tier
		// chip moves, and a count left over from the previous scope would
		// pair the new total with a stale answer — a ratio that can exceed
		// itself. The line already hides itself while attemptCount is null.
		attemptCount = null;
		const forQueue = queue;
		loadAttempts(forQueue)
			.then((m) => {
				if (forQueue !== queue) return;
				attemptCount = m.size;
			})
			.catch(() => {
				if (forQueue !== queue) return;
				attemptCount = 0;
			});
	});
</script>

<section class="space-y-4">
	<div>
		<h2 id="quiz-scope-heading" class="text-[13px] font-semibold text-[var(--color-text-secondary)]">범위</h2>
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
	</div>

	<div>
		<h2 id="quiz-tier-heading" class="text-[13px] font-semibold text-[var(--color-text-secondary)]">난이도 그룹 선택</h2>
		<div role="group" aria-labelledby="quiz-tier-heading" class="mt-2 flex flex-wrap gap-1.5">
			{#each DIFFICULTY_LEVELS as level (level)}
				<button
					type="button"
					onclick={() => toggle(level)}
					aria-pressed={tiers.has(level)}
					class="rounded-full px-2.5 py-1 text-[12px] {tiers.has(level)
						? 'bg-[var(--color-accent)] text-white'
						: 'bg-[var(--color-elevated)] text-[var(--color-text-secondary)]'}"
				>
					{DIFFICULTY_LABELS[level]}
				</button>
			{/each}
			<button
				type="button"
				onclick={() => toggle(null)}
				aria-pressed={tiers.has(null)}
				class="rounded-full px-2.5 py-1 text-[12px] {tiers.has(null)
					? 'bg-[var(--color-accent)] text-white'
					: 'bg-[var(--color-elevated)] text-[var(--color-text-secondary)]'}"
			>
				미평가
			</button>
		</div>
	</div>

	<div>
		<h2 id="quiz-game-heading" class="text-[13px] font-semibold text-[var(--color-text-secondary)]">게임</h2>
		<div role="group" aria-labelledby="quiz-game-heading" class="mt-2 flex flex-wrap gap-1.5">
			{#each GAMES as g (g)}
				<button
					type="button"
					onclick={() => (game = g)}
					aria-pressed={game === g}
					class="rounded-full px-2.5 py-1 text-[12px] {game === g
						? 'bg-[var(--color-accent)] text-white'
						: 'bg-[var(--color-elevated)] text-[var(--color-text-secondary)]'}"
				>
					{GAME_LABELS[g]}
				</button>
			{/each}
		</div>
		<!-- Always rendered for the same reason as the region below: this count
		     changes as the read resolves and as the tier chips move, and a live
		     region that appears alongside its own new text announces nothing. -->
		<div aria-live="polite">
			{#if game === 'spot' && attemptCount !== null}
				<p class="mt-2 text-[12px] text-[var(--color-text-tertiary)]">
					{queue.length}구절 중 {attemptCount}개에 내 오답 기록이 있습니다
				</p>
			{/if}
		</div>
	</div>

	<div class="flex items-center justify-between gap-3">
		<!-- The count is the whole guard against an unreasonable session: a
		     900-verse package is not a quiz, and a reader who sees the number
		     will narrow it. Capping would silently drop verses they chose. -->
		<span class="text-[13px] text-[var(--color-text-secondary)]">{queue.length}구절</span>
		<button
			type="button"
			onclick={() => onStart(queue, game)}
			disabled={queue.length === 0 || (game === 'spot' && attemptCount === 0)}
			aria-describedby={describedBy}
			class="rounded-xl bg-[var(--color-accent)] px-5 py-2 font-medium text-white disabled:opacity-40"
		>
			시작
		</button>
	</div>
	<!-- Always rendered, even with nothing to say. A live region has to exist
	     before its text changes or the change is never announced, and these
	     lines come and go with the scope. -->
	<div aria-live="polite">
		{#if queue.length === 0}
			<p id="quiz-start-empty" class="text-[12px] text-[var(--color-text-tertiary)]">
				고른 범위에 구절이 없습니다
			</p>
		{:else if game === 'spot' && attemptCount === 0}
			<!-- Not `attemptCount == null`: that means the read is still in
			     flight, and disabling 시작 on a stale "loading" read would block a
			     scope that turns out to have real questions once it resolves. -->
			<p id="quiz-start-no-attempts" class="text-[12px] text-[var(--color-text-tertiary)]">
				아직 내 오답 기록이 없어 출제할 문제가 없습니다
			</p>
		{/if}
	</div>
</section>
