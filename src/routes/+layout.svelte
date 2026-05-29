<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import TabBar from '$lib/components/nav/TabBar.svelte';
	import { currentTab } from '$lib/utils/route';

	let { children } = $props();
	const tab = $derived(currentTab(page.url.pathname));

	// OYO row is seeded inside listPackages — the layout no longer needs to
	// do it separately. See src/lib/db/verses.ts:listPackages.
</script>

<div class="min-h-dvh" style="padding-bottom: calc(64px + env(safe-area-inset-bottom));">
	{@render children()}
</div>

<TabBar current={tab} />
