<script lang="ts">
	import { Check } from 'lucide-svelte';
	import type { RowStatus } from '$lib/oyo/autofill';

	interface Props {
		rows: { cite: string; w: string }[];
		/** Per-row title, edited in place. Optional: left blank, the verse is
		 *  saved unnamed and its card shows the citation where the title goes.
		 *  Storing the citation instead would turn "no title" into "titled with
		 *  its own reference", which is a different fact and one that outlives
		 *  the import. */
		titles: string[];
		chosen: Set<number>;
		duplicates: Set<number>;
		/** Absent on the deeplink screen, where every row always has a body. */
		statuses?: RowStatus[];
	}

	let {
		rows,
		titles = $bindable([]),
		chosen = $bindable(new Set<number>()),
		duplicates,
		statuses
	}: Props = $props();

	function statusOf(i: number): RowStatus {
		return statuses?.[i] ?? 'ready';
	}

	function toggle(i: number) {
		// A row with no body has nothing to memorize, so it cannot be chosen —
		// the same rule the deeplink parser applies when it drops a bodiless
		// verse rather than importing it half-formed.
		if (statusOf(i) === 'no-body') return;
		const next = new Set(chosen);
		if (!next.delete(i)) next.add(i);
		chosen = next;
	}
</script>

<ul class="mt-4 space-y-2">
	{#each rows as v, i (i)}
		{@const status = statusOf(i)}
		<li
			class="flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors {status ===
			'no-body'
				? 'border-[var(--color-border)] bg-[var(--color-card)] opacity-50'
				: chosen.has(i)
					? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
					: 'border-[var(--color-border)] bg-[var(--color-card)]'}"
		>
			<!-- The row was one big button until it grew a title field. An
			     input inside a button is invalid and unusable — the tap that
			     should place a caret toggles the row instead — so the check
			     and the scripture block are two targets now, and the field
			     between them belongs to neither. -->
			<button
				type="button"
				onclick={() => toggle(i)}
				disabled={status === 'no-body'}
				aria-pressed={chosen.has(i)}
				aria-label="{v.cite} 선택"
				class="mt-1.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border disabled:cursor-not-allowed {chosen.has(
					i
				)
					? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]'
					: 'border-[var(--color-border)]'}"
			>
				{#if chosen.has(i)}<Check size={12} strokeWidth={3} />{/if}
			</button>
			<div class="min-w-0 flex-1">
				<input
					type="text"
					bind:value={titles[i]}
					placeholder="제목 (없으면 장절)"
					aria-label="{v.cite} 제목"
					maxlength="60"
					class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1.5 text-[14px] font-semibold text-[var(--color-text)] placeholder:font-normal placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] focus:outline-none"
				/>
				<button
					type="button"
					onclick={() => toggle(i)}
					tabindex="-1"
					class="mt-0.5 block w-full px-1.5 text-left"
				>
					<span class="flex flex-wrap items-center gap-1.5">
						<span class="text-[12px] text-[var(--color-text-secondary)]">{v.cite}</span>
						{#if duplicates.has(i)}
							<span
								class="rounded-full bg-[var(--color-elevated)] px-2 py-0.5 text-[11px] text-[var(--color-text-tertiary)]"
							>
								이미 있음
							</span>
						{/if}
						{#if status === 'no-body'}
							<span
								class="rounded-full bg-[var(--color-elevated)] px-2 py-0.5 text-[11px] text-[var(--color-text-tertiary)]"
							>
								본문 없음 · 건너뜁니다
							</span>
						{/if}
					</span>
					<span class="mt-1 block text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
						{#if status === 'loading'}불러오는 중…{:else}{v.w}{/if}
					</span>
				</button>
			</div>
		</li>
	{/each}
</ul>
