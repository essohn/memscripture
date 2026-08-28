import { describe, expect, it } from 'vitest';
import {
	SHARD_GRAVITY,
	isShardDead,
	shardAlpha,
	shatterBox,
	stepShard,
	type Shard
} from '../../src/lib/arcade/shatter';

/** Deterministic stand-in for Math.random, so a physics test cannot flake. */
const rng = () => 0.5;

describe('shatterBox', () => {
	it('breaks the whole box and nothing outside it', () => {
		const shards = shatterBox(120, 60, { cols: 4, rows: 3, rng });
		expect(shards).toHaveLength(12);
		expect(shards.every((s) => s.w === 30 && s.h === 20)).toBe(true);
		const area = shards.reduce((sum, s) => sum + s.w * s.h, 0);
		expect(area).toBe(120 * 60);
	});

	// Every piece has to start where it was standing, or the wall appears to
	// jump before it breaks.
	it('starts each piece over the cell it came from', () => {
		const shards = shatterBox(100, 100, { cols: 2, rows: 2, rng });
		const corners = shards.map((s) => `${s.x},${s.y}`).sort();
		expect(corners).toEqual(['0,0', '0,50', '50,0', '50,50']);
	});

	// The blast is what makes it read as breaking rather than falling apart.
	it('throws each piece away from the impact', () => {
		const shards = shatterBox(100, 100, { cols: 2, rows: 2, rng, impact: { x: 50, y: 50 } });
		const topLeft = shards.find((s) => s.x === 0 && s.y === 0)!;
		const bottomRight = shards.find((s) => s.x === 50 && s.y === 50)!;
		expect(topLeft.vx).toBeLessThan(0);
		expect(topLeft.vy).toBeLessThan(0);
		expect(bottomRight.vx).toBeGreaterThan(0);
	});

	it('survives a box with no area', () => {
		expect(() => shatterBox(0, 0, { cols: 3, rows: 3, rng })).not.toThrow();
	});
});

describe('stepShard', () => {
	const at = (over: Partial<Shard> = {}): Shard => ({
		x: 0, y: 0, vx: 100, vy: 0, rot: 0, vrot: 1, w: 10, h: 10, age: 0, life: 1, ...over
	});

	it('carries the piece along its velocity', () => {
		expect(stepShard(at(), 0.5).x).toBeCloseTo(50);
	});

	it('pulls it down', () => {
		expect(stepShard(at(), 1).vy).toBeCloseTo(SHARD_GRAVITY);
	});

	it('turns it and ages it', () => {
		const moved = stepShard(at(), 0.5);
		expect(moved.rot).toBeCloseTo(0.5);
		expect(moved.age).toBeCloseTo(0.5);
	});

	// The caller replaces its array with what this returns; mutating in place
	// would make the frame before the current one unreadable.
	it('does not touch the piece it was given', () => {
		const before = at();
		stepShard(before, 1);
		expect(before.x).toBe(0);
	});
});

describe('shardAlpha', () => {
	it('is solid at first and gone at the end', () => {
		expect(shardAlpha({ age: 0, life: 1 })).toBe(1);
		expect(shardAlpha({ age: 1, life: 1 })).toBe(0);
	});

	it('never goes negative when a piece overruns its life', () => {
		expect(shardAlpha({ age: 5, life: 1 })).toBe(0);
	});
});

describe('isShardDead', () => {
	it('is dead once its life is spent', () => {
		expect(isShardDead({ age: 1, life: 1 })).toBe(true);
		expect(isShardDead({ age: 0.9, life: 1 })).toBe(false);
	});
});
