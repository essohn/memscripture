<script lang="ts">
	import { RefreshCw } from 'lucide-svelte';
	import {
		atBottom,
		fetchLatestVersion,
		isArmed,
		pullOffset,
		type UpdateCheck
	} from '$lib/update/pullToUpdate';

	interface Props {
		version: string;
	}
	let { version }: Props = $props();

	type Phase = 'idle' | 'pulling' | 'checking' | 'done';
	let phase = $state<Phase>('idle');
	let offset = $state(0);
	let armed = $state(false);
	let result = $state<UpdateCheck | null>(null);

	/** Raw finger travel past the end of the page. Null while not tracking. */
	let startY: number | null = null;

	function onTouchStart(e: TouchEvent) {
		if (phase === 'checking') return;
		// Only a drag that begins at the end of the page is this gesture. One
		// that starts higher up is the reader scrolling, and stays scrolling
		// even if it happens to arrive at the bottom mid-swipe.
		if (!atBottom(window.scrollY, window.innerHeight, document.documentElement.scrollHeight)) {
			startY = null;
			return;
		}
		startY = e.touches[0].clientY;
		result = null;
	}

	function onTouchMove(e: TouchEvent) {
		if (startY === null || phase === 'checking') return;
		// Upward travel: the finger moves toward the top of the screen as the
		// page is pulled up past its end.
		const dy = startY - e.touches[0].clientY;
		if (dy <= 0) {
			offset = 0;
			armed = false;
			phase = 'idle';
			return;
		}
		offset = pullOffset(dy);
		armed = isArmed(dy);
		phase = 'pulling';
	}

	async function onTouchEnd() {
		if (startY === null) return;
		const shouldCheck = armed;
		startY = null;
		offset = 0;
		armed = false;
		phase = 'idle';
		if (shouldCheck) await check();
	}

	async function check() {
		if (phase === 'checking') return;
		phase = 'checking';
		result = null;
		const outcome = await fetchLatestVersion(version);
		if (outcome.kind === 'outdated') {
			// Reloading is the update: with no service worker holding a cached
			// shell, a fresh load of the document is the new build. Left in the
			// 'checking' phase on purpose — the label keeps saying so until the
			// page goes, rather than flashing a result nobody can read.
			location.reload();
			return;
		}
		result = outcome;
		phase = 'done';
	}

	const message = $derived(
		phase === 'checking'
			? '확인 중…'
			: phase === 'pulling'
				? armed
					? '놓으면 업데이트 확인'
					: '당겨서 업데이트 확인'
				: result?.kind === 'current'
					? '최신 버전입니다'
					: result?.kind === 'failed'
						? '확인하지 못했습니다'
						: null
	);
</script>

<svelte:window
	ontouchstart={onTouchStart}
	ontouchmove={onTouchMove}
	ontouchend={onTouchEnd}
	ontouchcancel={onTouchEnd}
/>

<!-- The version is a button so the check is reachable without a touchscreen;
     the pull is the same action by another route, not a second feature. -->
<div
	class="flex flex-col items-center gap-1 pb-2 pt-6 text-center"
	style={offset > 0 ? `padding-bottom: ${offset + 8}px;` : ''}
>
	<button
		type="button"
		onclick={check}
		disabled={phase === 'checking'}
		aria-label="현재 버전 {version} · 업데이트 확인"
		class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] tabular-nums text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-secondary)]"
	>
		<RefreshCw
			size={11}
			strokeWidth={2}
			class={phase === 'checking' ? 'animate-spin' : ''}
		/>
		v{version}
	</button>

	<!-- Reserved so the footer does not jump as the message comes and goes. -->
	<p aria-live="polite" class="min-h-[1rem] text-[11px] text-[var(--color-text-tertiary)]">
		{message ?? ''}
	</p>
</div>
