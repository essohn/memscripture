<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import { verseVisibility } from '$lib/state/verseVisibility.svelte';
	import VerseCard from '$lib/components/card/VerseCard.svelte';
	import { fontScale } from '$lib/state/fontScale.svelte';
	import VerseEditSheet, {
		type VerseEditValues
	} from '$lib/components/oyo/VerseEditSheet.svelte';
	import Toast from '$lib/components/feedback/Toast.svelte';
	import { Plus, FolderInput, FolderOutput, ArrowDownUp } from 'lucide-svelte';
		import {
		createOyoVerse,
		deleteOyoVerse,
		listOyoVerses,
		OYO_PACKAGE_ID,
		restoreOyoVerse,
		updateOyoVerse
	} from '$lib/db/oyo';
	import { applyOyoBackup, buildOyoBackup } from '$lib/db/oyoBackup';
	import {
		getVerseRating,
		setStartDifficulty,
		setFullDifficulty,
		type DifficultyLevel
	} from '$lib/db/verseRatings';
	import type { StoredVerse } from '$lib/db/local';

	let verses = $state<StoredVerse[]>([]);
	// Read-through to the header toggle, which every screen shares.
	const showVerseText = $derived(verseVisibility.shown);
	// Per-verse difficulty cache keyed by verse.no — separate maps for each
	// dimension so a write to one doesn't blow away the other.
	let startDifficulties = $state<Record<number, DifficultyLevel | null>>({});
	let fullDifficulties = $state<Record<number, DifficultyLevel | null>>({});
	let sheet = $state<{ mode: 'create' | 'edit'; initial?: VerseEditValues; editingNo?: number } | null>(null);
	let toast = $state<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null);

	// Display order: newest-first by default (verse.no is assigned max+1, so a
	// higher number means more recently added). The toggle flips to oldest-first.
	let newestFirst = $state(true);
	const displayedVerses = $derived(
		[...verses].sort((a, b) => (newestFirst ? b.no - a.no : a.no - b.no))
	);

	$effect(() => {
		let active = true;
		(async () => {
			const list = await listOyoVerses();
			if (!active) return;
			verses = list;

			// Hydrate difficulty maps after the list lands. Done in a second
			// pass so the list renders fast even if there are many verses.
			const ratings = await Promise.all(
				list.map((v) => getVerseRating(OYO_PACKAGE_ID, v.no))
			);
			if (!active) return;
			const starts: Record<number, DifficultyLevel | null> = {};
			const fulls: Record<number, DifficultyLevel | null> = {};
			list.forEach((v, i) => {
				starts[v.no] = (ratings[i]?.startDifficulty ?? null) as DifficultyLevel | null;
				fulls[v.no] = (ratings[i]?.fullDifficulty ?? null) as DifficultyLevel | null;
			});
			startDifficulties = starts;
			fullDifficulties = fulls;
		})().catch(() => {});
		return () => {
			active = false;
		};
	});

	function pickStart(verseNo: number, level: DifficultyLevel | null) {
		startDifficulties = { ...startDifficulties, [verseNo]: level };
		setStartDifficulty(OYO_PACKAGE_ID, verseNo, level).catch(() => {});
	}

	function pickFull(verseNo: number, level: DifficultyLevel | null) {
		fullDifficulties = { ...fullDifficulties, [verseNo]: level };
		setFullDifficulty(OYO_PACKAGE_ID, verseNo, level).catch(() => {});
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

	async function handleDelete(verse: StoredVerse) {
		const snapshot = await deleteOyoVerse(verse.no);
		verses = verses.filter((v) => v.no !== verse.no);
		if (!snapshot) return;
		toast = {
			message: '구절을 지웠습니다',
			actionLabel: '실행 취소',
			onAction: async () => {
				await restoreOyoVerse(snapshot);
				verses = [...verses, snapshot].sort((a, b) => a.no - b.no);
			}
		};
	}

	let fileInputEl: HTMLInputElement | undefined = $state();

	async function handleExport() {
		const backup = await buildOyoBackup();
		const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		const dateKey = new Date().toISOString().slice(0, 10);
		a.href = url;
		a.download = `oyo-backup-${dateKey}.json`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		toast = {
			message:
				backup.verses.length === 0
					? '내보낼 구절이 없습니다'
					: `${backup.verses.length}개를 내보냈습니다`
		};
	}

	let importMenuOpen = $state(false);

	function handleImport() {
		importMenuOpen = !importMenuOpen;
	}

	function chooseBackupRestore() {
		importMenuOpen = false;
		fileInputEl?.click();
	}

	// Escape and an outside click both close the menu, because a popover that
	// only closes by choosing something traps a reader who opened it by mistake.
	$effect(() => {
		if (!importMenuOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') importMenuOpen = false;
		};
		const onDown = () => (importMenuOpen = false);
		window.addEventListener('keydown', onKey);
		// Deferred a tick: the click that opened the menu is still propagating.
		const timer = setTimeout(() => window.addEventListener('pointerdown', onDown), 0);
		return () => {
			clearTimeout(timer);
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('pointerdown', onDown);
		};
	});

	async function onFileChosen(e: Event) {
		const el = e.target as HTMLInputElement;
		const file = el.files?.[0];
		if (!file) return;
		try {
			const text = await file.text();
			const parsed = JSON.parse(text);
			const { imported, skipped } = await applyOyoBackup(parsed);
			verses = await listOyoVerses();
			toast = {
				message:
					skipped > 0
						? `${imported}개를 가져왔습니다 (중복 ${skipped}개 건너뜀)`
						: `${imported}개를 가져왔습니다`
			};
		} catch (err) {
			toast = { message: '가져오기 실패: 파일 형식을 확인해주세요' };
		} finally {
			// Reset so re-picking the same file still fires a change event.
			el.value = '';
		}
	}
</script>

<Header
	title="나의 구절(OYO)"
	titleInfo="OYO는 On Your Own — 나의 개인적인 암송 구절집입니다."
	onBack={() => history.back()}
/>

<main class="mx-auto max-w-2xl px-5 pb-8 pt-4">
	<div class="mb-3 flex items-center justify-between px-1">
		<div class="flex items-center gap-3">
			<p class="text-[13px] text-[var(--color-text-secondary)]">
				총 <span class="font-semibold text-[var(--color-text)]">{verses.length}개</span>
			</p>
			{#if verses.length > 1}
				<button
					type="button"
					onclick={() => (newestFirst = !newestFirst)}
					aria-label="정렬 순서 바꾸기"
					class="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-elevated)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
				>
					<ArrowDownUp size={12} strokeWidth={1.75} />
					{newestFirst ? '최신순' : '오래된순'}
				</button>
			{/if}
		</div>
		<div class="flex items-center gap-1">
			<!--
				FolderOutput / FolderInput show the box-and-arrow shape explicitly
				so the meaning isn't ambiguous: arrow out of folder = 내보내기,
				arrow into folder = 가져오기. Hover tooltips reinforce the label
				for desktop users; mobile users get the action via aria-label.
			-->
			<div class="group relative">
				<button
					type="button"
					onclick={handleImport}
					aria-label="가져오기"
					aria-haspopup="menu"
					aria-expanded={importMenuOpen}
					class="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
				>
					<FolderInput size={16} strokeWidth={1.75} />
				</button>
				{#if !importMenuOpen}
					<span
						role="tooltip"
						class="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--color-text)] px-2 py-1 text-[11px] font-medium text-[var(--color-card)] opacity-0 transition-opacity group-hover:opacity-100"
					>
						가져오기
					</span>
				{/if}
				{#if importMenuOpen}
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<div
						role="menu"
						aria-label="가져오기 방법"
						onpointerdown={(e) => e.stopPropagation()}
						class="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-lg"
					>
						<a
							role="menuitem"
							href="/oyo/import/table"
							class="block px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-elevated)]"
						>
							<span class="block text-[13px] font-medium text-[var(--color-text)]">
								표에서 가져오기
							</span>
							<span class="block text-[11px] text-[var(--color-text-tertiary)]">
								CSV · 엑셀 붙여넣기
							</span>
						</a>
						<button
							type="button"
							role="menuitem"
							onclick={chooseBackupRestore}
							class="block w-full border-t border-[var(--color-border)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-elevated)]"
						>
							<span class="block text-[13px] font-medium text-[var(--color-text)]">
								백업에서 복원
							</span>
							<span class="block text-[11px] text-[var(--color-text-tertiary)]">JSON</span>
						</button>
					</div>
				{/if}
			</div>
			<div class="group relative">
				<button
					type="button"
					onclick={handleExport}
					aria-label="내보내기"
					class="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
				>
					<FolderOutput size={16} strokeWidth={1.75} />
				</button>
				<span
					role="tooltip"
					class="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--color-text)] px-2 py-1 text-[11px] font-medium text-[var(--color-card)] opacity-0 transition-opacity group-hover:opacity-100"
				>
					내보내기
				</span>
			</div>
			<button
				type="button"
				onclick={openCreate}
				class="ml-1 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-3.5 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
			>
				<Plus size={14} strokeWidth={2} />
				구절 추가
			</button>
		</div>
	</div>

	<!--
		Hidden file input the Upload button proxies into. accept restricts the
		picker; resetting `el.value = ''` after each read lets the user re-pick
		the same file and fire change again (e.g. after a parse failure).
	-->
	<input
		bind:this={fileInputEl}
		type="file"
		accept="application/json,.json"
		class="hidden"
		aria-hidden="true"
		onchange={onFileChosen}
	/>

	{#if verses.length === 0}
		<section
			class="empty-card rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-7 py-12 text-center"
		>
			<p class="text-[15px] text-[var(--color-text-secondary)]">
				아직 추가된 구절이 없습니다.
			</p>
			<p class="mt-2 text-[13px] text-[var(--color-text-tertiary)]">
				위의 "구절 추가" 버튼을 눌러 첫 구절을 만들어 보세요.
			</p>
		</section>
	{:else}
		<div class="space-y-5">
			{#each displayedVerses as verse (verse.no)}
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
					fontScale={fontScale.value}
					startDifficulty={startDifficulties[verse.no] ?? null}
					fullDifficulty={fullDifficulties[verse.no] ?? null}
					onPickStartDifficulty={(l) => pickStart(verse.no, l)}
					onPickFullDifficulty={(l) => pickFull(verse.no, l)}
					onEdit={() => openEdit(verse)}
					onDelete={() => handleDelete(verse)}
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
