<script lang="ts">
	import { arcade } from '$lib/state/arcade.svelte';
	import { isShardDead, shardAlpha, shatterBox, stepShard, type Shard } from '$lib/arcade/shatter';
	import type { Snippet } from 'svelte';

	interface Props {
		/** Flip to true to break the wall. Before that it stands. */
		broken: boolean;
		/** Painted on the wall while it stands. */
		label?: string;
		children: Snippet;
	}
	let { broken, label = '', children }: Props = $props();

	let host = $state<HTMLDivElement | undefined>();
	let canvas = $state<HTMLCanvasElement | undefined>();
	/** The wall is gone once the last piece has fallen; until then it covers
	 *  what it is hiding, whether standing or in flight. */
	let covering = $state(true);

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
		ctx.fillStyle = css('--color-elevated', '#f5efe3');
		ctx.fillRect(0, 0, w, h);
		ctx.strokeStyle = css('--color-text', '#2a241c');
		ctx.globalAlpha = 0.18;
		ctx.lineWidth = 2;
		for (let r = 0; r < rows; r++) {
			const offset = r % 2 === 0 ? 0 : -bw / 2;
			for (let x = offset; x < w; x += bw) {
				ctx.strokeRect(Math.round(x) + 1, Math.round(r * bh) + 1, Math.round(bw) - 2, Math.round(bh) - 2);
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

		if (!broken) {
			covering = true;
			paintWall(ctx, w, h);
			return;
		}

		// Motion off: the wall is simply not there. The reveal is the point;
		// the flying masonry is not.
		if (!arcade.motion) {
			covering = false;
			ctx.clearRect(0, 0, w, h);
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
	<canvas
		bind:this={canvas}
		aria-hidden="true"
		data-testid="shatter-wall"
		data-broken={broken}
		class="pointer-events-none absolute inset-0 h-full w-full rounded-xl"
		style={covering ? '' : 'display: none;'}
	></canvas>
</div>
