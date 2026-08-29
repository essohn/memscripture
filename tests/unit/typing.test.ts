import { describe, expect, it } from 'vitest';
import { ownsEnter, submitsOnEnter } from '../../src/lib/memorize/typing';

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

describe('ownsEnter', () => {
	const el = (tag: string) => document.createElement(tag);

	// Each of these fires on Enter without being asked: a window handler that
	// also acted would be the second thing one keystroke did.
	it('is true for the controls that act on it themselves', () => {
		for (const tag of ['button', 'a', 'input', 'textarea', 'select']) {
			expect(ownsEnter(el(tag)), tag).toBe(true);
		}
	});

	it('is true for anything the reader is typing into', () => {
		const div = el('div');
		div.contentEditable = 'true';
		// jsdom does not derive isContentEditable from the attribute.
		Object.defineProperty(div, 'isContentEditable', { value: true });
		expect(ownsEnter(div)).toBe(true);
	});

	// Nothing focused: the event arrives with the body as its target, and that
	// is exactly the case a window handler exists for.
	it('is false for the page itself', () => {
		expect(ownsEnter(document.body)).toBe(false);
		expect(ownsEnter(el('div'))).toBe(false);
		expect(ownsEnter(null)).toBe(false);
	});
});
