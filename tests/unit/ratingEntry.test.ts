import { describe, expect, it } from 'vitest';
import { applyRatingKey, type RatingEntry } from '../../src/lib/memorize/ratingEntry';
import { DIFFICULTY_LEVELS } from '../../src/lib/db/verseRatings';

const empty: RatingEntry = { start: null, full: null, cursor: 'start' };

/** Applies a run of keys, asserting each one was handled. */
function keys(from: RatingEntry, ...pressed: string[]): RatingEntry {
	return pressed.reduce((entry, key) => {
		const next = applyRatingKey(entry, key);
		expect(next, `expected ${key} to be handled`).not.toBeNull();
		return next as RatingEntry;
	}, from);
}

describe('applyRatingKey', () => {
	it('sends the first digit to 첫 시작 and moves the cursor on', () => {
		expect(applyRatingKey(empty, '0')).toEqual({ start: 0, full: null, cursor: 'full' });
	});

	it('sends the second digit to 전체', () => {
		expect(keys(empty, '0', '3')).toEqual({ start: 0, full: 3, cursor: 'full' });
	});

	// 0 is a level — Impossible — not an empty box, and every level the scale
	// carries has to be typeable or the shortcut is a worse picker than the menu.
	it('takes every level the scale has', () => {
		for (const level of DIFFICULTY_LEVELS) {
			expect(applyRatingKey(empty, String(level))?.start).toBe(level);
		}
	});

	// Once both are set, a further digit is the reader fixing the one they just
	// typed. Dropping it would leave them reaching for the mouse anyway.
	it('lets a further digit replace 전체', () => {
		expect(keys(empty, '0', '3', '4')).toEqual({ start: 0, full: 4, cursor: 'full' });
	});

	it('ignores a digit off the scale', () => {
		expect(applyRatingKey(empty, '6')).toBeNull();
		expect(applyRatingKey(empty, '9')).toBeNull();
	});

	// Null rather than an unchanged entry, so the caller knows to leave the
	// keystroke alone rather than swallowing it.
	it('ignores keys that are not entry', () => {
		for (const key of ['a', 'ㄱ', 'Enter', 'ArrowLeft', ' ', 'Escape', 'Tab']) {
			expect(applyRatingKey(empty, key), key).toBeNull();
		}
	});

	describe('Backspace', () => {
		it('clears the value just entered, leaving the cursor on it', () => {
			expect(keys(empty, '0', '3', 'Backspace')).toEqual({
				start: 0,
				full: null,
				cursor: 'full'
			});
		});

		it('steps back to 첫 시작 once 전체 is already empty', () => {
			expect(keys(empty, '0', '3', 'Backspace', 'Backspace')).toEqual({
				start: null,
				full: null,
				cursor: 'start'
			});
		});

		// The confirmation screen after 제출 arrives with both ratings already
		// proposed. Undoing one of those is the same gesture as undoing one typed.
		it('clears a rating the app proposed', () => {
			expect(applyRatingKey({ start: 2, full: 3, cursor: 'start' }, 'Backspace')).toEqual({
				start: null,
				full: 3,
				cursor: 'start'
			});
		});

		it('does nothing when there is nothing left to undo', () => {
			expect(applyRatingKey(empty, 'Backspace')).toBeNull();
			expect(applyRatingKey({ start: null, full: null, cursor: 'full' }, 'Backspace')).toBeNull();
		});
	});
});
