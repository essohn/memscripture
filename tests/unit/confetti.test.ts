import { describe, expect, it } from 'vitest';
import {
	GRAVITY,
	celebrationBursts,
	createBurst,
	flutterScale,
	isDead,
	particleAlpha,
	stepParticle,
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
	it('fires from both lower corners, inward', () => {
		const ps = celebrationBursts(390, 844, seeded());
		const left = ps.filter((p) => p.x < 195);
		const right = ps.filter((p) => p.x > 195);
		expect(left.length).toBeGreaterThan(0);
		expect(right.length).toBeGreaterThan(0);
		// aimed inward: the left popper throws right, the right one throws left
		expect(left.every((p) => p.vx > 0)).toBe(true);
		expect(right.every((p) => p.vx < 0)).toBe(true);
	});

	it('starts everything below the middle and heading up', () => {
		const ps = celebrationBursts(390, 844, seeded());
		expect(ps.every((p) => p.y > 422 && p.vy < 0)).toBe(true);
	});
});
