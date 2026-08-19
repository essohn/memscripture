<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import TabBar from '$lib/components/nav/TabBar.svelte';
	import Splash from '$lib/components/feedback/Splash.svelte';
	import { currentTab, isContentPage } from '$lib/utils/route';
	import { joinGroup } from '$lib/db/groups';
	import Toast from '$lib/components/feedback/Toast.svelte';

	let { children } = $props();
	const tab = $derived(currentTab(page.url.pathname));
	/** Search-landing pages are read, not operated: no tab bar, no splash. */
	const chrome = $derived(!isContentPage(page.url.pathname));

	// Brand splash on launch. The layout mounts once per full load, so this shows
	// on app boot / hard refresh but not on client-side route changes.
	let splashVisible = $state(true);

	// OYO row is seeded inside listPackages — the layout no longer needs to
	// do it separately. See src/lib/db/verses.ts:listPackages.

	/**
	 * Invite links: /?g=cdm-b joins and then drops the parameter.
	 *
	 * The link is not a second mechanism, it is how the code travels — one tap
	 * from a KakaoTalk message instead of typing what you heard at a meeting.
	 * Settings keeps the manual field for everyone who arrives without a link:
	 * reinstalled the app, cleared their data, or was told the code out loud.
	 *
	 * The parameter is removed with replaceState so a refresh or a shared URL
	 * does not re-announce a group the reader already belongs to.
	 */
	let groupToast = $state<string | null>(null);
	$effect(() => {
		const code = page.url.searchParams.get('g');
		if (!code) return;
		joinGroup(code)
			.then((info) => {
				if (info) groupToast = `${info.name}에 참여했습니다`;
			})
			.catch(() => {})
			.finally(() => {
				const url = new URL(page.url);
				url.searchParams.delete('g');
				history.replaceState(history.state, '', url);
			});
	});
</script>

<div
	class="min-h-dvh"
	style={chrome ? 'padding-bottom: calc(64px + env(safe-area-inset-bottom));' : ''}
>
	{@render children()}
</div>

{#if chrome}
	<TabBar current={tab} />

	{#if splashVisible}
		<Splash version={__APP_VERSION__} onClose={() => (splashVisible = false)} />
	{/if}
{/if}

<!-- Outside the chrome block: an invite link can land on any screen, and the
     confirmation has to be visible wherever it lands. -->
{#if groupToast}
	<Toast message={groupToast} onClose={() => (groupToast = null)} />
{/if}
