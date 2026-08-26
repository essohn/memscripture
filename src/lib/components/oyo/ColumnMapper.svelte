<script lang="ts">
	import { columnName } from '$lib/utils/columnName';
	import type { ColumnMapping } from '$lib/oyo/tableColumns';

	interface Props {
		/** Header cells, or the first row's values when there is no header. */
		labels: string[];
		mapping: ColumnMapping;
		hasHeader: boolean;
		onchange: (next: { mapping: ColumnMapping; hasHeader: boolean }) => void;
	}

	let { labels, mapping, hasHeader, onchange }: Props = $props();

	// A · 장절 rather than just 장절: the letter is what the reader sees in
	// Excel, and a table with two columns headed 본문 is otherwise ambiguous.
	const options = $derived(
		labels.map((label, i) => ({
			value: String(i),
			text: label ? `${columnName(i)} · ${label}` : columnName(i)
		}))
	);

	function pickCite(value: string) {
		onchange({ mapping: { ...mapping, cite: Number(value) }, hasHeader });
	}

	function pickOptional(role: 'title' | 'w', value: string) {
		onchange({
			mapping: { ...mapping, [role]: value === '' ? null : Number(value) },
			hasHeader
		});
	}
</script>

<div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
	<div class="space-y-2.5">
		<div class="flex items-center gap-3">
			<span class="w-9 shrink-0 text-[13px] text-[var(--color-text-secondary)]">장절</span>
			<select
				aria-label="장절 열"
				value={String(mapping.cite)}
				onchange={(e) => pickCite(e.currentTarget.value)}
				class="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1.5 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
			>
				<!-- No 없음 here: without a citation there is nothing to import. -->
				{#each options as o (o.value)}
					<option value={o.value}>{o.text}</option>
				{/each}
			</select>
		</div>

		<div class="flex items-center gap-3">
			<span class="w-9 shrink-0 text-[13px] text-[var(--color-text-secondary)]">제목</span>
			<select
				aria-label="제목 열"
				value={mapping.title === null ? '' : String(mapping.title)}
				onchange={(e) => pickOptional('title', e.currentTarget.value)}
				class="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1.5 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
			>
				<option value="">없음</option>
				{#each options as o (o.value)}
					<option value={o.value}>{o.text}</option>
				{/each}
			</select>
		</div>

		<div class="flex items-center gap-3">
			<span class="w-9 shrink-0 text-[13px] text-[var(--color-text-secondary)]">본문</span>
			<select
				aria-label="본문 열"
				value={mapping.w === null ? '' : String(mapping.w)}
				onchange={(e) => pickOptional('w', e.currentTarget.value)}
				class="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1.5 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
			>
				<option value="">없음</option>
				{#each options as o (o.value)}
					<option value={o.value}>{o.text}</option>
				{/each}
			</select>
		</div>
	</div>

	<!--
		The escape hatch for both directions detection can be wrong. Taking the
		first verse for a header loses a verse in silence; taking a header for a
		verse leaves a junk row in the preview. Header rule 2 catches most of
		both, and this catches the rest.
	-->
	<label class="mt-3 flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
		<input
			type="checkbox"
			checked={hasHeader}
			onchange={(e) => onchange({ mapping, hasHeader: e.currentTarget.checked })}
			class="h-[15px] w-[15px] rounded border-[var(--color-border)] accent-[var(--color-accent)]"
		/>
		첫 행은 제목 줄
	</label>
</div>
