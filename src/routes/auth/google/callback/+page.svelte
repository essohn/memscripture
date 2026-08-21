<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Header from '$lib/components/nav/Header.svelte';
	import { storeAuth, type GoogleAuthState } from '$lib/cloud/google';
	import { readTokenResponse } from '$lib/cloud/pkce';
	import { redirectUri, stateMatches, takePending } from '$lib/cloud/connect';

	let message = $state('연결하는 중…');
	let failed = $state(false);

	const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

	function fail(text: string) {
		message = text;
		failed = true;
	}

	/**
	 * Finishes the consent redirect.
	 *
	 * The verifier is taken (and cleared) before anything else: a code is good
	 * once, and a verifier left in storage is one a stale callback could reuse.
	 */
	$effect(() => {
		void page.url;
		(async () => {
			const pending = takePending(sessionStorage);
			const params = page.url.searchParams;

			if (params.get('error')) return fail('연결이 취소되었습니다');
			const code = params.get('code');
			if (!code) return fail('연결 정보를 받지 못했습니다');
			// A callback whose state does not match this tab's request did not
			// come from the consent we started, whatever else it looks like.
			if (!stateMatches(pending, params.get('state'))) {
				return fail('연결 요청이 만료되었습니다. 다시 시도해주세요');
			}

			try {
				const res = await fetch('/api/google/token', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						code,
						code_verifier: pending!.verifier,
						redirect_uri: redirectUri(location.origin)
					})
				});
				if (!res.ok) return fail('연결에 실패했습니다. 다시 시도해주세요');
				const bundle = readTokenResponse(await res.json());
				if (!bundle) return fail('연결에 실패했습니다. 다시 시도해주세요');

				const who = await fetch(USERINFO_URL, {
					headers: { Authorization: `Bearer ${bundle.accessToken}` }
				});
				if (!who.ok) return fail('계정 정보를 읽지 못했습니다');
				const { email } = (await who.json()) as { email: string };

				const auth: GoogleAuthState = {
					email,
					accessToken: bundle.accessToken,
					expiresAt: bundle.expiresAt,
					...(bundle.refreshToken ? { refreshToken: bundle.refreshToken } : {})
				};
				await storeAuth(auth);
				// replaceState so the browser's back button does not return to a
				// URL carrying a spent authorization code.
				await goto('/settings', { replaceState: true });
			} catch {
				fail('연결에 실패했습니다. 다시 시도해주세요');
			}
		})();
	});
</script>

<svelte:head><title>Google 연결 · MemScripture</title></svelte:head>

<Header title="Google 연결" showVerseToggle={false} showFontScale={false} showSearch={false} />

<main class="mx-auto max-w-2xl px-5 pt-10 text-center">
	<p class="text-[14px] text-[var(--color-text-secondary)]">{message}</p>
	{#if failed}
		<a
			href="/settings"
			class="mt-5 inline-flex items-center rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[var(--color-on-accent)]"
		>
			설정으로
		</a>
	{/if}
</main>
