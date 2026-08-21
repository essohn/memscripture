import { describe, expect, it } from 'vitest';
import {
	GRAVITY,
	celebrationBursts,
	createBurst,
	flutterScale,
	isDead,
	particleAlpha,
	stepParticle,
	isLaunched,
	type Particle
} from '../../src/lib/effects/confetti';

/** Deterministic rng so a physics test cannot pass or fail by luck. */
function seeded(seed = 1): () => number {
	let s = seed;
	return () => {
		s = (s * 1103515245 + 12345) % 2147483648;
		return s / 2147483648;
	};
}

const burst = (over: Partial<Particle> = {}): Particle => ({
	x: 0,
	y: 0,
	vx: 100,
	vy: -400,
	rot: 0,
	vrot: 1,
	wobble: 0,
	vwobble: 5,
	w: 8,
	h: 12,
	color: 'red',
	age: 0,
	life: 3,
	delay: 0,
	...over
});

describe('createBurst', () => {
	it('makes the number asked for', () => {
		expect(createBurst({ x: 0, y: 0, angle: -Math.PI / 2, spread: 0.4, count: 25, speed: [500, 900], rng: seeded() })).toHaveLength(25);
	});

	it('throws them upward when aimed up', () => {
		const ps = createBurst({ x: 0, y: 0, angle: -Math.PI / 2, spread: 0.3, count: 40, speed: [500, 900], rng: seeded() });
		expect(ps.every((p) => p.vy < 0)).toBe(true);
	});

	// A spread of zero would be a single stream; the point is a spray.
	it('spreads them across a range of directions', () => {
		const ps = createBurst({ x: 0, y: 0, angle: -Math.PI / 2, spread: 0.5, count: 60, speed: [600, 600], rng: seeded() });
		const angles = new Set(ps.map((p) => Math.round(Math.atan2(p.vy, p.vx) * 20)));
		expect(angles.size).toBeGreaterThan(5);
	});

	it('gives every piece a size, a lifetime and a colour', () => {
		const ps = createBurst({ x: 0, y: 0, angle: 0, spread: 0.2, count: 20, speed: [100, 200], rng: seeded() });
		expect(ps.every((p) => p.w > 0 && p.h > 0 && p.life > 0 && p.color)).toBe(true);
	});
});

describe('stepParticle', () => {
	it('does not mutate the particle it is given', () => {
		const p = burst();
		const before = { ...p };
		stepParticle(p, 0.016);
		expect(p).toEqual(before);
	});

	it('pulls the piece downward over time', () => {
		let p = burst({ vy: 0, vx: 0 });
		for (let i = 0; i < 30; i++) p = stepParticle(p, 1 / 60);
		expect(p.vy).toBeGreaterThan(0);
		expect(p.y).toBeGreaterThan(0);
	});

	// Without drag the burst reads like fireworks: everything keeps its throw
	// all the way across the screen.
	it('bleeds off horizontal speed', () => {
		let p = burst({ vx: 800, vy: 0 });
		for (let i = 0; i < 60; i++) p = stepParticle(p, 1 / 60);
		expect(p.vx).toBeLessThan(800 * 0.6);
		expect(p.vx).toBeGreaterThan(0);
	});

	// Exponential drag, not subtractive: a fast piece and a slow one must not
	// lose the same amount of speed per second.
	it('slows a fast piece by more than a slow one', () => {
		const fast = stepParticle(burst({ vx: 900, vy: 0 }), 0.1);
		const slow = stepParticle(burst({ vx: 90, vy: 0 }), 0.1);
		expect(900 - fast.vx).toBeGreaterThan(90 - slow.vx);
	});

	it('reaches a downward terminal speed rather than accelerating forever', () => {
		let p = burst({ vx: 0, vy: 0 });
		for (let i = 0; i < 240; i++) p = stepParticle(p, 1 / 60);
		expect(p.vy).toBeLessThan(GRAVITY);
	});

	it('keeps turning and fluttering', () => {
		const p = stepParticle(burst(), 0.5);
		expect(p.rot).not.toBe(0);
		expect(p.wobble).not.toBe(0);
	});
});

describe('particleAlpha', () => {
	// Fading from the first frame reads as a rendering fault, not an effect.
	it('is fully opaque at the start', () => {
		expect(particleAlpha(burst({ age: 0, life: 3 }))).toBe(1);
	});

	it('has faded away by the end of life', () => {
		expect(particleAlpha(burst({ age: 3, life: 3 }))).toBe(0);
	});

	it('falls off smoothly in between, never rising', () => {
		let last = 1;
		for (let age = 0; age <= 3; age += 0.1) {
			const a = particleAlpha(burst({ age, life: 3 }));
			expect(a).toBeLessThanOrEqual(last + 1e-9);
			expect(a).toBeGreaterThanOrEqual(0);
			last = a;
		}
	});
});

