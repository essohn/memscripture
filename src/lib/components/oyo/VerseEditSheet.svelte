<script lang="ts">
	import { X } from 'lucide-svelte';
	import { formatStandardRef, parsePassageRef } from '$lib/bible/index';
	import { fetchPassageText } from '$lib/bible/fetch';

	export interface VerseEditValues {
		cite: string;
		title: string;
		w: string;
	}

	interface Props {
		mode: 'create' | 'edit';
		initial?: VerseEditValues;
		onSubmit: (values: VerseEditValues) => void | Promise<void>;
		onClose: () => void;
	}
	let { mode, initial, onSubmit, onClose }: Props = $props();

	// The form fields are intentionally uncontrolled-after-init — once the sheet
	// opens, edits live in local $state. Parents pass a fresh sheet (via {#key})
	// when they need to reset for a different verse. The svelte-ignore
	// directives below acknowledge that "read $props once at init" is the
	// design here, not the closure pattern Svelte 5 nudges toward.
	// svelte-ignore state_referenced_locally
	let cite = $state(initial?.cite ?? '');
	// svelte-ignore state_referenced_locally
	let title = $state(initial?.title ?? '');
	// svelte-ignore state_referenced_locally
	let w = $state(initial?.w ?? '');
	let autofilling = $state(false);

	const canSave = $derived(cite.trim().length > 0 && w.trim().length > 0);

	async function submit() {
		if (!canSave) return;
		// Await in case the parent's onSubmit performs async DB work — we want
		// the list to refresh BEFORE the sheet animates out, not after.
		await onSubmit({ cite: cite.trim(), title: title.trim(), w: w.trim() });
		onClose();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	// On blur of the 장절 input: try to parse the freehand reference, rewrite
	// it in the project-standard format (e.g. "창12:1-3" → "창세기 12 : 1-3"),
	// and — if the body is still empty — fetch the KRV text from bolls.life
	// and populate it. Silent fail on network errors; the user can always
	// type the body manually.
	async function onCiteBlur() {
		const parsed = parsePassageRef(cite);
		if (!parsed) return;
		cite = formatStandardRef(parsed);
		if (w.trim().length > 0) return;
		autofilling = true;
		try {
			const text = await fetchPassageText(parsed);
			// Re-check that the user didn't start typing into 본문 mid-fetch.
			if (w.trim().length === 0) w = text;
		} catch {
			// Silent — leave body empty for manual entry.
		} finally {
			autofilling = false;
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<div
	class="fixed inset-0 z-[55] bg-black/30"
	onclick={onClose}
	role="presentation"
	aria-hidden="true"
></div>

<div
	role="dialog"
	aria-modal="true"
	aria-labelledby="oyo-sheet-title"
	class="fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-2xl rounded-t-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 pb-6 pt-5 shadow-2xl"
	style="padding-bottom: calc(env(safe-area-inset-bottom) + 24px);"
>
	<div class="mb-4 flex items-center justify-between">
		<h2 id="oyo-sheet-title" class="text-[16px] font-semibold text-[var(--color-text)]">
			{mode === 'create' ? '구절 추가' : '구절 편집'}
		</h2>
		<button
			type="button"
			onclick={onClose}
			aria-label="닫기"
			class="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
		>
			<X size={18} strokeWidth={1.75} />
		</button>
	</div>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
		class="space-y-3"
	>
		<label class="block">
			<span class="text-[12px] font-medium text-[var(--color-text-secondary)]">장절</span>
			<input
				bind:value={cite}
				onblur={onCiteBlur}
				placeholder="요한복음 3:16 또는 요3:16"
				aria-label="장절"
				class="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2 text-[14px] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50"
			/>
		</label>

		<label class="block">
			<span class="text-[12px] font-medium text-[var(--color-text-secondary)]">제목 (선택)</span>
			<input
				bind:value={title}
				aria-label="제목 (선택)"
				class="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2 text-[14px] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50"
			/>
		</label>

		<label class="block">
			<span class="text-[12px] font-medium text-[var(--color-text-secondary)]">
				본문{#if autofilling}<span class="ml-2 text-[var(--color-text-tertiary)]">불러오는 중…</span>{/if}
			</span>
			<textarea
				bind:value={w}
				rows="5"
				aria-label="본문"
				class="mt-1 w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2 text-[14px] leading-relaxed text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50"
			></textarea>
		</label>

		<div class="flex items-center justify-end gap-2 pt-2">
			<button
				type="button"
				onclick={onClose}
				class="rounded-full px-4 py-2 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-elevated)]"
			>
				취소
			</button>
			<button
				type="submit"
				disabled={!canSave}
				class="rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
			>
				저장
			</button>
		</div>
	</form>
</div>
