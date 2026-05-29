<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import TabBar from '$lib/components/nav/TabBar.svelte';
	import { currentTab } from '$lib/utils/route';
	import { seedOyoPackageIfMissing } from '$lib/db/oyo';

	let { children } = $props();
	const tab = $derived(currentTab(page.url.pathname));

	$effect(() => {
		// No reactive reads → runs exactly once on mount. Log seed failures (e.g.,
		// quota exceeded) so the OYO row never silently going missing is debuggable.
		seedOyoPackageIfMissing().catch((err) => console.error('[oyo] seed failed:', err));
	});
</script>

<div class="min-h-dvh" style="padding-bottom: calc(64px + env(safe-area-inset-bottom));">
	{@render children()}
</div>

<TabBar current={tab} />
