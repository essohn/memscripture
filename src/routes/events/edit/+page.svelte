<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import ConfirmDialog from '$lib/components/feedback/ConfirmDialog.svelte';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { Plus, Trash2 } from 'lucide-svelte';
	import { removeUserEvent, saveUserEvent } from '$lib/db/userEvents';
	import {
		draftProblems,
		draftToEvent,
		draftVerseCount,
		isDraftReady,
		type EventDraft
	} from '$lib/events/form';
	import type { EventEditLoadData } from './+page';

	let { data }: { data: EventEditLoadData } = $props();

	/** The form's own copy. The loader's is a snapshot of what was stored; this
	 *  is what the reader is typing into. */
	let draft = $state<EventDraft>(untrack(() => structuredClone(data.draft)));
	let saving = $state(false);
	let confirmingDelete = $state(false);
	let failed = $state(false);

	const problems = $derived(draftProblems(draft));
	const ready = $derived(isDraftReady(draft));
	const count = $derived(draftVerseCount(draft));

	function maxOf(packageId: string): number {
		return data.packages.find((p) => p.id === packageId)?.maxVerseNo ?? 1;
	}

	function addRange() {
		draft = {
			...draft,
			ranges: [...draft.ranges, { packageId: data.packages[0]?.id ?? '', from: 1, to: 1 }]
		};
	}

	function removeRange(i: number) {
		draft = { ...draft, ranges: draft.ranges.filter((_, n) => n !== i) };
	}

	async function save() {
		if (!ready || saving) return;
		saving = true;
		failed = false;
		try {
			await saveUserEvent(draftToEvent(draft));
			await goto('/events');
		} catch {
			// Said rather than swallowed: the reader has just typed a DAY out and
			// would otherwise be sent back to a list that does not contain it.
			failed = true;
			saving = false;
		}
	}

	async function remove() {
		confirmingDelete = false;
		try {
			await removeUserEvent(draft.id);
			await goto('/events');
		} catch {
			failed = true;
		}
	}
</script>

<Header
	title={data.existing ? '암송 DAY 편집' : '새 암송 DAY'}
	onBack={() => goto('/events')}
	showVerseToggle={false}
/>

<main class="mx-auto w-full max-w-2xl px-4 py-4">
	{#if !data.editable && data.existing}
		<p class="rounded-xl bg-[var(--color-elevated)] px-4 py-3 text-[13px] text-[var(--color-text-secondary)]">
			이 암송 DAY는 앱과 함께 배포된 것이라 여기서 고칠 수 없습니다.
		</p>
	{:else}
		<label class="block">
			<span class="text-[13px] font-semibold text-[var(--color-text-secondary)]">제목</span>
			<input
				type="text"
				bind:value={draft.title}
				placeholder="예: 2026 가을 암송 DAY"
				class="mt-2 w-full rounded-xl bg-[var(--color-elevated)] px-3 py-2.5 text-[15px] text-[var(--color-text)]"
			/>
		</label>

		<label class="mt-4 block">
			<span class="text-[13px] font-semibold text-[var(--color-text-secondary)]">마감일</span>
			<input
				type="date"
				bind:value={draft.dueAt}
				class="mt-2 w-full rounded-xl bg-[var(--color-elevated)] px-3 py-2.5 text-[15px] text-[var(--color-text)]"
			/>
		</label>

		<div class="mt-6 flex items-baseline justify-between">
			<h2 class="text-[13px] font-semibold text-[var(--color-text-secondary)]">구절 범위</h2>
			<span class="text-[12px] tabular-nums text-[var(--color-text-tertiary)]">{count}구절</span>
		</div>

		<!-- Two numbers rather than a list of them: a DAY is written down as
		     "242구절 1~113", and the explicit verse list the rest of the app
		     reads is this form's business, not the reader's. -->
		<ul class="mt-2 space-y-2">
			{#each draft.ranges as range, i (i)}
				<li
					class="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2.5"
				>
					<select
						bind:value={range.packageId}
						aria-label="구절 묶음"
						class="min-w-0 flex-1 rounded-lg bg-[var(--color-elevated)] px-2 py-1.5 text-[13px] text-[var(--color-text)]"
					>
						{#each data.packages as p (p.id)}
							<option value={p.id}>{p.name}</option>
						{/each}
					</select>
					<input
						type="number"
						bind:value={range.from}
						min="1"
						max={maxOf(range.packageId)}
						aria-label="시작 번호"
						class="w-20 rounded-lg bg-[var(--color-elevated)] px-2 py-1.5 text-[13px] tabular-nums text-[var(--color-text)]"
					/>
					<span aria-hidden="true" class="text-[13px] text-[var(--color-text-tertiary)]">~</span>
					<input
						type="number"
						bind:value={range.to}
						min="1"
						max={maxOf(range.packageId)}
						aria-label="끝 번호"
						class="w-20 rounded-lg bg-[var(--color-elevated)] px-2 py-1.5 text-[13px] tabular-nums text-[var(--color-text)]"
					/>
					<span class="text-[11px] text-[var(--color-text-tertiary)] tabular-nums">
						/ {maxOf(range.packageId)}
					</span>
					{#if draft.ranges.length > 1}
						<button
							type="button"
							onclick={() => removeRange(i)}
							aria-label="이 범위 지우기"
							class="ml-auto rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-elevated)]"
						>
							<Trash2 size={16} strokeWidth={1.75} />
						</button>
					{/if}
				</li>
			{/each}
		</ul>

		<button
			type="button"
			onclick={addRange}
			class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--color-border)] py-2.5 text-[13px] font-medium text-[var(--color-text-secondary)]"
		>
			<Plus size={16} strokeWidth={1.75} />
			범위 추가
		</button>

		{#if problems.length > 0}
			<ul class="mt-4 space-y-1">
				{#each problems as p (p)}
					<li class="text-[12px] text-[var(--color-danger)]">{p}</li>
				{/each}
			</ul>
		{/if}

		{#if failed}
			<p class="mt-4 text-[12px] text-[var(--color-danger)]">
				저장하지 못했습니다. 다시 시도해주세요.
			</p>
		{/if}

		<button
			type="button"
			onclick={save}
			disabled={!ready || saving}
			class="mt-6 w-full rounded-xl bg-[var(--color-accent)] py-3 font-medium text-white disabled:opacity-40"
		>
			저장
		</button>

		{#if data.existing}
			<button
				type="button"
				onclick={() => (confirmingDelete = true)}
				class="mt-2 w-full rounded-xl py-3 text-[14px] font-medium text-[var(--color-danger)]"
			>
				이 암송 DAY 지우기
			</button>
		{/if}
	{/if}
</main>

<ConfirmDialog
	open={confirmingDelete}
	title="이 암송 DAY를 지울까요?"
	body="암송 기록은 그대로 남고, 이 DAY의 목록만 사라집니다."
	confirmLabel="지우기"
	onConfirm={remove}
	onCancel={() => (confirmingDelete = false)}
/>
