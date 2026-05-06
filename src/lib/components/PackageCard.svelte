<script lang="ts">
	import type { PackageMeta } from '$lib/types';
	import { ChevronRight } from 'lucide-svelte';

	interface Props {
		pkg: PackageMeta;
	}
	let { pkg }: Props = $props();
</script>

<a
	data-testid="package-card"
	href={`/library/${pkg.id}`}
	class="block bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-5 shadow-[var(--shadow-soft)]
	       hover:shadow-[var(--shadow-card)] transition-shadow"
>
	<div class="flex items-center justify-between gap-3">
		<div class="min-w-0">
			<h3 class="text-base font-semibold text-[var(--color-text)] truncate">{pkg.name}</h3>
			<p class="text-xs text-[var(--color-text-tertiary)] mt-1 uppercase tracking-wide">
				{pkg.abbreviation} · {pkg.translation_name}
			</p>
		</div>
		<ChevronRight size={20} class="text-[var(--color-text-tertiary)] shrink-0" />
	</div>
</a>
