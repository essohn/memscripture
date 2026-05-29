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

	// Tracks the last successful autofill so a cite edit can re-fetch without
	// blowing away body content the user typed by hand. Replaced on every
	// successful fetch; never set in edit mode (initial body comes from disk,
	// not an autofill), so editing a verse always preserves its saved text
	// unless the user explicitly clears the body first.
	let lastAutofill: { cite: string; body: string } | null = $state(null);

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

	// On blur of the 장절 input: parse the freehand reference, rewrite it in
	// the project-standard format (e.g. "창12:1-3" → "창세기 12 : 1-3"), and
	// fetch the KRV text. Body update rules:
	//   - empty body → fill (first-time autofill).
	//   - body still matches the previous autofill → overwrite (user edited
	//     the cite, expects the text to follow).
	//   - body has any other content (manual typing, prefilled edit-mode
	//     state) → preserve, autofill is a no-op.
	// Silent fail on network errors; the user can always type the body
	// manually. Re-blur with the same normalized cite skips the fetch.
	async function onCiteBlur() {
		const parsed = parsePassageRef(cite);
		if (!parsed) return;
		const normalized = formatStandardRef(parsed);
		cite = normalized;
		if (lastAutofill?.cite === normalized) return;

		const bodyIsAutofilled = lastAutofill !== null && w === lastAutofill.body;
		const bodyIsEmpty = w.trim().length === 0;
		if (!bodyIsAutofilled && !bodyIsEmpty) return;

		autofilling = true;
		try {
			const text = await fetchPassageText(parsed);
			// Re-check: the user may have started editing the body mid-fetch.
			// Only apply if body is still in the same "owned by autofill" state.
			const stillOwned =
				w.trim().length === 0 || (lastAutofill !== null && w === lastAutofill.body);
			if (stillOwned) {
				w = text;
				lastAutofill = { cite: normalized, body: text };
			}
		} catch {
			// Silent — leave body alone for manual entry.
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
