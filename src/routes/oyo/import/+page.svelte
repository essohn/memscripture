<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Header from '$lib/components/nav/Header.svelte';
	import VerseReviewList from '$lib/components/oyo/VerseReviewList.svelte';
	import { BookPlus, Check, Copy, ClipboardPaste, TriangleAlert } from 'lucide-svelte';
	import { parseImportFragment, type ImportPayload, type ImportVerse } from '$lib/oyo/importLink';
	import { mayNotReachInstalledApp, readBrowsingContext } from '$lib/oyo/handoff';
	import { duplicateIndexes } from '$lib/oyo/cite';
	import { createOyoVerse, listOyoVerses, seedOyoPackageIfMissing } from '$lib/db/oyo';
	import { undoImport } from '$lib/oyo/undoImport';
	import ConfirmDialog from '$lib/components/feedback/ConfirmDialog.svelte';

	type Screen =
		| { kind: 'loading' }
		/** No payload in the address. Not a dead end: this is also how the
		 *  installed app is *entered* on iOS, where a link cannot reach it and
		 *  the reader arrives carrying the link on the clipboard instead. */
		| { kind: 'paste' }
		| { kind: 'review'; source: string | null; verses: ImportVerse[] }
		| { kind: 'saved'; count: number }
		| { kind: 'undone'; count: number; total: number }
		| { kind: 'failed'; message: string };

	let screen = $state<Screen>({ kind: 'loading' });
	let chosen = $state<Set<number>>(new Set());
	let duplicates = $state<Set<number>>(new Set());
	/** Per-row title, edited in place. Optional: left blank, the verse is saved
	 *  unnamed and its card shows the citation where the title goes. Storing
	 *  the citation instead would turn "no title" into "titled with its own
	 *  reference", which is a different fact and one that outlives the import. */
	let titles = $state<string[]>([]);
	let saving = $state(false);

	/** The link that carried this payload, kept so it can be handed to the
	 *  clipboard. Captured before saving clears the fragment — afterwards
	 *  `location.href` is a bare path and copying it would hand the reader an
	 *  empty import. */
	let handoffLink = $state<string | null>(null);
	/** Whether a save here might land outside the container the reader's
	 *  installed copy reads from. See lib/oyo/handoff.ts. */
	let containerRisk = $state(false);
	let copied = $state(false);
	/** Set when the clipboard refuses — some engines only allow a write from a
	 *  trusted gesture they did not recognise here. The link is shown instead so
	 *  it can still be selected by hand; a reader told "복사 실패" and nothing
	 *  else is stuck. */
	let copyFailed = $state(false);
	let pasted = $state('');
	let pasteError = $state<string | null>(null);

	/** The verse numbers this import wrote, so the reader can take them back in
	 *  one tap. Held for the life of this screen only — see undoImport for why
	 *  a durable "undo yesterday's import" is a promise this app cannot keep. */
	let savedNos = $state<number[]>([]);
	let confirmUndo = $state(false);
	let undoing = $state(false);

	const FAILURES: Record<string, string> = {
		missing: '가져올 구절이 없습니다. 성경에서 구절을 선택한 뒤 다시 보내주세요.',
		malformed: '링크를 읽을 수 없습니다. 주소가 잘린 것 같으니 다시 보내주세요.',
		version: '보내는 앱이 더 새로운 형식을 씁니다. 암송 앱을 새로고침해주세요.',
		empty: '가져올 구절이 없습니다.',
		'too-many': '한 번에 보낼 수 있는 구절 수를 넘었습니다. 나눠서 보내주세요.'
	};

	/**
	 * Read once, on mount.
	 *
	 * The fragment is deliberately NOT cleared here. A reader who refreshes
	 * mid-review would otherwise land on "가져올 구절이 없습니다" holding a link
	 * they have not used yet. It is cleared after a successful save instead,
	 * where re-reading it really would be a second import.
	 */
	$effect(() => {
		void page.url;
		let cancelled = false;
		(async () => {
			containerRisk = mayNotReachInstalledApp(readBrowsingContext());
			const result = parseImportFragment(location.hash);
			if (!result.ok) {
				if (cancelled) return;
				// An address with no payload is not a failure to explain. It is
				// the reader arriving on purpose, link in hand, because on iOS
				// that is the only way into the installed app.
				screen =
					result.reason === 'missing'
						? { kind: 'paste' }
						: { kind: 'failed', message: FAILURES[result.reason] };
				return;
			}
			await showReview(result.payload, location.href, () => cancelled);
		})();
		return () => {
			cancelled = true;
		};
	});

	/** Shared by the two ways in — a followed link and a pasted one — so the
	 *  duplicate marking, the default selection and the title seeding cannot
	 *  drift apart between them. */
	async function showReview(
		payload: ImportPayload,
		link: string,
		isCancelled: () => boolean
	): Promise<void> {
		const existing = await listOyoVerses().catch(() => []);
		if (isCancelled()) return;
		const { verses, source } = payload;
		const dupes = duplicateIndexes(
			verses,
			existing.map((v) => v.cite)
		);
		duplicates = dupes;
		// Everything the reader does not already have starts checked: they
		// chose these verses in the other app, so the import should not make
		// them choose again — only reconsider the ones already on file.
		chosen = new Set(verses.map((_, i) => i).filter((i) => !dupes.has(i)));
		titles = verses.map((v) => v.title ?? '');
		handoffLink = link;
		screen = { kind: 'review', source, verses };
	}

	async function submitPaste() {
		const text = pasted.trim();
		if (text.length === 0) return;
		const result = parseImportFragment(text);
		if (!result.ok) {
			// 'missing' here means the reader pasted something that is not this
			// app's link at all — a chapter URL, a screenshot's OCR, an empty
			// clipboard. The envelope failures keep their own wording.
			pasteError =
				result.reason === 'missing'
					? '가져오기 링크가 아닙니다. 성경 앱에서 복사한 주소를 그대로 붙여넣어주세요.'
					: FAILURES[result.reason];
			return;
		}
		pasteError = null;
		await showReview(result.payload, text, () => false);
	}

	async function copyHandoffLink() {
		if (!handoffLink) return;
		try {
			await navigator.clipboard.writeText(handoffLink);
			copied = true;
			copyFailed = false;
		} catch {
			copyFailed = true;
		}
	}

	function toggleAll(verses: ImportVerse[]) {
		chosen = chosen.size === verses.length ? new Set() : new Set(verses.map((_, i) => i));
	}

	async function save(verses: ImportVerse[]) {
		if (saving || chosen.size === 0) return;
		saving = true;
		try {
			// Seeded first: a reader who has never opened 나의 구절 has no OYO
			// package row, and the verses would land in a package the library
			// cannot render.
			await seedOyoPackageIfMissing();
			// Sequential, not Promise.all: createOyoVerse reads max(no) + 1 to
			// pick the next number, so parallel writes would all read the same
			// max and collide on the primary key.
			const order = [...chosen].sort((a, b) => a - b);
			for (const i of order) {
				const v = verses[i];
				const row = await createOyoVerse({ cite: v.cite, w: v.w, title: titles[i].trim() });
				savedNos.push(row.no);
			}
			history.replaceState(history.state, '', location.pathname);
			screen = { kind: 'saved', count: order.length };
		} catch {
			screen = { kind: 'failed', message: '구절을 저장하지 못했습니다. 다시 시도해주세요.' };
		} finally {
			saving = false;
		}
	}

	async function undo() {
		if (undoing) return;
		undoing = true;
		confirmUndo = false;
		const result = await undoImport(savedNos);
		undoing = false;
		screen = { kind: 'undone', count: result.removed, total: result.total };
	}
