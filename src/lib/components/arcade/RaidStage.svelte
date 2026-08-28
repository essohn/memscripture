<script lang="ts">
	import { arcade } from '$lib/state/arcade.svelte';
	import { RAID_LIMIT_MS, raidApproach, raidPhase } from '$lib/arcade/raid';

	interface Props {
		/** Date.now() when the round appeared. */
		startedAt: number;
		limitMs?: number;
		/** null while the round is live. */
		outcome?: 'destroyed' | 'impact' | null;
	}
	let { startedAt, limitMs = RAID_LIMIT_MS, outcome = null }: Props = $props();

	let canvas = $state<HTMLCanvasElement | undefined>();

	/**
	 * The raider, as a bitmap.
	 *
	 * Blocks rather than a path, and drawn at whole-pixel sizes: an arcade
	 * sprite is a grid, and a smoothly antialiased vector aeroplane would be
	 * the one thing on screen that had never seen a cabinet.
	 */
	const RAIDER = [
		'...X...',
		'...X...',
		'XXXXXXX',
		'XXXXXXX',
		'.XX.XX.',
		'...X...',
		'..X.X..'
	];

	/** Set the frame the shot lands, so the beam and the blast can be drawn for
	 *  a moment after the round has already been decided. */
	let struckAt = 0;
	$effect(() => {
		if (outcome !== null && struckAt === 0) struckAt = performance.now();
	});

	function css(name: string, fallback: string): string {
		if (!canvas) return fallback;
		return getComputedStyle(canvas).getPropertyValue(name).trim() || fallback;
	}

	$effect(() => {
		const el = canvas;
		if (!el) return;
		const ctx = el.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		let w = 0;
		let h = 0;
		const resize = () => {
			const box = el.getBoundingClientRect();
			w = box.width;
			h = box.height;
			el.width = Math.max(1, Math.floor(w * dpr));
			el.height = Math.max(1, Math.floor(h * dpr));
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			// Nearest-neighbour, so a sprite scaled up stays a grid of squares.
			ctx.imageSmoothingEnabled = false;
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(el);

		const ink = () => css('--color-text', '#2a241c');
		const sky = () => css('--color-elevated', '#f5efe3');
		const hot = () => css('--color-ribbon-red', '#b5654e');
		const beam = () => css('--color-accent', '#c9a86a');

		let raf = 0;
		const frame = (now: number) => {
			const elapsed = Date.now() - startedAt;
			const approach = raidApproach(elapsed, limitMs);
			const phase = raidPhase(elapsed, limitMs);
			const sinceHit = struckAt === 0 ? 0 : (now - struckAt) / 1000;

			ctx.clearRect(0, 0, w, h);
			ctx.fillStyle = sky();
			ctx.fillRect(0, 0, w, h);

			// The horizon, and a scanline wash over everything below it. Two
			// pixels on, two off — the cheapest honest CRT.
			ctx.globalAlpha = 0.5;
			ctx.fillStyle = ink();
			ctx.fillRect(0, h * 0.62, w, 1);
			ctx.globalAlpha = 0.06;
			for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
			ctx.globalAlpha = 1;

			// Alarm: the sky pulses as the raider closes. Kept to the last
			// stretch so it means something when it starts.
			if (phase === 'alarm' && outcome === null) {
				ctx.globalAlpha = 0.1 + 0.1 * Math.abs(Math.sin(now / 140));
				ctx.fillStyle = hot();
				ctx.fillRect(0, 0, w, h);
				ctx.globalAlpha = 1;
			}

			const px = Math.max(1, Math.round((2 + approach * 6) * 1));
			const spriteW = RAIDER[0].length * px;
			const spriteH = RAIDER.length * px;
			// Straight down the middle, from the horizon to the reader's edge.
			const cx = w / 2;
			const cy = h * 0.18 + (h * 0.7 - h * 0.18) * approach;

			const drawRaider = () => {
				ctx.fillStyle = ink();
				for (let r = 0; r < RAIDER.length; r++) {
					for (let c = 0; c < RAIDER[r].length; c++) {
						if (RAIDER[r][c] !== 'X') continue;
						ctx.fillRect(
							Math.round(cx - spriteW / 2 + c * px),
							Math.round(cy - spriteH / 2 + r * px),
							px,
							px
						);
					}
				}
			};

			if (outcome === null) {
				drawRaider();
			} else if (outcome === 'destroyed') {
				// The beam first, then the blast: a shot that arrives after the
				// explosion reads as the raider having died of its own accord.
				if (sinceHit < 0.12) {
					ctx.fillStyle = beam();
					ctx.fillRect(Math.round(cx - px / 2), cy, Math.max(2, px), h - cy);
				}
				const t = Math.max(0, sinceHit - 0.06);
				const radius = t * 420;
				const alpha = Math.max(0, 1 - t / 0.55);
				if (alpha > 0) {
					// Concentric squares, not circles: the blast is made of the
					// same pixels the raider was.
					ctx.globalAlpha = alpha;
					for (const [i, colour] of [hot(), beam(), ink()].entries()) {
						const s = radius * (1 - i * 0.22);
						if (s <= 0) continue;
						ctx.fillStyle = colour;
						ctx.fillRect(Math.round(cx - s / 2), Math.round(cy - s / 2), Math.round(s), Math.round(s));
					}
					ctx.globalAlpha = 1;
				}
			} else {
				// Impact: the raider got through, and the screen wears it.
				const alpha = Math.max(0, 0.55 - sinceHit * 0.6);
				drawRaider();
				if (alpha > 0) {
					ctx.globalAlpha = alpha;
					ctx.fillStyle = hot();
					ctx.fillRect(0, 0, w, h);
					ctx.globalAlpha = 1;
				}
			}

			raf = requestAnimationFrame(frame);
		};

		if (arcade.motion) {
			raf = requestAnimationFrame(frame);
		} else {
			// Motion off: one still frame, redrawn only when the phase changes.
			// The round is still timed — the reader loses the raider, not the
			// clock, which the bar below the stage keeps showing.
			frame(performance.now());
			cancelAnimationFrame(raf);
			raf = 0;
		}

		return () => {
			ro.disconnect();
			if (raf) cancelAnimationFrame(raf);
		};
	});

</script>

<!-- Decoration with a number in it: the seconds are announced by the round's
     own live region, so this is hidden rather than read twice. -->
<canvas
	bind:this={canvas}
	aria-hidden="true"
	data-testid="raid-stage"
	data-outcome={outcome ?? 'live'}
	class="mt-3 h-[104px] w-full rounded-xl border-2 border-[var(--color-text)]/15"
></canvas>
