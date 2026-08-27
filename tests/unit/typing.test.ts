import { describe, expect, it } from 'vitest';
import { submitsOnEnter } from '../../src/lib/memorize/typing';

const ev = (over: Partial<{ key: string; shiftKey: boolean; isComposing: boolean }> = {}) => ({
	key: 'Enter',
	shiftKey: false,
	isComposing: false,
	...over
});

describe('submitsOnEnter', () => {
	it('submits on a plain Enter', () => {
		expect(submitsOnEnter(ev())).toBe(true);
	});

	// Korean input uses Enter to commit a syllable. Submitting on that
	// keystroke fires while the reader is still mid-word.
	it('does not submit while a syllable is being composed', () => {
		expect(submitsOnEnter(ev({ isComposing: true }))).toBe(false);
	});

	it('does not submit on Shift+Enter, which is a newline', () => {
		expect(submitsOnEnter(ev({ shiftKey: true }))).toBe(false);
	});

	it('ignores every other key', () => {
		expect(submitsOnEnter(ev({ key: 'a' }))).toBe(false);
		expect(submitsOnEnter(ev({ key: 'Tab' }))).toBe(false);
	});
});
