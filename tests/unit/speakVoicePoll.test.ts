import { describe, expect, it, vi } from 'vitest';
import { VOICE_POLL_LIMIT, pollForVoices, type VoiceLike } from '../../src/lib/memorize/speak';

const KO: VoiceLike[] = [{ name: 'Yuna', lang: 'ko-KR', localService: true }];

/** A clock the test drives by hand. */
function fakeClock() {
	let next = 1;
	const due = new Map<number, () => void>();
	return {
		schedule: (fn: () => void) => {
			const id = next++;
			due.set(id, fn);
			return id;
		},
		cancel: (id: number) => void due.delete(id),
		/** Run every timer currently waiting, once. */
		tick() {
			const now = [...due.entries()];
			due.clear();
			for (const [, fn] of now) fn();
		},
		get pending() {
			return due.size;
		}
	};
}

describe('pollForVoices', () => {
	// A desktop has the list already and must not wait out an interval to show
	// it.
	it('answers immediately when the list is already there', () => {
		const emit = vi.fn();
		const clock = fakeClock();
		pollForVoices({ read: () => KO, emit, schedule: clock.schedule, cancel: clock.cancel });
		expect(emit).toHaveBeenCalledWith(KO);
		expect(clock.pending).toBe(0);
	});

	// Android's engine warms up out of band: getVoices() is empty at load and
	// voiceschanged either fires before anything is listening or not at all.
	it('keeps asking until the engine wakes up', () => {
		const emit = vi.fn();
		const clock = fakeClock();
		let ready = false;
		pollForVoices({
			read: () => (ready ? KO : []),
			emit,
			schedule: clock.schedule,
			cancel: clock.cancel
		});
		expect(emit).not.toHaveBeenCalled();

		clock.tick();
		expect(emit).not.toHaveBeenCalled();

		ready = true;
		clock.tick();
		expect(emit).toHaveBeenCalledWith(KO);
	});

	it('stops once it has an answer', () => {
		const clock = fakeClock();
		pollForVoices({ read: () => KO, emit: vi.fn(), schedule: clock.schedule, cancel: clock.cancel });
		expect(clock.pending).toBe(0);
	});

	// A device that genuinely has nothing must not be polled forever.
	it('gives up rather than polling a silent device for good', () => {
		const clock = fakeClock();
		const read = vi.fn(() => [] as VoiceLike[]);
		pollForVoices({ read, emit: vi.fn(), schedule: clock.schedule, cancel: clock.cancel });
		for (let i = 0; i < VOICE_POLL_LIMIT + 5; i++) clock.tick();
		expect(read).toHaveBeenCalledTimes(VOICE_POLL_LIMIT);
		expect(clock.pending).toBe(0);
	});

	it('stops when the caller lets go', () => {
		const clock = fakeClock();
		const stop = pollForVoices({
			read: () => [],
			emit: vi.fn(),
			schedule: clock.schedule,
			cancel: clock.cancel
		});
		expect(clock.pending).toBe(1);
		stop();
		expect(clock.pending).toBe(0);
	});
});
