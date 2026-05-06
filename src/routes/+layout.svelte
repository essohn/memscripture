<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import TabBar from '$lib/components/nav/TabBar.svelte';
	import { currentTab } from '$lib/utils/route';

	let { children } = $props();
	const tab = $derived(currentTab(page.url.pathname));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-dvh" style="padding-bottom: calc(64px + env(safe-area-inset-bottom));">
	{@render children()}
</div>

<TabBar current={tab} />
