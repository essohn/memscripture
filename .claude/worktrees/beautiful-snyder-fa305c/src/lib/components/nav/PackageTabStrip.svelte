<script lang="ts">
	import type { PackageMeta } from '$lib/types';

	interface Props {
		packages: PackageMeta[];
		currentId: string;
	}
	let { packages, currentId }: Props = $props();
</script>

<nav
	aria-label="패키지 선택"
	class="-mx-5 mb-2 overflow-x-auto px-5"
	style="overscroll-behavior-x: contain;"
>
	<ul class="flex gap-0 border-b border-[var(--color-border)]">
		{#each packages as pkg (pkg.id)}
			{@const active = pkg.id === currentId}
			<li class="shrink-0">
				<a
					href={`/library/${pkg.id}`}
					aria-current={active ? 'page' : undefined}
					class="block whitespace-nowrap px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors"
					class:text-[var(--color-text)]={active}
					class:border-[var(--color-accent)]={active}
					class:text-[var(--color-text-tertiary)]={!active}
					class:border-transparent={!active}
				>
					{pkg.abbreviation}
				</a>
			</li>
		{/each}
	</ul>
</nav>
