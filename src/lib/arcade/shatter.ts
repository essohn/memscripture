/**
 * A rectangle coming apart, for the moment an answer lands.
 *
 * The same shape as effects/confetti.ts and for the same reason: the physics
 * is the part worth getting right, so it lives here as pure functions and the
 * component does nothing but run the clock and draw. Confetti is a shower from
 * outside the card; this is the card's own text breaking where it stands, so
 * the pieces are a grid of the box rather than a spray of paper.
 */

export interface Shard {
	/** Top-left of the piece, in the box's own coordinates. */
	x: number;
	y: number;
	/** px per second. */
	vx: number;
	vy: number;
	/** Radians, and radians per second. */
	rot: number;
	vrot: number;
	w: number;
	h: number;
	/** Seconds lived, and total lifetime. */
	age: number;
	life: number;
}

/** Downward acceleration, px/s². Heavier than confetti's: these are meant to
 *  read as masonry, not paper. */
export const SHARD_GRAVITY = 1400;

/** How hard the blast throws the nearest pieces, px/s. */
const BLAST_SPEED = 520;
/** How much of that the furthest piece keeps. A uniform blast reads as an
 *  explosion under the whole wall rather than one point in it. */
const FAR_SHARE = 0.35;

export type Rng = () => number;

export interface ShatterOptions {
	cols?: number;
	rows?: number;
	/** Where the blow landed, in box coordinates. Defaults to the middle. */
	impact?: { x: number; y: number };
	rng?: Rng;
}

/**
 * Break a box into a grid of pieces, each thrown away from the impact.
 *
 * The grid tiles the box exactly — every piece starts over the cell it came
 * from — so the first frame of the effect is indistinguishable from the box
 * that was there a moment ago. Anything else and the wall appears to jump
 * before it breaks.
 */
export function shatterBox(width: number, height: number, opts: ShatterOptions = {}): Shard[] {
	const cols = Math.max(1, Math.floor(opts.cols ?? 8));
	const rows = Math.max(1, Math.floor(opts.rows ?? 4));
	const rng = opts.rng ?? Math.random;
	const cw = width / cols;
	const ch = height / rows;
	const impact = opts.impact ?? { x: width / 2, y: height / 2 };
	// The furthest a piece's centre can be from the impact, used to scale the
	// blast. Guarded so a box with no area cannot divide by zero.
	const reach = Math.max(1, Math.hypot(width, height) / 2);

	const shards: Shard[] = [];
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const x = c * cw;
			const y = r * ch;
			const dx = x + cw / 2 - impact.x;
			const dy = y + ch / 2 - impact.y;
			const dist = Math.hypot(dx, dy) || 1;
			const near = 1 - Math.min(1, dist / reach) * (1 - FAR_SHARE);
			const speed = BLAST_SPEED * near * (0.7 + rng() * 0.6);
			shards.push({
				x,
				y,
				vx: (dx / dist) * speed,
				// Biased upward: pieces thrown flat slide off the sides, and the
				// eye reads a wall coming apart as going up before it comes down.
				vy: (dy / dist) * speed - 160,
				rot: 0,
				vrot: (rng() - 0.5) * 8,
				w: cw,
				h: ch,
				age: 0,
				life: 0.75 + rng() * 0.35
			});
		}
	}
	return shards;
}

export function stepShard(s: Shard, dt: number): Shard {
	return {
		...s,
		x: s.x + s.vx * dt,
		y: s.y + s.vy * dt,
		vy: s.vy + SHARD_GRAVITY * dt,
		rot: s.rot + s.vrot * dt,
		age: s.age + dt
	};
}

/** Linear, unlike confetti's hold-then-fade: masonry that held its colour and
 *  then vanished would read as the pieces being deleted. */
export function shardAlpha(s: Pick<Shard, 'age' | 'life'>): number {
	if (s.life <= 0) return 0;
	return Math.min(1, Math.max(0, 1 - s.age / s.life));
}

export function isShardDead(s: Pick<Shard, 'age' | 'life'>): boolean {
	return s.age >= s.life;
}
