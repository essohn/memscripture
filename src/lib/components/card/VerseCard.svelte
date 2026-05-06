<script lang="ts">
	import type { StoredVerse } from '$lib/db/local';
	interface Props {
		verse: StoredVerse;
		packageName?: string;
	}
	let { verse, packageName }: Props = $props();
</script>

<article
	class="bg-[var(--color-card)] border border-[var(--color-border)] rounded-2xl p-6
	       shadow-[var(--shadow-card)] space-y-4"
>
	<header class="space-y-1">
		<p class="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
			{packageName ?? ''} · #{verse.no}
		</p>
		<h2 class="text-xl font-semibold text-[var(--color-text)]">{verse.title}</h2>
		<p class="text-sm text-[var(--color-text-secondary)]">{verse.cite}</p>
	</header>
	<p class="text-base leading-[1.65] text-[var(--color-text)]">{verse.w}</p>
</article>
