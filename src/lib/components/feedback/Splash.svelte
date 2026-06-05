<script lang="ts">
	import { fade } from 'svelte/transition';

	interface Props {
		/** Version string to show under the app name (e.g. "0.0.1"). */
		version: string;
		/** How long the splash stays fully visible before it dismisses. */
		durationMs?: number;
		/** Called once the hold timer elapses so the parent can unmount it. */
		onClose: () => void;
	}
	let { version, durationMs = 1100, onClose }: Props = $props();

	// Hold briefly, then hand control back to the parent, which removes us with
	// the out:fade below. Runs client-side only; SSR renders the splash over the
	// page so there's no flash of content before it appears.
	$effect(() => {
		const timer = setTimeout(onClose, durationMs);
		return () => clearTimeout(timer);
	});
</script>

<div
	class="splash fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-[var(--color-canvas)]"
	style="padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);"
	role="status"
	aria-label="MemScripture 시작"
	out:fade={{ duration: 400 }}
>
	<img
		src="/icon-512.png"
		alt=""
		width="96"
		height="96"
		class="splash-icon h-24 w-24 rounded-[22px]"
	/>
	<div class="flex flex-col items-center gap-1.5">
		<h1 class="text-[24px] font-bold tracking-tight text-[var(--color-text)]">MemScripture</h1>
		<p
			class="text-[13px] font-medium tabular-nums tracking-[0.12em] text-[var(--color-text-tertiary)]"
		>
			v{version}
		</p>
	</div>
</div>

<style>
	.splash-icon {
		box-shadow: var(--shadow-card);
		animation: splash-rise 600ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	@keyframes splash-rise {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.96);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
</style>
