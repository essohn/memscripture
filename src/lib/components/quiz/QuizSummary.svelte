<script lang="ts">
	import { ChevronRight, Inbox } from 'lucide-svelte';
	import type { QuizItem } from '$lib/quiz/session';
	import { rankOf } from '$lib/arcade/score';
	import { arcade } from '$lib/state/arcade.svelte';

	interface Props {
		passed: number;
		total: number;
		failed: QuizItem[];
		/** Rounds this run could not store. Shown once, under the score, when
		 *  above zero — silence is how a total storage failure once hid for a
		 *  whole session. */
		unsaved?: number;
		/** The arcade's total for the run. Zero is a real answer — a session
		 *  that scored nothing still happened. */
		points?: number;
		/** The longest chain the run managed. */
		bestCombo?: number;
		onAgain: () => void;
		onClose: () => void;
		/** Files the missed verses into 최근. Rejects if the write failed —
		 *  this screen reports that rather than swallowing it. */
		onSaveRecent: () => Promise<void>;
	}
	let {
		passed,
		total,
		failed,
		unsaved = 0,
		points = 0,
		bestCombo = 0,
		onAgain,
		onClose,
		onSaveRecent
	}: Props = $props();

	/**
	 * Where the 최근에 담기 press has got to.
	 *
	 * 'done' replaces the button rather than disabling it: filing the same
	 * verses twice only bumps one bundle's timestamp, and a button still
	 * standing after a successful press is an invitation to find that out.
	 * 'error' puts it back, because a failed write is worth another try.
	 */
	let saveState = $state<'idle' | 'saving' | 'done' | 'error'>('idle');

	const saveMessage = $derived(
		saveState === 'done'
			? '최근에 담았습니다'
			: saveState === 'error'
				? '최근에 담지 못했습니다'
				: ''
	);

	async function saveRecent() {
		if (saveState === 'saving' || saveState === 'done') return;
		saveState = 'saving';
		try {
			await onSaveRecent();
			saveState = 'done';
		} catch {
			saveState = 'error';
		}
	}

	const rank = $derived(rankOf(passed, total));

	// The one flourish in the sound set, and the only place it plays.
	$effect(() => {
		arcade.play('clear');
	});
</script>

<section class="space-y-4 text-center">
	{#if rank}
		<!-- The letter is read off passes alone. Points reward speed and
		     chains, and a reader who was slow but right still recited every
		     verse — a headline that fell for being unhurried would say
		     otherwise. -->
		<p
			data-testid="quiz-rank"
			class="mx-auto flex h-16 w-16 items-center justify-center rounded-xl border-[3px] border-[var(--color-accent)] text-[34px] leading-none font-bold tracking-tight text-[var(--color-accent)] tabular-nums"
		>
			{rank}
		</p>
	{/if}
	<p class="text-[32px] font-semibold text-[var(--color-text)]">{passed} / {total}</p>

	<div class="flex items-center justify-center gap-4 text-[12px] tracking-wider">
		<span data-testid="quiz-points" class="tabular-nums text-[var(--color-text-secondary)]">
			{points.toLocaleString('en-US')} P
		</span>
		{#if bestCombo > 0}
			<span data-testid="quiz-best-combo" class="tabular-nums text-[var(--color-accent)]">
				최고 {bestCombo} COMBO
			</span>
		{/if}
	</div>
	{#if unsaved > 0}
		<p class="text-[12px] text-[var(--color-text-tertiary)]">{unsaved}개 라운드는 기록하지 못했습니다</p>
	{/if}

	{#if failed.length > 0}
		<div class="text-left">
			<div class="flex items-center justify-between gap-2">
				<h2 class="text-[13px] font-semibold text-[var(--color-text-secondary)]">다시 볼 구절</h2>
				<!-- The list already links each verse; this files the whole set in
				     one press, so the reader can carry on and find them together on
				     the home screen instead of chasing citations one at a time. -->
				{#if saveState !== 'done'}
					<button
						type="button"
						onclick={saveRecent}
						disabled={saveState === 'saving'}
						class="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text)] disabled:opacity-50"
					>
						<Inbox size={13} strokeWidth={1.75} />
						{saveState === 'saving' ? '담는 중…' : '최근에 담기'}
					</button>
				{/if}
			</div>
			<!-- Always rendered: a live region has to exist before its text
			     changes or the change is never announced. -->
			<p
				aria-live="polite"
				class="text-[12px] {saveState === 'error'
					? 'text-[var(--color-danger)]'
					: 'text-[var(--color-accent)]'}"
			>
				{saveMessage}
			</p>
			<!-- Each one goes to the verse itself. ?v= is the library page's own
			     deep link — it scrolls the card into view and flashes it — which
			     is exactly what the reader would otherwise do by hand after
			     reading a list of citations and then having to go find them. -->
			<ul class="mt-2 space-y-1">
				{#each failed as f, i (i)}
					<li>
						<a
							href="/library/{f.packageId}?v={f.verseNo}"
							class="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px] text-[var(--color-text)] transition-colors hover:bg-[var(--color-elevated)]"
						>
							<span class="truncate">
								{f.title}
								<span class="text-[var(--color-text-tertiary)]">{f.cite}</span>
							</span>
							<ChevronRight
								size={15}
								strokeWidth={1.75}
								class="shrink-0 text-[var(--color-text-tertiary)]"
							/>
						</a>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="flex gap-2">
		<button
			type="button"
			onclick={onAgain}
			class="flex-1 rounded-xl bg-[var(--color-accent)] py-2.5 font-medium text-white"
		>
			다시 하기
		</button>
		<button
			type="button"
			onclick={onClose}
			class="flex-1 rounded-xl bg-[var(--color-elevated)] py-2.5 font-medium text-[var(--color-text)]"
		>
			끝내기
		</button>
	</div>
</section>
