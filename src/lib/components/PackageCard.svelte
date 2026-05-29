<script lang="ts">
	import type { PackageMeta } from '$lib/types';

	interface Props {
		pkg: PackageMeta;
		recent?: boolean;
	}
	let { pkg, recent = false }: Props = $props();
</script>

<a
	data-testid="package-card"
	href={`/library/${pkg.id}`}
	class="package-card group relative block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-5"
>
	{#if recent}
		<span
			class="absolute left-0 top-6 bottom-6 w-[3px] rounded-r-full bg-gradient-to-b from-[var(--color-accent)] to-[color-mix(in_srgb,var(--color-accent)_55%,transparent)]"
			aria-hidden="true"
		></span>
	{/if}

	<div class="flex items-center justify-between gap-4">
		<div class="min-w-0 flex-1">
			<div class="inline-flex items-center">
				<span
					class="text-[10.5px] font-medium uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]"
				>
					{pkg.translation_name}
					{#if recent}
						<span class="ml-1.5 text-[var(--color-accent)]">· 최근</span>
					{/if}
				</span>
				{#if pkg.kind === 'user'}
					<span
						class="ml-2 inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-elevated)] px-2 py-0.5 text-[10px] font-medium tracking-wider text-[var(--color-text-tertiary)]"
					>
						사용자 정의
					</span>
				{/if}
			</div>
			<h3 class="mt-1.5 truncate text-[17px] font-semibold text-[var(--color-text)]">
				{pkg.name}
			</h3>
			<p class="mt-1 text-xs text-[var(--color-text-secondary)]">
				{pkg.abbreviation}
			</p>
		</div>

		<div
			class="flex shrink-0 flex-col items-end leading-none text-[var(--color-text-tertiary)] transition-colors group-hover:text-[var(--color-accent)]"
		>
			<span class="text-[28px] font-semibold tracking-tight text-[var(--color-text)]">
				{pkg.verse_number}
			</span>
			<span class="mt-0.5 text-[10px] uppercase tracking-[0.16em]">구절</span>
		</div>
	</div>
</a>

<style>
	.package-card {
		box-shadow: var(--shadow-soft);
		transition:
			transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
			box-shadow 240ms cubic-bezier(0.22, 1, 0.36, 1),
			border-color 240ms ease;
	}
	.package-card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-card-hover);
		border-color: color-mix(in srgb, var(--color-accent) 40%, var(--color-border));
	}
	.package-card:active {
		transform: translateY(0);
		box-shadow: var(--shadow-soft);
		transition-duration: 80ms;
	}
</style>