</script>

<svelte:head><title>구절 가져오기 · MemScripture</title></svelte:head>

<Header
	title="구절 가져오기"
	onBack={() => goto('/library/oyo')}
	showVerseToggle={false}
	showFontScale={false}
	showSearch={false}
/>

<!--
	Shown when this window's IndexedDB may not be the one the reader's installed
	app reads from — see lib/oyo/handoff.ts. It warns but does not block: the app
	cannot see whether a home-screen copy exists, and a reader who has none is
	saving in exactly the right place. Taking the save away from them to protect
	a copy that may not exist trades a certain loss for a possible one.
-->
{#snippet containerWarning(lead: string)}
	{#if containerRisk && handoffLink}
		<div
			class="mb-5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-elevated)] p-4"
		>
			<div class="flex items-start gap-2.5">
				<TriangleAlert
					size={16}
					strokeWidth={2}
					class="mt-[2px] shrink-0 text-[var(--color-warn)]"
				/>
				<div class="min-w-0 flex-1">
					<p class="text-[13px] font-semibold text-[var(--color-text)]">
						홈 화면 앱에는 담기지 않습니다
					</p>
					<p class="mt-1 text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
						{lead} iPhone과 iPad는 홈 화면에 추가한 앱마다 저장소를 따로 쓰기 때문입니다. 링크를
						복사해 홈 화면의 MemScripture에서 붙여넣어주세요.
					</p>
					<button
						type="button"
						onclick={copyHandoffLink}
						class="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-canvas)]"
					>
						{#if copied}
							<Check size={13} strokeWidth={2.25} class="text-[var(--color-success)]" />
							복사됨
						{:else}
							<Copy size={13} strokeWidth={2} />
							링크 복사
						{/if}
					</button>
					{#if copied}
						<p class="mt-2 text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
							홈 화면 앱을 열고 <span class="font-medium text-[var(--color-text)]"
								>나의 구절 → 가져오기 → 링크 붙여넣기</span
							>
						</p>
					{/if}
					{#if copyFailed}
						<p class="mt-2 text-[12px] text-[var(--color-text-secondary)]">
							복사하지 못했습니다. 아래 주소를 직접 복사해주세요.
						</p>
						<textarea
							readonly
							rows="3"
							value={handoffLink}
							onfocus={(e) => e.currentTarget.select()}
							class="mt-1.5 w-full resize-none break-all rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-2 text-[11px] text-[var(--color-text-secondary)]"
						></textarea>
					{/if}
				</div>
			</div>
		</div>
	{/if}
{/snippet}

<main class="mx-auto max-w-2xl px-5 pb-8 pt-6">
	{#if screen.kind === 'loading'}
		<p class="text-[14px] text-[var(--color-text-secondary)]">불러오는 중…</p>
	{:else if screen.kind === 'failed'}
		<p class="text-[14px] leading-relaxed text-[var(--color-text-secondary)]">{screen.message}</p>
		<div class="mt-5 flex items-center gap-3">
			<a
				href="/library/oyo"
				class="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[var(--color-on-accent)] transition-opacity hover:opacity-90"
			>
				나의 구절로
			</a>
			<!-- A truncated link is the common cause of these failures, and the
			     reader still has the whole one on their clipboard. -->
			<button
				type="button"
				onclick={() => (screen = { kind: 'paste' })}
				class="text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
			>
				링크 붙여넣기
			</button>
		</div>
	{:else if screen.kind === 'paste'}
		<p class="text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
			성경 앱에서 복사한 가져오기 링크를 붙여넣으면 구절을 담을 수 있습니다.
		</p>
		<textarea
			bind:value={pasted}
			rows="4"
			placeholder="https://mem.lifescripture.org/oyo/import#v=…"
			class="mt-3 w-full resize-none break-all rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)]"
		></textarea>
		{#if pasteError}
			<p class="mt-2 text-[12px] leading-relaxed text-[var(--color-danger)]">{pasteError}</p>
		{/if}
		<button
			type="button"
			disabled={pasted.trim().length === 0}
			onclick={submitPaste}
			class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2.5 text-[14px] font-semibold text-[var(--color-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-40"
		>
			<ClipboardPaste size={16} strokeWidth={2} />
			링크에서 가져오기
		</button>
	{:else if screen.kind === 'undone'}
		<p class="text-[15px] font-semibold text-[var(--color-text)]">
			{screen.count}개를 되돌렸습니다
		</p>
		{#if screen.count < screen.total}
			<p class="mt-1 text-[13px] text-[var(--color-text-secondary)]">
				{screen.total - screen.count}개는 지우지 못했습니다. 나의 구절에서 확인해주세요.
			</p>
		{/if}
		<a
			href="/library/oyo"
			class="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[var(--color-on-accent)] transition-opacity hover:opacity-90"
		>
			나의 구절 보기
		</a>
	{:else if screen.kind === 'saved'}
		{@render containerWarning('방금 담은 구절은 이 창에만 있습니다.')}
		<div class="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text)]">
			<Check size={18} strokeWidth={2.25} class="text-[var(--color-success)]" />
			{screen.count}개 구절을 나의 구절에 담았습니다
		</div>
		<div class="mt-5 flex items-center gap-3">
			<a
				href="/library/oyo"
				class="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[var(--color-on-accent)] transition-opacity hover:opacity-90"
			>
				나의 구절 보기
			</a>
			<button
				type="button"
				onclick={() => (confirmUndo = true)}
				disabled={undoing}
				class="text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)] disabled:opacity-40"
			>
				{undoing ? '되돌리는 중…' : '되돌리기'}
			</button>
		</div>
		<ConfirmDialog
			open={confirmUndo}
			title="방금 담은 구절을 되돌릴까요?"
			body="나의 구절에서 {screen.count}개를 지웁니다. 이 동작은 되돌릴 수 없습니다."
			confirmLabel="지우기"
			onConfirm={undo}
			onCancel={() => (confirmUndo = false)}
		/>
	{:else}
		{@const verses = screen.verses}
		{@render containerWarning('여기서 담으면 홈 화면의 MemScripture에서는 보이지 않습니다.')}
		<div class="flex items-baseline justify-between gap-3">
			<h2 class="text-[15px] font-semibold text-[var(--color-text)]">
				구절 {verses.length}개
			</h2>
			<button
				type="button"
				onclick={() => toggleAll(verses)}
				class="text-[12px] font-medium text-[var(--color-accent)] hover:underline"
			>
				{chosen.size === verses.length ? '전체 해제' : '전체 선택'}
			</button>
		</div>
		{#if screen.source}
			<p class="mt-1 text-[12px] text-[var(--color-text-tertiary)]">
				{screen.source}에서 보냈습니다
			</p>
		{/if}

		<VerseReviewList rows={verses} bind:titles bind:chosen {duplicates} />

		<button
			type="button"
			disabled={saving || chosen.size === 0}
			onclick={() => save(verses)}
			class="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2.5 text-[14px] font-semibold text-[var(--color-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-40"
		>
			<BookPlus size={16} strokeWidth={2} />
			{saving ? '담는 중…' : `나의 구절에 담기 (${chosen.size})`}
		</button>
	{/if}
</main>
