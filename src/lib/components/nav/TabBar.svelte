<script lang="ts">
	import { Library, Bookmark, BarChart3 } from 'lucide-svelte';

	interface Props {
		current: 'library' | 'bookmarks' | 'stats';
	}
	let { current }: Props = $props();

	// Today tab temporarily disabled. To re-enable, restore the BookOpen import
	// and the { id: 'today', href: '/', label: 'Today', icon: BookOpen } entry —
	// and reverse the / -> /library redirect in src/routes/+page.ts.
	const tabs = [
		{ id: 'library', href: '/library', label: 'Library', icon: Library },
		{ id: 'bookmarks', href: '/bookmarks', label: 'Marks', icon: Bookmark },
		{ id: 'stats', href: '/stats', label: 'Stats', icon: BarChart3 }
	] as const;
</script>

<nav
	class="fixed bottom-0 inset-x-0 bg-[var(--color-card)] border-t border-[var(--color-border)] z-50"
	style="padding-bottom: env(safe-area-inset-bottom);"
	aria-label="주 네비게이션"
>
	<ul class="flex items-center justify-around h-16 max-w-2xl mx-auto">
		{#each tabs as tab}
			{@const Icon = tab.icon}
			{@const active = current === tab.id}
			<li>
				<a
					href={tab.href}
					aria-current={active ? 'page' : undefined}
					aria-label={tab.label}
					class="flex flex-col items-center gap-1 px-4 py-2 rounded-md transition-colors"
					class:text-[var(--color-accent)]={active}
					class:text-[var(--color-text-tertiary)]={!active}
				>
					<Icon size={22} strokeWidth={1.75} />
					<span class="text-[11px] font-medium tracking-wide">{tab.label}</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>
