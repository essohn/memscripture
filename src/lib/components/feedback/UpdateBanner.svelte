<script lang="ts">
	import { fetchLatestVersion, shouldRecheck } from '$lib/update/pullToUpdate';

	/**
	 * "There is a newer build" — asked for, rather than waited for.
	 *
	 * There is no service worker here, so a deploy has no way to announce
	 * itself: a tab left open keeps running the bundle it loaded, and until now
	 * the only way to find out was to know that pulling past the foot of the
	 * page asks. A reader who does not know that gesture stays on an old build
	 * for as long as the tab lives — which on a tablet that is never closed is
	 * indefinitely, and is exactly how one got stuck.
	 *
	 * It offers rather than acts. Reloading on its own would throw away a quiz
	 * in progress or half a verse typed into the check panel, and a background
	 * task is not allowed to cost the reader work they were in the middle of.
	 */
	interface Props {
		/** The version compiled into this bundle. */
		version: string;
	}
	let { version }: Props = $props();

	let outdated = $state(false);
	let dismissed = $state(false);
	/** Null until the first check. Not $state: nothing renders off it. */
	let lastCheckedAt: number | null = null;

	async function check() {
		const now = Date.now();
		if (!shouldRecheck(lastCheckedAt, now)) return;
		lastCheckedAt = now;
		const outcome = await fetchLatestVersion(version);
		// 'failed' is offline, or a deploy mid-flight. Nothing to say about it.
		if (outcome.kind === 'outdated') outdated = true;
	}

	$effect(() => {
		void check();
		// Coming back to the app is the moment worth re-asking: the reader has
		// been away, which is when a deploy is most likely to have happened.
		const onVisible = () => {
			if (document.visibilityState === 'visible') void check();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	});
</script>

{#if outdated && !dismissed}
	<!-- Above the tab bar, which is 64px plus the home indicator. Announced
	     politely: it arrives while the reader is doing something else, and an
	     assertive region would cut across them. -->
	<div
		data-testid="update-banner"
		role="status"
		aria-live="polite"
		class="fixed inset-x-0 z-50 mx-auto flex w-[min(28rem,calc(100%-2rem))] items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 shadow-[var(--shadow-card)]"
		style="bottom: calc(76px + env(safe-area-inset-bottom));"
	>
		<span class="min-w-0 flex-1 text-[13px] text-[var(--color-text)]">
			새 버전이 있습니다
		</span>
		<button
			type="button"
			onclick={() => location.reload()}
			class="shrink-0 rounded-xl bg-[var(--color-accent)] px-3.5 py-1.5 text-[13px] font-medium text-white"
		>
			새로고침
		</button>
		<button
			type="button"
			onclick={() => (dismissed = true)}
			aria-label="나중에"
			class="shrink-0 rounded-lg px-2 py-1 text-[13px] text-[var(--color-text-tertiary)]"
		>
			나중에
		</button>
	</div>
{/if}
