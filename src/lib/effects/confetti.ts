/**
 * Confetti for a flawless recitation.
 *
 * Hand-rolled rather than pulled from a package: the whole app ships around
 * 100KB gzipped and a celebration is not worth a dependency. The physics is
 * the part worth getting right, so it lives here as pure functions and the
 * component does nothing but run the clock and draw.
 */

export interface Particle {
	x: number;
	y: number;
	/** px per second. */
	vx: number;
	vy: number;
	/** Radians, and radians per second. */
	rot: number;
	vrot: number;
	/** Phase of the flutter that narrows the piece as it turns edge-on. */
	wobble: number;
	vwobble: number;
	w: number;
	h: number;
	color: string;
	/** Seconds lived, and total lifetime. */
	age: number;
	life: number;
}

/** Downward acceleration, px/s². Tuned by eye against a phone screen: real
 *  gravity in px would fling the pieces off the top. */
export const GRAVITY = 900;

/** Air resistance as a per-second retention factor. Paper loses its throw
 *  quickly, which is what stops the burst reading like fireworks. */
export const DRAG = 0.34;

/** Fraction of life spent at full opacity before fading. Fading from the
 *  first frame reads as a rendering fault rather than an effect. */
const OPAQUE_UNTIL = 0.55;

export type Rng = () => number;

function between(rng: Rng, lo: number, hi: number): number {
	return lo + rng() * (hi - lo);
}

/** The app's ribbon palette. Generic rainbow confetti would be the one place
 *  in the app that ignores its own colours. */
export const CONFETTI_COLORS = [
	'var(--color-ribbon-red)',
	'var(--color-ribbon-amber)',
	'var(--color-ribbon-green)',
	'var(--color-ribbon-blue)',
	'var(--color-accent)'
];

export interface BurstOptions {
	x: number;
	y: number;
	/** Direction in radians; -PI/2 is straight up. */
	angle: number;
	/** Half-width of the spray, in radians. */
	spread: number;
	count: number;
	speed: [number, number];
	colors?: string[];
	rng?: Rng;
}

export function createBurst(opts: BurstOptions): Particle[] {
	const rng = opts.rng ?? Math.random;
	const colors = opts.colors ?? CONFETTI_COLORS;
	const out: Particle[] = [];
	for (let i = 0; i < opts.count; i++) {
		const angle = opts.angle + between(rng, -opts.spread, opts.spread);
		const speed = between(rng, opts.speed[0], opts.speed[1]);
		out.push({
			x: opts.x,
			y: opts.y,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed,
			rot: between(rng, 0, Math.PI * 2),
			vrot: between(rng, -7, 7),
			wobble: between(rng, 0, Math.PI * 2),
			vwobble: between(rng, 4, 9),
			w: between(rng, 6, 11),
			h: between(rng, 8, 15),
			color: colors[Math.floor(rng() * colors.length) % colors.length],
			age: 0,
			life: between(rng, 2.2, 3.6)
		});
	}
	return out;
}

/**
 * Advances one particle by `dt` seconds. Returns a new object rather than
 * mutating, so a step can be reasoned about — and tested — on its own.
 *
 * Drag is applied as an exponential decay rather than a subtraction, which is
 * what keeps a fast piece and a slow one from decelerating at the same rate.
 */
export function stepParticle(p: Particle, dt: number): Particle {
	const decay = Math.pow(DRAG, dt);
	const vx = p.vx * decay;
	const vy = (p.vy + GRAVITY * dt) * decay;
	return {
		...p,
		x: p.x + vx * dt,
		y: p.y + vy * dt,
		vx,
		vy,
		rot: p.rot + p.vrot * dt,
		wobble: p.wobble + p.vwobble * dt,
		age: p.age + dt
	};
}

/** Opaque for the first stretch of life, then eased out. */
export function particleAlpha(p: Particle): number {
	const t = p.life <= 0 ? 1 : p.age / p.life;
	if (t <= OPAQUE_UNTIL) return 1;
	const fade = (t - OPAQUE_UNTIL) / (1 - OPAQUE_UNTIL);
	return Math.max(0, 1 - fade * fade);
}

export function isDead(p: Particle, viewportHeight: number): boolean {
	return p.age >= p.life || p.y > viewportHeight + 40;
}

/**
 * The piece's apparent width as it tumbles.
 *
 * A rectangle spinning only in the plane of the screen looks like a spinning
 * rectangle. Squeezing its width as it turns edge-on is what sells it as a
 * scrap of paper flipping in three dimensions, and it costs one cosine.
 */
export function flutterScale(p: Particle): number {
	return Math.abs(Math.cos(p.wobble));
}

/** Two poppers angled inward from the lower corners, which keeps the spray
 *  clear of the message in the middle. */
export function celebrationBursts(width: number, height: number, rng?: Rng): Particle[] {
	const count = 70;
	return [
		...createBurst({
			x: width * 0.08,
			y: height * 0.92,
			angle: -Math.PI / 3,
			spread: 0.42,
			count,
			speed: [700, 1250],
			rng
		}),
		...createBurst({
			x: width * 0.92,
			y: height * 0.92,
			angle: (-Math.PI * 2) / 3,
			spread: 0.42,
			count,
			speed: [700, 1250],
			rng
		})
	];
}

/** Honours the OS setting. The app already shortens its CSS transitions for
 *  reduced motion; a canvas full of flying paper cannot be exempt. */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
