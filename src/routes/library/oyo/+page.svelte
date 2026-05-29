<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import VerseCard from '$lib/components/card/VerseCard.svelte';
	import VerseEditSheet, {
		type VerseEditValues
	} from '$lib/components/oyo/VerseEditSheet.svelte';
	import Toast from '$lib/components/feedback/Toast.svelte';
	import { Plus, Eye, EyeOff } from 'lucide-svelte';
	import { getShowVerseTextInList, setShowVerseTextInList } from '$lib/db/viewOptions';
	import {
		createOyoVerse,
		deleteOyoVerse,
		listOyoVerses,
		restoreOyoVerse,
		updateOyoVerse
	} from '$lib/db/oyo';
	import type { StoredVerse } from '$lib/db/local';

	let verses = $state<StoredVerse[]>([]);
	let showVerseText = $state(true);
	let sheet = $state<{ mode: 'create' | 'edit'; initial?: VerseEditValues; editingNo?: number } | null>(null);
	let toast = $state<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null);

	$effect(() => {
		let active = true;
		(async () => {
			const [list, eyeState] = await Promise.all([
				listOyoVerses(),
				getShowVerseTextInList()
			]);
			if (active) {
				verses = list;
				showVerseText = eyeState;
			}
		})().catch(() => {});
		return () => {
			active = false;
		};
	});

	function toggleVerseText() {
		showVerseText = !showVerseText;
		setShowVerseTextInList(showVerseText).catch(() => {});
	}

	function openCreate() {
		sheet = { mode: 'create' };
	}

	function openEdit(verse: StoredVerse) {
		sheet = {
			mode: 'edit',
			initial: { cite: verse.cite, title: verse.title, w: verse.w },
			editingNo: verse.no
		};
	}

	async function onSheetSubmit(values: VerseEditValues) {
		if (sheet?.mode === 'create') {
			const created = await createOyoVerse(values);
			verses = [...verses, created].sort((a, b) => a.no - b.no);
		} else if (sheet?.mode === 'edit' && sheet.editingNo !== undefined) {
			const editingNo = sheet.editingNo;
			await updateOyoVerse(editingNo, values);
			verses = verses.map((v) => (v.no === editingNo ? { ...v, ...values } : v));
		}
	}

	async function onDelete(verse: StoredVerse) {
		const snapshot = await deleteOyoVerse(verse.no);
		verses = verses.filter((v) => v.no !== verse.no);
		if (!snapshot) return;
		toast = {
			message: '구절을 지웠어요',
			actionLabel: '실행 취소',
			onAction: async () => {
				await restoreOyoVerse(snapshot);
				verses = [...verses, snapshot].sort((a, b) => a.no - b.no);
			}
		};
	}
</script>

<Header title="내 구절" onBack={() => history.back()} />

<main class="mx-auto max-w-2xl px-5 pb-8 pt-4">
	<div class="mb-3 flex items-center justify-between px-1">
		<p class="text-[13px] text-[var(--color-text-secondary)]">
			총 <span class="font-semibold text-[var(--color-text)]">{verses.length}개</span>
		</p>
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={openCreate}
				class="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-3.5 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
			>
				<Plus size={14} strokeWidth={2} />
				구절 추가
			</button>
			<button
				type="button"
				onclick={toggleVerseText}
				aria-pressed={showVerseText}
				aria-label={showVerseText ? '구절 본문 표시 끄기' : '구절 본문 표시 켜기'}
				class="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
			>
				{#if showVerseText}
					<Eye size={16} />
				{:else}
					<EyeOff size={16} />
				{/if}
			</button>
		</div>
	</div>

	{#if verses.length === 0}
		<section
			class="empty-card rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-7 py-12 text-center"
		>
			<p class="text-[15px] text-[var(--color-text-secondary)]">
				아직 추가된 구절이 없어요.
			</p>
			<p class="mt-2 text-[13px] text-[var(--color-text-tertiary)]">
				위의 "구절 추가" 버튼을 눌러 첫 구절을 만들어 보세요.
			</p>
		</section>
	{:else}
		<div class="space-y-5">
			{#each verses as verse (verse.no)}
				<!--
					No {#key} wrapper here: the {#each} key on verse.no already
					triggers a full remount when the row's identity changes. The
					verse-detail page wraps in {#key} because navigation reuses the
					same component instance for different verses; this list does not.
				-->
				<VerseCard
					{verse}
					packageName="OYO"
					packageId="oyo"
					showBody={showVerseText}
				/>
			{/each}
		</div>
	{/if}
</main>

{#if sheet}
	<VerseEditSheet
		mode={sheet.mode}
		initial={sheet.initial}
		onSubmit={onSheetSubmit}
		onClose={() => (sheet = null)}
	/>
{/if}

{#if toast}
	<Toast
		message={toast.message}
		actionLabel={toast.actionLabel}
		onAction={toast.onAction}
		onClose={() => (toast = null)}
	/>
{/if}

<style>
	.empty-card {
		box-shadow: var(--shadow-soft);
	}
</style>
