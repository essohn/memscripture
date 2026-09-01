<script lang="ts">
	import { Home, History, Library, Bookmark } from 'lucide-svelte';
	import type { Tab } from '$lib/utils/route';

	interface Props {
		current: Tab;
		/**
		 * The list Last Read goes back to, or null when the reader has not
		 * opened one. Passed in rather than read here so the bar stays
		 * presentational — the layout owns the memory, this owns how it looks.
		 */
		recentHref: string | null;
	}
	let { current, recentHref }: Props = $props();

	// "Home" leads to the dashboard (recent verses) at /. "Today" (SRS daily
	// review) remains disabled — see plan notes if re-enabling is desired.
	// "Stats" is gone: /stats was a placeholder, and the difficulty lists under
	// it are reached through Last Read now.
	//
	// The label used to be "Recent", which collided with the 최근 section on
	// the home screen — that one is a shelf of verse bundles the reader
	// gathered, this is a shortcut back to the single list they were last in.
	// Two different things cannot both be the recent one. "Last" alone was
	// considered and dropped: the other three labels are nouns, and an
	// adjective with its noun missing reads as "the final one" — worst of all
	// on the dimmed tab, where there is nothing else on screen to complete it.
	// The id stays `recent`: it is not user-facing, and renaming it would
	// churn the route helpers for nothing.
	const tabs = $derived([
		{ id: 'home', href: '/', label: 'Home', icon: Home },
		{ id: 'recent', href: recentHref, label: 'Last Read', icon: History },
		{ id: 'library', href: '/library', label: 'Library', icon: Library },
		{ id: 'bookmarks', href: '/bookmarks', label: 'Marks', icon: Bookmark }
	] satisfies { id: Tab; href: string | null; label: string; icon: unknown }[]);
</script>

<nav
	class="fixed bottom-0 inset-x-0 bg-[var(--color-card)] border-t border-[var(--color-border)] z-50"
	style="padding-bottom: env(safe-area-inset-bottom);"
	aria-label="주 네비게이션"
>
	<ul class="flex items-center justify-around h-16 max-w-2xl mx-auto">
		{#each tabs as tab (tab.id)}
			{@const Icon = tab.icon}
			{@const active = current === tab.id}
			<li>
				{#if tab.href}
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
				{:else}
					<!--
						Nothing remembered yet. Rendered as a span rather than an <a>
						without an href so it is not announced as a link the reader
						could follow, and so the slot keeps its width — the other three
						tabs must not shift the first time a list is opened.
					-->
					<span
						aria-disabled="true"
						class="flex flex-col items-center gap-1 px-4 py-2 rounded-md text-[var(--color-text-tertiary)] opacity-40"
					>
						<Icon size={22} strokeWidth={1.75} />
						<span class="text-[11px] font-medium tracking-wide">{tab.label}</span>
					</span>
				{/if}
			</li>
		{/each}
	</ul>
</nav>
