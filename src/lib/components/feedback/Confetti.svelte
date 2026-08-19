<script lang="ts">
	import {
		celebrationBursts,
		flutterScale,
		isDead,
		particleAlpha,
		prefersReducedMotion,
		stepParticle,
		type Particle
	} from '$lib/effects/confetti';

	interface Props {
		/** Flip to true to fire once. Flipping back and true again fires again. */
		fire: boolean;
	}
	let { fire }: Props = $props();

	let canvas = $state<HTMLCanvasElement | undefined>();
	let running = $state(false);

	/**
	 * The palette is CSS custom properties, which canvas cannot read. Resolving
	 * them once per burst keeps the colours in one place — app.css — and lets
	 * them follow the dark theme without a second table here.
	 */
	function resolveColor(value: string, probe: HTMLElement): string {
		const name = value.match(/var\((--[^)]+)\)/)?.[1];
		if (!name) return value;
		return getComputedStyle(probe).getPropertyValue(name).trim() || '#c9a86a';
	}

	$effect(() => {
		if (!fire || !canvas || prefersReducedMotion()) return;

		const el = canvas;
		const ctx = el.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const w = window.innerWidth;
		const h = window.innerHeight;
		el.width = Math.floor(w * dpr);
		el.height = Math.floor(h * dpr);
		ctx.scale(dpr, dpr);

		let particles: Particle[] = celebrationBursts(w, h).map((p) => ({
			...p,
			color: resolveColor(p.color, el)
		}));

		running = true;
		let raf = 0;
		let last = performance.now();

		const frame = (now: number) => {
			// Clamped: a backgrounded tab hands back one enormous delta on return,
			// which would teleport every piece off screen in a single step.
			const dt = Math.min((now - last) / 1000, 1 / 30);
			last = now;

			ctx.clearRect(0, 0, w, h);
			const next: Particle[] = [];
			for (const p of particles) {
				const moved = stepParticle(p, dt);
				if (isDead(moved, h)) continue;
				next.push(moved);

				ctx.save();
				ctx.globalAlpha = particleAlpha(moved);
				ctx.translate(moved.x, moved.y);
				ctx.rotate(moved.rot);
				ctx.fillStyle = moved.color;
				const sw = moved.w * flutterScale(moved);
				ctx.fillRect(-sw / 2, -moved.h / 2, sw, moved.h);
				ctx.restore();
			}
			particles = next;

			if (particles.length > 0) {
				raf = requestAnimationFrame(frame);
			} else {
				ctx.clearRect(0, 0, w, h);
				running = false;
			}
		};
		raf = requestAnimationFrame(frame);

		return () => {
			cancelAnimationFrame(raf);
			running = false;
		};
	});
</script>

<!-- Fixed, non-interactive, and above the panel but below any dialog. Hidden
     from assistive tech: it is decoration, and the success message already
     says what happened. -->
<canvas
	bind:this={canvas}
	aria-hidden="true"
	data-testid="confetti"
	data-fire={fire}
	data-active={running}
	class="pointer-events-none fixed inset-0 z-[70] h-full w-full"
	style={running ? '' : 'display: none;'}
></canvas>
