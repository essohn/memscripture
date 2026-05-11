<script lang="ts">
	import { Settings } from 'lucide-svelte';

	interface Props {
		title: string;
		showSettings?: boolean;
		onBack?: () => void;
	}
	let { title, showSettings = true, onBack }: Props = $props();
</script>

<header
	class="sticky top-0 bg-[var(--color-canvas)]/90 backdrop-blur z-40 border-b border-[var(--color-border)]"
	style="padding-top: env(safe-area-inset-top);"
>
	<div class="flex items-center justify-between h-14 max-w-2xl mx-auto px-5">
		{#if onBack}
			<button
				type="button"
				onclick={onBack}
				aria-label="뒤로"
				class="text-[var(--color-text-secondary)] -ml-2 p-2"
			>←</button>
		{:else}
			<span class="w-6"></span>
		{/if}
		<h1 class="text-lg font-semibold text-[var(--color-text)]">{title}</h1>
		{#if showSettings}
			<a href="/settings" aria-label="설정" class="text-[var(--color-text-secondary)] -mr-2 p-2">
				<Settings size={20} strokeWidth={1.75} />
			</a>
		{:else}
			<span class="w-6"></span>
		{/if}
	</div>
</header>