describe('flutterScale', () => {
	// A rectangle spinning in the plane of the screen looks like a spinning
	// rectangle; narrowing it as it turns edge-on is what sells paper.
	it('is widest face-on and vanishes edge-on', () => {
		expect(flutterScale(burst({ wobble: 0 }))).toBeCloseTo(1);
		expect(flutterScale(burst({ wobble: Math.PI / 2 }))).toBeCloseTo(0);
	});

	it('never goes negative, which would draw the piece inside out', () => {
		for (let w = 0; w < 10; w += 0.3) {
			expect(flutterScale(burst({ wobble: w }))).toBeGreaterThanOrEqual(0);
		}
	});
});

describe('isDead', () => {
	it('retires a piece at the end of its life', () => {
		expect(isDead(burst({ age: 3.1, life: 3 }), 800)).toBe(true);
	});

	// Otherwise a long-lived piece keeps being stepped and drawn far below the
	// fold, for nobody.
	it('retires one that has fallen past the screen', () => {
		expect(isDead(burst({ y: 900 }), 800)).toBe(true);
	});

	it('keeps a live one on screen', () => {
		expect(isDead(burst({ age: 0.5, life: 3, y: 100 }), 800)).toBe(false);
	});
});

describe('celebrationBursts', () => {
	/** A verse card partway down a phone screen. */
	const CARD = { left: 20, right: 370, top: 300, bottom: 460 };

	// The outer pair is what keeps the middle clear of the message: whatever
	// the inner two do, these two must throw across the card, not off it.
	it('aims the outer poppers inward', () => {
		const ps = celebrationBursts(390, 844, CARD, seeded());
		const xs = [...new Set(ps.map((p) => p.x))].sort((a, b) => a - b);
		const outerLeft = ps.filter((p) => p.x === xs[0]);
		const outerRight = ps.filter((p) => p.x === xs[xs.length - 1]);
		expect(outerLeft.every((p) => p.vx > 0)).toBe(true);
		expect(outerRight.every((p) => p.vx < 0)).toBe(true);
	});

	// The inner pair is close to vertical on purpose — it fans both ways, so
	// the spray opens out instead of arriving as one wall.
	it('throws the inner poppers mostly upward', () => {
		const ps = celebrationBursts(390, 844, CARD, seeded());
		const xs = [...new Set(ps.map((p) => p.x))].sort((a, b) => a - b);
		const inner = ps.filter((p) => p.x === xs[1] || p.x === xs[2]);
		expect(inner.every((p) => Math.abs(p.vy) > Math.abs(p.vx))).toBe(true);
	});

	it('starts everything heading up', () => {
		expect(celebrationBursts(390, 844, CARD, seeded()).every((p) => p.vy < 0)).toBe(true);
	});

	// The celebration belongs to one verse. A burst from the corners of the
	// display could be about anything on it.
	it('goes off at the verse, not at the screen', () => {
		const ps = celebrationBursts(390, 844, CARD, seeded());
		expect(ps.every((p) => p.x >= CARD.left - 1 && p.x <= CARD.right + 1)).toBe(true);
		expect(ps.every((p) => p.y >= CARD.top && p.y <= CARD.bottom + 10)).toBe(true);
	});

	it('falls back to the foot of the screen with no card', () => {
		const ps = celebrationBursts(390, 844, null, seeded());
		expect(ps.every((p) => p.y > 422 && p.vy < 0)).toBe(true);
	});

	// Four poppers, not two, and not all on the same frame — simultaneous
	// launches read as one big burst rather than as four.
	it('fires four poppers from four places', () => {
		const ps = celebrationBursts(390, 844, CARD, seeded());
		expect(new Set(ps.map((p) => `${p.x},${p.y}`)).size).toBe(4);
	});

	it('staggers them by a beat, starting immediately', () => {
		const delays = [...new Set(celebrationBursts(390, 844, CARD, seeded()).map((p) => p.delay))];
		expect(delays).toHaveLength(4);
		expect(Math.min(...delays)).toBe(0);
		// Short enough to read as one celebration rather than four events.
		expect(Math.max(...delays)).toBeLessThan(0.35);
	});
});

describe('a held particle', () => {
	it('does not move or age while it waits', () => {
		const held = stepParticle(burst({ delay: 0.2, x: 10, y: 20 }), 0.1);
		expect(held).toMatchObject({ x: 10, y: 20, age: 0 });
		expect(held.delay).toBeCloseTo(0.1);
	});

	it('launches once the wait runs out', () => {
		const fired = stepParticle(burst({ delay: 0.05, y: 20 }), 0.1);
		expect(fired.delay).toBe(0);
		expect(isLaunched(fired)).toBe(true);
		// The frame it launches on is the frame it starts moving.
		expect(stepParticle(fired, 0.1).y).toBeLessThan(20);
	});

	// Its origin may be anywhere, including off screen; it has not been thrown.
	it('is never dead while it waits', () => {
		expect(isDead(burst({ delay: 0.2, y: 5000 }), 800)).toBe(false);
	});

	it('is not drawn until it launches', () => {
		expect(isLaunched(burst({ delay: 0.2 }))).toBe(false);
		expect(isLaunched(burst({ delay: 0 }))).toBe(true);
	});
});
