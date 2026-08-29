<script lang="ts">
	import { arcade } from '$lib/state/arcade.svelte';
	import { RAID_LIMIT_MS, raidApproach, raidLane, raidPhase } from '$lib/arcade/raid';
	import { drawFire, drawScanlines, drawSprite } from '$lib/arcade/draw';

	interface Props {
		/** Date.now() when the round appeared. */
		startedAt: number;
		limitMs?: number;
		/** null while the round is live. */
		outcome?: 'destroyed' | 'impact' | null;
	}
	let { startedAt, limitMs = RAID_LIMIT_MS, outcome = null }: Props = $props();

	let canvas = $state<HTMLCanvasElement | undefined>();

	/** Where this round's bomb comes down. Drawn once, at mount: the component
	 *  is keyed per verse, so once is once a round. */
	const lane = raidLane();

	/**
	 * The bomb, as a bitmap.
	 *
	 * Blocks rather than a path, drawn at whole-pixel sizes and at one size
	 * throughout: it falls down the stage rather than growing toward the
	 * reader, so there is no perspective to fake and nothing to scale. A sprite
	 * that swelled as it came was doing a cheap 2.5D that neither the rest of
	 * this stage nor the app it sits in has anywhere else.
	 */
	const BOMB = [
		'X.X.X',
		'.XXX.',
		'XXXXX',
		'XXXXX',
		'XXXXX',
		'.XXX.',
		'..X..'
	];
	/** Edge of one sprite block. */
	const PX = 5;

	/** Set the frame the round is decided, so the beam and the blast can be
	 *  drawn for a moment after the answer has already landed. */
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
		const context2d = el.getContext('2d');
		if (!context2d) return;
		// Re-bound as a non-nullable const: the helpers below are called from a
		// frame callback, and narrowing from the guard above does not reach
		// into a function that might run later.
		const ctx: CanvasRenderingContext2D = context2d;

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
			// Nearest-neighbour, so the sprite stays a grid of squares.
			ctx.imageSmoothingEnabled = false;
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(el);

		const ink = () => css('--color-text', '#2a241c');
		const sky = () => css('--color-elevated', '#f5efe3');
		const hot = () => css('--color-ribbon-red', '#b5654e');
		const ember = () => css('--color-ribbon-amber', '#d4a55a');
		const beam = () => css('--color-accent', '#c9a86a');

		const spriteH = BOMB.length * PX;
		/** Where the ground is. The bomb falls to it and the fire sits on it. */
		const ground = () => h - 6;



		let raf = 0;
		const frame = (now: number) => {
			const elapsed = Date.now() - startedAt;
			const approach = raidApproach(elapsed, limitMs);
			const phase = raidPhase(elapsed, limitMs);
			const since = struckAt === 0 ? 0 : (now - struckAt) / 1000;

			ctx.clearRect(0, 0, w, h);
			ctx.fillStyle = sky();
			ctx.fillRect(0, 0, w, h);

			// The ground, then a CRT wash over everything.
			ctx.globalAlpha = 0.5;
			ctx.fillStyle = ink();
			ctx.fillRect(0, ground(), w, 1);
			ctx.globalAlpha = 1;
			drawScanlines(ctx, w, h, ink());

			// Alarm: the sky pulses as the bomb nears the ground. Kept to the
			// last stretch so it means something when it starts.
			if (phase === 'alarm' && outcome === null) {
				ctx.globalAlpha = 0.1 + 0.1 * Math.abs(Math.sin(now / 140));
				ctx.fillStyle = hot();
				ctx.fillRect(0, 0, w, h);
				ctx.globalAlpha = 1;
			}

			const cx = w * lane;
			// Straight down: off the top edge to the ground, at one size.
			const cy = -spriteH / 2 + (ground() - PX - (-spriteH / 2)) * approach;

			if (outcome === null) {
				drawSprite(ctx, BOMB, PX, cx, cy, ink());
			} else if (outcome === 'destroyed') {
				// The beam first, then the blast: a shot that arrives after the
				// explosion reads as the bomb having gone off by itself.
				if (since < 0.14) {
					// From the gun at the foot of the board, up at wherever the bomb
					// was. Straight up would only ever be right when the bomb came
					// down the middle, which it no longer does.
					ctx.strokeStyle = beam();
					ctx.lineWidth = PX;
					ctx.lineCap = 'round';
					ctx.beginPath();
					ctx.moveTo(w / 2, ground());
					ctx.lineTo(cx, cy);
					ctx.stroke();
				}
				const t = Math.max(0, since - 0.08);
				const radius = t * 460;
				const alpha = Math.max(0, 1 - t / 0.5);
				if (alpha > 0) {
					// Concentric squares, not circles: the blast is made of the
					// same pixels the bomb was.
					ctx.globalAlpha = alpha;
					for (const [i, colour] of [hot(), ember(), beam()].entries()) {
						const s = radius * (1 - i * 0.24);
						if (s <= 0) continue;
						ctx.fillStyle = colour;
						ctx.fillRect(
							Math.round(cx - s / 2),
							Math.round(cy - s / 2),
							Math.round(s),
							Math.round(s)
						);
					}
					ctx.globalAlpha = 1;
				}
			} else {
				// The bomb landed. Fire fills the ground and the sky goes red.
				drawFire(ctx, w, h, { seconds: since, ground: ground(), hot: hot(), ember: ember() });
				const wash = Math.min(0.42, since * 1.2);
				ctx.globalAlpha = wash;
				ctx.fillStyle = hot();
				ctx.fillRect(0, 0, w, h);
				ctx.globalAlpha = 1;
			}

			raf = requestAnimationFrame(frame);
		};

		if (arcade.motion) {
			raf = requestAnimationFrame(frame);
		} else {
			// Motion off: one still frame. The round is still timed — the reader
			// loses the bomb, not the clock, and the countdown beside the stage
			// keeps saying so.
			frame(performance.now());
		}

		return () => {
			ro.disconnect();
			if (raf) cancelAnimationFrame(raf);
		};
	});
</script>

<div class="relative mt-3">
	<!-- Decoration with a clock in it: the seconds are announced by the round's
	     own live region, so the canvas is hidden rather than read twice. -->
	<canvas
		bind:this={canvas}
		aria-hidden="true"
		data-testid="raid-stage"
		data-outcome={outcome ?? 'live'}
		class="mx-auto aspect-square w-full max-w-[300px] rounded-xl border-2 border-[var(--color-text)]/15"
	></canvas>
	{#if outcome === 'impact'}
		<!-- Drawn as DOM rather than into the fire, so it stays crisp at any
		     text size and legible with the motion off — the frame behind it is
		     then a still, and a word painted into a still is all the reader
		     gets. The verdict card below says it in Korean; this is the
		     arcade's own word for the same thing. -->
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<span data-testid="stage-fail" class="fail">Fail</span>
		</div>
	{/if}
</div>

<style>
	.fail {
		color: #fff;
		font-size: 30px;
		font-weight: 900;
		letter-spacing: 0.06em;
		/* Read against fire: a dark rim rather than a panel, so the flames go on
		   showing through around the letters. */
		text-shadow:
			0 2px 0 rgba(0, 0, 0, 0.55),
			0 0 14px rgba(0, 0, 0, 0.45);
		animation: fail-drop 260ms steps(4, end) both;
	}

	@keyframes fail-drop {
		from {
			transform: translateY(-14px) scale(1.5);
			opacity: 0;
		}
		to {
			transform: none;
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.fail {
			animation: none;
		}
	}
</style>
