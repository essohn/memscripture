<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import Header from '$lib/components/nav/Header.svelte';
	import ColumnMapper from '$lib/components/oyo/ColumnMapper.svelte';
	import VerseReviewList from '$lib/components/oyo/VerseReviewList.svelte';
	import { BookPlus, Check, RotateCw } from 'lucide-svelte';
	import { decodeTableFile, MAX_TABLE_FILE_BYTES, TableFileError } from '$lib/oyo/tableText';
	import { parseDelimited } from '$lib/oyo/tableParse';
	import {
		applyMapping,
		detectColumns,
		type ColumnMapping,
		type TableDraft
	} from '$lib/oyo/tableColumns';
	import { duplicateIndexes } from '$lib/oyo/cite';
	import { fillMissingBodies, type RowStatus } from '$lib/oyo/autofill';
	import { createOyoVerse, listOyoVerses, seedOyoPackageIfMissing } from '$lib/db/oyo';

	type Screen =
		| { kind: 'pick'; error: string | null }
		| { kind: 'confirm' }
		| { kind: 'review' }
		| { kind: 'saved'; count: number };

	let screen = $state<Screen>({ kind: 'pick', error: null });

	// Set once the grid is parsed and kept for the life of the screen: the
	// mapper edits the mapping, never the grid, so re-deriving is free.
	let grid = $state<string[][]>([]);
	let labels = $state<string[]>([]);
	let hasHeader = $state(false);
	let mapping = $state<ColumnMapping>({ cite: 0, title: null, w: null });
	let drafts = $state<TableDraft[]>([]);
	let truncated = $state(false);

	// Populated on confirm.
	let titles = $state<string[]>([]);
	let chosen = $state<Set<number>>(new Set());
	let duplicates = $state<Set<number>>(new Set());
	let statuses = $state<RowStatus[]>([]);
	let filling = $state(false);
	let fillTotal = $state(0);
	let fillDone = $state(0);
	let networkDown = $state(false);
	let saving = $state(false);
	// Kept out of the Screen union: a failed save must not cost the reader the
	// bodies the fill just fetched, so it stays on `review` and says so here.
	let saveError = $state<string | null>(null);

	let pasteText = $state('');
	let fillRun: AbortController | null = null;

	// The 뒤로 button is not the only way out of this screen. Leaving any other
	// way should stop the fetching too — nobody is waiting for it any more.
	onDestroy(() => fillRun?.abort());

	const FILE_ERRORS: Record<string, string> = {
		'too-large': '파일이 너무 큽니다 (2MB까지).',
		xlsx: '엑셀 파일은 아직 직접 읽지 못합니다. 엑셀에서 셀을 복사해 아래에 붙여넣거나, CSV로 저장해주세요.',
		empty: '표를 읽지 못했습니다. 파일을 확인해주세요.'
	};

	const missingBodies = $derived(drafts.filter((d) => d.w.length === 0).length);
	const hasNoBody = $derived(statuses.some((s) => s === 'no-body'));
	const saveCount = $derived([...chosen].filter((i) => statuses[i] !== 'no-body').length);
	/** Rows that could be chosen at all. A bodiless row is not one of them, so
	 *  the select-all control has to measure against this rather than against
	 *  the whole list — otherwise it never reads 전체 해제. */
	const selectable = $derived(drafts.map((_, i) => i).filter((i) => statuses[i] !== 'no-body'));
	const allSelected = $derived(selectable.length > 0 && chosen.size === selectable.length);

	/** Re-reads the grid through the current mapping. Pure, instant, and the
	 *  only thing a mapper change does — the network is on the far side of
	 *  the confirm button. */
	function rederive() {
		const out = applyMapping(grid, hasHeader, mapping);
		drafts = out.drafts;
		truncated = out.truncated;
		// Seeded here rather than at the gate: these are different rows now, so
		// a title typed against the old ones no longer belongs to anything. A
		// trip back to the mapper that changes nothing must not cost the reader
		// the titles they typed.
		titles = drafts.map((d) => d.title);
	}

	function readGrid(text: string) {
		const parsed = parseDelimited(text);
		if (parsed.length === 0) {
			screen = { kind: 'pick', error: '가져올 구절이 없습니다.' };
			return;
		}
		grid = parsed;
		const detected = detectColumns(parsed);
		labels = detected.labels;
		hasHeader = detected.hasHeader;
		mapping = detected.mapping;
		rederive();
		screen = { kind: 'confirm' };
	}

	async function onFileChosen(e: Event) {
		const el = e.target as HTMLInputElement;
		const file = el.files?.[0];
		if (!file) return;
		try {
			// Checked before reading: arrayBuffer materialises the whole file, and
			// this limit exists for the mis-picked video that would otherwise be in
			// memory before the decoder ever sees it. `accept` is only advisory on
			// mobile pickers.
			if (file.size > MAX_TABLE_FILE_BYTES) throw new TableFileError('too-large');
			const bytes = new Uint8Array(await file.arrayBuffer());
			readGrid(decodeTableFile(bytes).text);
		} catch (err) {
			const kind = err instanceof TableFileError ? err.kind : 'empty';
			screen = { kind: 'pick', error: FILE_ERRORS[kind] };
		} finally {
			// Reset so re-picking the same file still fires a change event.
			el.value = '';
		}
	}

	function onPasteRead() {
		if (pasteText.trim().length === 0) return;
		readGrid(pasteText);
	}

	function onMapperChange(next: { mapping: ColumnMapping; hasHeader: boolean }) {
		mapping = next.mapping;
		hasHeader = next.hasHeader;
		rederive();
	}

	async function confirm() {
		if (drafts.length === 0) return;
		const existing = await listOyoVerses().catch(() => []);
		duplicates = duplicateIndexes(
			drafts,
			existing.map((v) => v.cite)
		);
		// Everything the reader does not already have starts checked: they
		// built this table on purpose, so the screen should not make them
		// choose again — only reconsider the ones already on file.
		chosen = new Set(drafts.map((_, i) => i).filter((i) => !duplicates.has(i)));
		statuses = drafts.map((d) => (d.w.length > 0 ? 'ready' : 'loading'));
		screen = { kind: 'review' };
		await runFill();
	}

	async function runFill() {
		const pending = drafts.filter((d) => d.w.length === 0).length;
		if (pending === 0) return;
		fillRun?.abort();
		const run = new AbortController();
		fillRun = run;
		fillTotal = pending;
		fillDone = 0;
		networkDown = false;
		filling = true;
		try {
			const summary = await fillMissingBodies(
				drafts,
				(p) => {
					if (run.signal.aborted) return;
					// The fetched body is written back into the draft, so `drafts`
					// stays the live row data. That is what lets 다시 시도 re-run
					// over the whole list and touch only what is still missing.
					if (p.status === 'ready' && p.w !== undefined) drafts[p.index].w = p.w;
					statuses[p.index] = p.status;
					if (p.status !== 'loading') fillDone++;
					// Reassigned rather than mutated: Svelte 5 proxies arrays and
					// objects but not Sets, so `chosen.delete(i)` would drop the
					// row from the set and never repaint the check that shows it.
					if (p.status === 'no-body')
						chosen = new Set([...chosen].filter((c) => c !== p.index));
				},
				{ signal: run.signal }
			);
			if (!run.signal.aborted) networkDown = summary.abortedEarly;
		} finally {
			if (!run.signal.aborted) filling = false;
		}
	}

	function back() {
		if (screen.kind === 'review') {
			fillRun?.abort();
			filling = false;
			screen = { kind: 'confirm' };
			return;
		}
		if (screen.kind === 'confirm') {
			screen = { kind: 'pick', error: null };
			return;
		}
		goto('/library/oyo');
	}

	async function save() {
		if (saving || saveCount === 0) return;
		saving = true;
		saveError = null;
		const order = [...chosen].filter((i) => statuses[i] !== 'no-body').sort((a, b) => a - b);
		let landed = 0;
		try {
			await seedOyoPackageIfMissing();
			for (const i of order) {
				await createOyoVerse({ cite: drafts[i].cite, w: drafts[i].w, title: titles[i].trim() });
				landed++;
				// Dropped as it lands rather than all at the end. The error copy
				// below invites a retry, and a retry that re-walked the whole list
				// would write every verse that already made it a second time —
				// createOyoVerse only ever inserts, so those would be real twins.
				chosen = new Set([...chosen].filter((c) => c !== i));
			}
			screen = { kind: 'saved', count: landed };
		} catch {
			saveError = '구절을 저장하지 못했습니다. 다시 시도해주세요.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>표에서 가져오기 · MemScripture</title></svelte:head>

<Header
	title="표에서 가져오기"
	onBack={back}
	showVerseToggle={false}
	showFontScale={false}
	showSearch={false}
/>

<main class="mx-auto max-w-2xl px-5 pb-8 pt-6">
	{#if screen.kind === 'pick'}
		<label
			class="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] px-4 py-8 text-center transition-colors hover:border-[var(--color-accent)]"
		>
			<span class="text-[14px] font-semibold text-[var(--color-text)]">CSV 파일 선택</span>
			<span class="text-[12px] text-[var(--color-text-tertiary)]">.csv · .tsv · .txt · 2MB까지</span>
			<input
				type="file"
				accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
				aria-label="CSV 파일 선택"
				onchange={onFileChosen}
				class="sr-only"
			/>
		</label>

		{#if screen.error}
			<p class="mt-3 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
				{screen.error}
			</p>
		{/if}

		<p class="mt-6 text-[13px] text-[var(--color-text-secondary)]">
			또는 엑셀·구글시트에서 셀을 복사해 붙여넣으세요
		</p>
		<textarea
			bind:value={pasteText}
			aria-label="표 붙여넣기"
			rows="5"
			class="mt-2 w-full resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
		></textarea>
		<div class="mt-2 flex justify-end">
			<button
				type="button"
				onclick={onPasteRead}
				disabled={pasteText.trim().length === 0}
				class="rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-[var(--color-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-40"
			>
				표 읽기
			</button>
		</div>
	{:else if screen.kind === 'confirm'}
		<h2 class="text-[15px] font-semibold text-[var(--color-text)]">이렇게 읽었습니다. 맞나요?</h2>

		<div class="mt-3">
			<ColumnMapper {labels} {mapping} {hasHeader} onchange={onMapperChange} />
		</div>

		<h3 class="mt-5 text-[13px] font-semibold text-[var(--color-text-secondary)]">미리보기</h3>
		<ul class="mt-2 space-y-1.5">
			{#each drafts.slice(0, 3) as d (d.row)}
				<li class="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
					<span class="text-[var(--color-text)]">{d.cite}</span>
					·
					{d.title || '—'}
					·
					{#if d.w}{d.w}{:else}<span class="text-[var(--color-text-tertiary)]"
							>(성경에서 가져옵니다)</span
						>{/if}
				</li>
			{/each}
		</ul>

		<p class="mt-4 text-[13px] text-[var(--color-text-secondary)]">
			{#if drafts.length === 0}
				이 설정으로는 가져올 구절이 없습니다
			{:else}
				<!-- The spaces are expressions on purpose. Svelte strips a
				     whitespace-only text node at a block's edge, so a literal
				     space here — newline or not — never reaches the screen, and
				     the interpunct ends up glued to 개. -->
				구절 {drafts.length}개{#if missingBodies > 0}{' '}· 본문 없는 {missingBodies}개는 성경에서 가져옵니다{/if}{#if truncated}{' '}· 앞 200개만 가져옵니다{/if}
			{/if}
		</p>

		<button
			type="button"
			onclick={confirm}
			disabled={drafts.length === 0}
			class="mt-5 inline-flex w-full items-center justify-center rounded-full bg-[var(--color-accent)] px-4 py-2.5 text-[14px] font-semibold text-[var(--color-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-40"
		>
			맞아요, 계속
		</button>
	{:else if screen.kind === 'review'}
		<div class="flex items-baseline justify-between gap-3">
			<h2 class="text-[15px] font-semibold text-[var(--color-text)]">
				구절 {drafts.length}개
			</h2>
			{#if filling}
				<span class="text-[12px] text-[var(--color-text-tertiary)]">
					본문 불러오는 중 {fillDone}/{fillTotal}
				</span>
			{:else}
				<button
					type="button"
					onclick={() => (chosen = allSelected ? new Set() : new Set(selectable))}
					class="text-[12px] font-medium text-[var(--color-accent)] hover:underline"
				>
					{allSelected ? '전체 해제' : '전체 선택'}
				</button>
			{/if}
		</div>

		{#if networkDown}
			<p class="mt-2 text-[12px] text-[var(--color-text-secondary)]">
				본문을 가져오지 못했습니다. 네트워크를 확인해주세요.
			</p>
		{/if}

		<VerseReviewList rows={drafts} bind:titles bind:chosen {duplicates} {statuses} />

		{#if hasNoBody && !filling}
			<div class="mt-3 flex justify-end">
				<button
					type="button"
					onclick={runFill}
					class="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
				>
					<RotateCw size={13} strokeWidth={1.75} />
					다시 시도
				</button>
			</div>
		{/if}

		{#if saveError}
			<p class="mt-3 text-[13px] text-[var(--color-text-secondary)]">{saveError}</p>
		{/if}

		<button
			type="button"
			disabled={saving || filling || saveCount === 0}
			onclick={save}
			class="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2.5 text-[14px] font-semibold text-[var(--color-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-40"
		>
			<BookPlus size={16} strokeWidth={2} />
			{saving ? '담는 중…' : `나의 구절에 담기 (${saveCount})`}
		</button>
	{:else}
		<div class="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text)]">
			<Check size={18} strokeWidth={2.25} class="text-[var(--color-success)]" />
			{screen.count}개 구절을 나의 구절에 담았습니다
		</div>
		<a
			href="/library/oyo"
			class="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[var(--color-on-accent)] transition-opacity hover:opacity-90"
		>
			나의 구절 보기
		</a>
	{/if}
</main>
