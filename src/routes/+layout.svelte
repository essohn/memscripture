<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import TabBar from '$lib/components/nav/TabBar.svelte';
	import Splash from '$lib/components/feedback/Splash.svelte';
	import { currentTab, isContentPage } from '$lib/utils/route';
	import { joinGroup } from '$lib/db/groups';
	import Toast from '$lib/components/feedback/Toast.svelte';
	import { syncOnOpen } from '$lib/sync/openSync';
	import { getGoogleOauthClientId } from '$lib/sync/clientId';

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
	 * Invite links: /?team=cdm-b joins and then drops the parameter.
	 *
	 * Named `team`, not `g`: the package page already uses `g` for its group
	 * filter, so /library/60_krv?s=0&g=0 would have tried to join a team called
	 * "0" and then stripped the parameter the filter was reading. This layout
	 * effect runs on every route, so an invite parameter has to be a name no
	 * page could already mean something else by.
	 *
	 * The link is not a second mechanism, it is how the code travels — one tap
	 * from a KakaoTalk message instead of typing what you heard at a meeting.
	 * Settings keeps the manual field for everyone who arrives without a link:
	 * reinstalled the app, cleared their data, or was told the code out loud.
	 *
	 * The parameter is removed with replaceState so a refresh or a shared URL
	 * does not re-announce a group the reader already belongs to.
	 */
	/**
	 * Pull the other devices' records once, on open.
	 *
	 * Here rather than on the home page because this layout mounts once per
	 * full load and a client-side route change is not a new open. Not awaited
	 * and not reported: it must never hold up the first paint, and opening the
	 * app offline is ordinary rather than something to announce.
	 */
	$effect(() => {
		void syncOnOpen({ clientId: getGoogleOauthClientId() });
	});

	let groupToast = $state<string | null>(null);
	$effect(() => {
		const code = page.url.searchParams.get('team');
		if (!code) return;
		joinGroup(code)
			.then((info) => {
				if (info) groupToast = `${info.name}에 참여했습니다`;
			})
			.catch(() => {})
			.finally(() => {
				const url = new URL(page.url);
				url.searchParams.delete('team');
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
