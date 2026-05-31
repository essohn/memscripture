<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import VerseCard from '$lib/components/card/VerseCard.svelte';
	import FontScalePicker from '$lib/components/card/FontScalePicker.svelte';
	import VerseEditSheet, {
		type VerseEditValues
	} from '$lib/components/oyo/VerseEditSheet.svelte';
	import Toast from '$lib/components/feedback/Toast.svelte';
	import { Plus, Eye, EyeOff, FolderInput, FolderOutput } from 'lucide-svelte';
	import {
		getShowVerseTextInList,
		setShowVerseTextInList,
		getVerseFontScale,
		setVerseFontScale,
		type VerseFontScale
	} from '$lib/db/viewOptions';
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
	let showVerseText = $state(true);
	let fontScale = $state<VerseFontScale>(1.0);
	// Per-verse difficulty cache keyed by verse.no — separate maps for each
	// dimension so a write to one doesn't blow away the other.
	let startDifficulties = $state<Record<number, DifficultyLevel | null>>({});
	let fullDifficulties = $state<Record<number, DifficultyLevel | null>>({});
	let sheet = $state<{ mode: 'create' | 'edit'; initial?: VerseEditValues; editingNo?: number } | null>(null);
	let toast = $state<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null);

	$effect(() => {
		let active = true;
		(async () => {
			const [list, eyeState, scale] = await Promise.all([
				listOyoVerses(),
				getShowVerseTextInList(),
				getVerseFontScale()
			]);
			if (!active) return;
			verses = list;
			showVerseText = eyeState;
			fontScale = scale;

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

	function toggleVerseText() {
		showVerseText = !showVerseText;
		setShowVerseTextInList(showVerseText).catch(() => {});
	}

	function pickFontScale(scale: VerseFontScale) {
		fontScale = scale;
		setVerseFontScale(scale).catch(() => {});
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

	function handleImport() {
		fileInputEl?.click();
	}

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

<Header title="내 구절" onBack={() => history.back()} />

<main class="mx-auto max-w-2xl px-5 pb-8 pt-4">
	<div class="mb-3 flex items-center justify-between px-1">
		<p class="text-[13px] text-[var(--color-text-secondary)]">
			총 <span class="font-semibold text-[var(--color-text)]">{verses.length}개</span>
		</p>
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
					class="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
				>
					<FolderInput size={16} strokeWidth={1.75} />
				</button>
				<span
					role="tooltip"
					class="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--color-text)] px-2 py-1 text-[11px] font-medium text-[var(--color-card)] opacity-0 transition-opacity group-hover:opacity-100"
				>
					가져오기
				</span>
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
			<FontScalePicker value={fontScale} onpick={pickFontScale} />
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
					{fontScale}
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
