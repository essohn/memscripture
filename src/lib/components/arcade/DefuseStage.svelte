<script lang="ts">
	import { arcade } from '$lib/state/arcade.svelte';
	import { remainingMs } from '$lib/arcade/clock';
	import { defusePhase } from '$lib/arcade/defuse';
	import { drawFire, drawScanlines, drawSprite } from '$lib/arcade/draw';

	interface Props {
		/** Date.now() when the round appeared. */
		startedAt: number;
		limitMs: number;
		/** null while the round is live. */
		outcome?: 'defused' | 'blown' | null;
	}
	let { startedAt, limitMs, outcome = null }: Props = $props();

	let canvas = $state<HTMLCanvasElement | undefined>();

	/**
	 * The bomb, as a bitmap, with a hole in the middle for its clock.
	 *
	 * 시작 3단어's bomb falls and is shot down; this one sits on the desk and
	 * counts, because the round it belongs to asks for a whole verse and a
	 * falling object would have to fall for two minutes. Same grammar, opposite
	 * posture.
	 */
	const TIMEBOMB = [
		'.....X.....',
		'....XX.....',
		'...XXXXX...',
		'..XXXXXXX..',
		'.XX.....XX.',
		'.XX.....XX.',
		'..XXXXXXX..',
		'...XXXXX...',
		'....XXX....'
	];
	/**
	 * The rows the sprite leaves empty for the clock.
	 *
	 * Named rather than eyeballed: the window's centre is not the sprite's,
	 * and putting the digits at the sprite's centre drew them a whole block
	 * above the hole, over the body, where they were unreadable.
	 */
	const WINDOW_ROWS = [4, 5] as const;

	/** Set the frame the round is decided, so the blast can be drawn for a
	 *  moment after the answer has already landed. */
	let endedAt = 0;
	$effect(() => {
		if (outcome !== null && endedAt === 0) endedAt = performance.now();
	});
	/** Frozen at the verdict: a clock that kept running under a defused bomb
	 *  would be counting down to nothing. */
	let stoppedMs = 0;
	$effect(() => {
		if (outcome !== null && stoppedMs === 0) stoppedMs = Date.now() - startedAt;
	});

	function css(name: string, fallback: string): string {
		if (!canvas) return fallback;
		return getComputedStyle(canvas).getPropertyValue(name).trim() || fallback;
	}

	/** m:ss under a minute is more digits than the number deserves; over one,
	 *  bare seconds stop being a length anyone can feel. */
	function clockText(ms: number): string {
		const total = Math.ceil(ms / 1000);
		if (total < 60) return String(total);
		return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
	}

	$effect(() => {
		const el = canvas;
		if (!el) return;
		const context2d = el.getContext('2d');
		if (!context2d) return;
		// Re-bound non-nullable: the frame callback runs later, where narrowing
		// from the guard above does not reach.
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
			ctx.imageSmoothingEnabled = false;
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(el);

		const ink = () => css('--color-text', '#2a241c');
		const sky = () => css('--color-elevated', '#f5efe3');
		const hot = () => css('--color-ribbon-red', '#b5654e');
		const ember = () => css('--color-ribbon-amber', '#d4a55a');
		const safe = () => css('--color-ribbon-green', '#6b8e5a');

		let raf = 0;
		const frame = (now: number) => {
			const elapsed = outcome === null ? Date.now() - startedAt : stoppedMs;
			const left = remainingMs(elapsed, limitMs);
			const phase = defusePhase(elapsed, limitMs);
			const since = endedAt === 0 ? 0 : (now - endedAt) / 1000;

			ctx.clearRect(0, 0, w, h);
			ctx.fillStyle = sky();
			ctx.fillRect(0, 0, w, h);

			const ground = h - 6;
			ctx.globalAlpha = 0.5;
			ctx.fillStyle = ink();
			ctx.fillRect(0, ground, w, 1);
			ctx.globalAlpha = 1;
			drawScanlines(ctx, w, h, ink());

			// The last stretch pulses, so the clock is felt as well as read.
			if (phase === 'alarm' && outcome === null) {
				ctx.globalAlpha = 0.1 + 0.1 * Math.abs(Math.sin(now / 130));
				ctx.fillStyle = hot();
				ctx.fillRect(0, 0, w, h);
				ctx.globalAlpha = 1;
			}

			const px = Math.max(4, Math.floor(Math.min(w, h) / 16));
			const cx = w / 2;
			const cy = ground - (TIMEBOMB.length * px) / 2 - px;

			if (outcome !== 'blown') {
				const body = outcome === 'defused' ? safe() : ink();
				drawSprite(ctx, TIMEBOMB, px, cx, cy, body);

				// The clock, in the window the sprite leaves for it — a dark panel
				// with lit digits, because that is what a readout is. Ink on the
				// body's own colour was two darks on top of each other.
				const winW = px * 5;
				const winH = px * 2;
				const winY =
					cy + ((WINDOW_ROWS[0] + WINDOW_ROWS[1] + 1) / 2 - TIMEBOMB.length / 2) * px;
				ctx.fillStyle = ink();
				ctx.fillRect(Math.round(cx - winW / 2), Math.round(winY - winH / 2), winW, winH);
				ctx.fillStyle =
					outcome === 'defused' ? safe() : phase === 'alarm' ? hot() : ember();
				ctx.font = `700 ${Math.round(px * 1.4)}px ui-monospace, SFMono-Regular, monospace`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(clockText(left), cx, winY + 1);

				// A defused bomb says so in its own colour, once, rather than
				// flashing on: the wash fades in over the frame that follows.
				if (outcome === 'defused') {
					ctx.globalAlpha = Math.max(0, 0.3 - since * 0.5);
					ctx.fillStyle = safe();
					ctx.fillRect(0, 0, w, h);
					ctx.globalAlpha = 1;
				}
			} else {
				// Blown: the blast, then fire across the ground.
				const t = since;
				const radius = t * 520;
				const alpha = Math.max(0, 1 - t / 0.45);
				if (alpha > 0) {
					ctx.globalAlpha = alpha;
					for (const [i, colour] of [hot(), ember(), ink()].entries()) {
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
				drawFire(ctx, w, h, { seconds: t, ground, hot: hot(), ember: ember() });
				const wash = Math.min(0.42, t * 1.2);
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
			// Motion off: one still frame per state change. The clock is still
			// running — the countdown beside the board keeps saying so.
			frame(performance.now());
		}

		return () => {
			ro.disconnect();
			if (raf) cancelAnimationFrame(raf);
		};
	});
</script>

<div class="relative mt-3">
	<canvas
		bind:this={canvas}
		aria-hidden="true"
		data-testid="defuse-stage"
		data-outcome={outcome ?? 'live'}
		class="mx-auto aspect-square w-full max-w-[300px] rounded-xl border-2 border-[var(--color-text)]/15"
	></canvas>
	{#if outcome === 'blown'}
		<!-- DOM rather than painted into the fire: crisp at any text size, and
		     legible with the motion off, where the frame behind it is a still. -->
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
