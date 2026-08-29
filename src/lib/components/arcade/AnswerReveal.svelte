<script lang="ts">
	import { arcade } from '$lib/state/arcade.svelte';
	import { isShardDead, shardAlpha, shatterBox, stepShard, type Shard } from '$lib/arcade/shatter';
	import type { Snippet } from 'svelte';

	interface Props {
		/** Flip to true to open the wall. Before that it stands. */
		reveal: boolean;
		/**
		 * Which way the round went.
		 *
		 * The two have to *move* differently, not just sound differently. Flying
		 * masonry is a reward — it was being spent on wrong answers too, and a
		 * reader glancing back saw the same burst either way. A miss now holds
		 * the wall where it is and stamps it.
		 */
		outcome: 'pass' | 'fail';
		/** Painted on the wall while it stands. */
		label?: string;
		children: Snippet;
	}
	let { reveal, outcome, label = '', children }: Props = $props();

	/** How long the sign holds before the wall clears. Long enough to read. */
	const HOLD_MS = 900;
	const FADE_MS = 260;
	/**
	 * How long the wall stands, stamped Correct!, before it breaks.
	 *
	 * The beat is the point: a wall already in pieces on the frame it appears
	 * was never a wall, and the stamp needs long enough to be read. The chime
	 * lands with the stamp rather than with the masonry — being right is the
	 * event; the wall coming down is only how the answer arrives.
	 */
	const BREAK_DELAY_MS = 520;

	let host = $state<HTMLDivElement | undefined>();
	let canvas = $state<HTMLCanvasElement | undefined>();
	/** The wall covers what it hides until the last piece has gone. */
	let covering = $state(true);
	/** The stamp is down, on a miss. */
	let stamped = $state(false);
	/** The cover is on its way out, on a miss. */
	let clearing = $state(false);
	/** The masonry is in flight, on a hit. Set a beat after the reveal so the
	 *  wall is seen standing first. */
	let breaking = $state(false);

	function css(name: string, fallback: string): string {
		if (!host) return fallback;
		return getComputedStyle(host).getPropertyValue(name).trim() || fallback;
	}

	/** Masonry, drawn as a running bond. Offsetting alternate rows is the whole
	 *  difference between a wall and a spreadsheet. */
	function paintWall(ctx: CanvasRenderingContext2D, w: number, h: number) {
		const rows = 5;
		const bh = h / rows;
		const bw = Math.max(28, w / 7);
		ctx.clearRect(0, 0, w, h);
		ctx.fillStyle = css('--color-elevated', '#f5efe3');
		ctx.fillRect(0, 0, w, h);
		ctx.strokeStyle = css('--color-text', '#2a241c');
		ctx.globalAlpha = 0.18;
		ctx.lineWidth = 2;
		for (let r = 0; r < rows; r++) {
			const offset = r % 2 === 0 ? 0 : -bw / 2;
			for (let x = offset; x < w; x += bw) {
				ctx.strokeRect(
					Math.round(x) + 1,
					Math.round(r * bh) + 1,
					Math.round(bw) - 2,
					Math.round(bh) - 2
				);
			}
		}
		ctx.globalAlpha = 1;
		if (label) {
			ctx.fillStyle = css('--color-text-tertiary', '#8a8175');
			ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(label, w / 2, h / 2);
		}
	}

	/**
	 * What the cover is doing, decided without reference to the canvas.
	 *
	 * Separate from the drawing on purpose: the sign is DOM and the wall is
	 * pixels, and tying the sign's timing to a 2d context means it never
	 * appears anywhere that context is missing — which is every environment
	 * without a real canvas, the test runner included.
	 */
	$effect(() => {
		if (!reveal) {
			covering = true;
			stamped = false;
			clearing = false;
			breaking = false;
			return;
		}
		// Motion off: the wall is simply not there. The reveal is the point; the
		// flying masonry and the stamp are not, and the verdict line under this
		// block says in words which of the two happened.
		if (!arcade.motion) {
			covering = false;
			return;
		}
		if (outcome !== 'fail') {
			stamped = true;
			arcade.play('correct');
			const go = setTimeout(() => (breaking = true), BREAK_DELAY_MS);
			return () => clearTimeout(go);
		}
		// The wall holds. Nothing flies; a stamp lands on it and then the whole
		// thing is taken away.
		stamped = true;
		const hold = setTimeout(() => (clearing = true), HOLD_MS);
		const gone = setTimeout(() => (covering = false), HOLD_MS + FADE_MS);
		return () => {
			clearTimeout(hold);
			clearTimeout(gone);
		};
	});

	$effect(() => {
		const el = canvas;
		const box = host;
		if (!el || !box) return;
		const ctx = el.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const rect = box.getBoundingClientRect();
		const w = Math.max(1, rect.width);
		const h = Math.max(1, rect.height);
		el.width = Math.floor(w * dpr);
		el.height = Math.floor(h * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		if (!reveal) {
			paintWall(ctx, w, h);
			return;
		}
		if (!arcade.motion) {
			ctx.clearRect(0, 0, w, h);
			return;
		}
		// A miss leaves the wall standing under the stamp; the effect above takes
		// the whole cover away when its time is up. A hit stands for a beat
		// first, which is what `breaking` waits for.
		if (outcome === 'fail' || !breaking) {
			paintWall(ctx, w, h);
			return;
		}

		let shards: Shard[] = shatterBox(w, h, {
			cols: Math.max(4, Math.round(w / 34)),
			rows: 5,
			impact: { x: w / 2, y: h / 2 }
		});
		const fill = css('--color-elevated', '#f5efe3');
		const edge = css('--color-text', '#2a241c');

		let raf = 0;
		let last = performance.now();
		const frame = (now: number) => {
			// Clamped: a backgrounded tab hands back one enormous delta, which
			// would throw every piece off screen in a single step.
			const dt = Math.min((now - last) / 1000, 1 / 30);
			last = now;
			ctx.clearRect(0, 0, w, h);
			const next: Shard[] = [];
			for (const s of shards) {
				const moved = stepShard(s, dt);
				if (isShardDead(moved)) continue;
				next.push(moved);
				ctx.save();
				ctx.globalAlpha = shardAlpha(moved);
				ctx.translate(moved.x + moved.w / 2, moved.y + moved.h / 2);
				ctx.rotate(moved.rot);
				ctx.fillStyle = fill;
				ctx.fillRect(-moved.w / 2, -moved.h / 2, moved.w, moved.h);
				ctx.strokeStyle = edge;
				ctx.globalAlpha = shardAlpha(moved) * 0.25;
				ctx.lineWidth = 2;
				ctx.strokeRect(-moved.w / 2, -moved.h / 2, moved.w, moved.h);
				ctx.restore();
			}
			shards = next;
			if (shards.length > 0) {
				raf = requestAnimationFrame(frame);
			} else {
				ctx.clearRect(0, 0, w, h);
				covering = false;
			}
		};
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	});
</script>

<!-- The content is always in the DOM and always readable to assistive tech;
     the wall is a canvas laid over it. Hiding the answer from a screen reader
     for the length of an animation would be hiding it for no reason. -->
<div bind:this={host} class="relative">
	{@render children()}
	<div
		class="pointer-events-none absolute inset-0"
		style={covering ? '' : 'display: none;'}
		class:clearing
	>
		<canvas
			bind:this={canvas}
			aria-hidden="true"
			data-testid="answer-wall"
			data-reveal={reveal}
			data-outcome={outcome}
			class="h-full w-full rounded-xl"
		></canvas>
		{#if stamped}
			<!-- Decoration: the verdict card under this block says the same thing
			     in Korean, and reading the stamp aloud after it would be saying
			     it twice. -->
			<div class="absolute inset-0 flex items-center justify-center" aria-hidden="true">
				{#if outcome === 'fail'}
					<span data-testid="wrong-stamp" class="stamp wrong">Wrong!</span>
				{:else}
					<span data-testid="correct-stamp" class="stamp right">Correct!</span>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	/* A stamp rather than a road sign: an octagon is the shape the word STOP
	   lives in, and this word is a verdict on an answer, not an instruction to
	   halt. Set at an angle because a stamp is never quite square to the page. */
	.stamp {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 6px 18px;
		border-width: 4px;
		border-style: solid;
		border-radius: 6px;
		font-size: 24px;
		font-weight: 900;
		letter-spacing: 0.04em;
		animation: wrong-stamp 220ms steps(4, end) both;
	}

	.wrong {
		border-color: var(--color-danger);
		background-color: color-mix(in srgb, var(--color-danger) 14%, var(--color-card));
		color: var(--color-danger);
	}

	/* 연두: the app's ribbon green lifted toward yellow. The ribbon tone is a
	   quiet olive made to sit under text as a bookmark; a verdict has to carry
	   the card, and next to the red of Wrong! a muted green reads as grey. */
	.right {
		--stamp-green: color-mix(in srgb, var(--color-ribbon-green) 62%, #a8d24e);
		border-color: var(--stamp-green);
		background-color: color-mix(in srgb, var(--stamp-green) 16%, var(--color-card));
		color: color-mix(in srgb, var(--stamp-green) 80%, var(--color-text));
	}

	/* Down and landing, not outward and scattering: the motion is the opposite
	   of the one a right answer earns. */
	@keyframes wrong-stamp {
		from {
			transform: rotate(-7deg) scale(2.1);
			opacity: 0;
		}
		to {
			transform: rotate(-7deg) scale(1);
			opacity: 1;
		}
	}

	.clearing {
		opacity: 0;
		transition: opacity 260ms ease-out;
	}

	@media (prefers-reduced-motion: reduce) {
		.stamp {
			animation: none;
			transform: rotate(-7deg);
		}
		.clearing {
			transition: none;
		}
	}
</style>
