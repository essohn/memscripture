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
	/** Seconds still to wait before this piece launches. Poppers that all go
	 *  off on the same frame read as one big burst; a beat between them reads
	 *  as four. Carried per-particle rather than as a queue in the component so
	 *  the whole effect stays one array of pure state. */
	delay: number;
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
	/** Seconds to hold this burst before it launches. */
	delay?: number;
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
			life: between(rng, 2.2, 3.6),
			delay: opts.delay ?? 0
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
	// Still in the barrel: the clock runs down but nothing else moves, so a
	// held piece neither drifts nor ages toward its fade before it is fired.
	if (p.delay > 0) return { ...p, delay: Math.max(0, p.delay - dt) };
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
	// A piece waiting its turn is not dead, however far off screen its origin
	// happens to be — it has not been thrown yet.
	if (p.delay > 0) return false;
	return p.age >= p.life || p.y > viewportHeight + 40;
}

/** Whether the piece has left the barrel and should be drawn. */
export function isLaunched(p: Particle): boolean {
	return p.delay <= 0;
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

/** Where the celebration goes off. Viewport coordinates, because the canvas
 *  is fixed to the viewport. */
export interface BurstOrigin {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/** Per popper: where along the origin it sits, which way it throws, and how
 *  long after the first one it goes off.
 *
 *  Outer pair first and angled steeply inward, inner pair a beat later and
 *  closer to vertical — so the spray opens outward from the verse rather than
 *  arriving as one wall, and the middle stays clear of the message. The
 *  offsets are small on purpose: far enough apart to read as four poppers,
 *  near enough to read as one celebration. */
const POPPERS = [
	{ fx: 0.06, fy: 0.98, angle: -Math.PI / 3, delay: 0 },
	{ fx: 0.94, fy: 0.98, angle: (-Math.PI * 2) / 3, delay: 0.05 },
	{ fx: 0.28, fy: 1.02, angle: -Math.PI / 2.35, delay: 0.13 },
	{ fx: 0.72, fy: 1.02, angle: -Math.PI / 1.74, delay: 0.19 }
];

/**
 * Four poppers along the bottom of the verse that earned them.
 *
 * Fired from the card rather than the corners of the screen: the celebration
 * belongs to one verse, and a burst from the edges of the display could be
 * about anything on it. `origin` is the card's rectangle; without one — the
 * card scrolled away, or a caller that has none — it falls back to the bottom
 * of the viewport, which is where this started.
 *
 * Speeds are lower than a screen-corner burst needed. From a card in the
 * middle of a tall phone the old throw carried the pieces off the top before
 * they could arc, so the spray was over before it was seen.
 */
export function celebrationBursts(
	width: number,
	height: number,
	origin?: BurstOrigin | null,
	rng?: Rng
): Particle[] {
	const box = origin ?? { left: 0, right: width, top: height * 0.9, bottom: height * 0.94 };
	const w = box.right - box.left;
	const h = box.bottom - box.top;
	const count = 45;

	return POPPERS.flatMap((p) =>
		createBurst({
			x: box.left + w * p.fx,
			y: box.top + h * p.fy,
			angle: p.angle,
			spread: 0.4,
			count,
			speed: [520, 980],
			delay: p.delay,
			rng
		})
	);
}

/** Honours the OS setting. The app already shortens its CSS transitions for
 *  reduced motion; a canvas full of flying paper cannot be exempt. */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
