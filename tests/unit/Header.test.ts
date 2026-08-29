import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import Header from '../../src/lib/components/nav/Header.svelte';
import { verseVisibility } from '../../src/lib/state/verseVisibility.svelte';
import { getShowVerseTextInList } from '../../src/lib/db/viewOptions';
import { db } from '../../src/lib/db/local';

beforeEach(async () => {
	await db.delete();
	await db.open();
	verseVisibility.shown = true;
	// #loaded is private and stays true after the first test's load() resolves,
	// so later tests' load() calls would otherwise return immediately without
	// re-reading storage. See verseVisibility.svelte.ts's _resetForTest().
	verseVisibility._resetForTest();
});

describe('Header verse-text toggle', () => {
	it('renders the toggle beside the settings link', () => {
		render(Header, { title: 'Library' });
		expect(screen.getByLabelText('성경 구절 가리기')).toBeInTheDocument();
		expect(screen.getByLabelText('설정')).toBeInTheDocument();
	});

	it('flips the shared state and its label', async () => {
		render(Header, { title: 'Library' });
		await fireEvent.click(screen.getByLabelText('성경 구절 가리기'));
		expect(verseVisibility.shown).toBe(false);
		expect(screen.getByLabelText('성경 구절 보이기')).toBeInTheDocument();
	});

	// The toggle is the app-wide control, so it has to outlive the tap — a
	// screen opened later must come up in the same state.
	it('persists the choice', async () => {
		render(Header, { title: 'Library' });
		// toggle() returns the write so this can wait for it; the component
		// itself deliberately does not, so a tap never blocks on storage.
		await verseVisibility.toggle();
		expect(await getShowVerseTextInList()).toBe(false);
	});

	// Two Headers are never on screen at once, but the state is module-level:
	// a second mount must reflect the current value rather than its own default.
	it('a later mount reflects the current state', async () => {
		render(Header, { title: 'A' });
		await fireEvent.click(screen.getByLabelText('성경 구절 가리기'));
		render(Header, { title: 'B' });
		expect(screen.getAllByLabelText('성경 구절 보이기')).toHaveLength(2);
	});

	it('omits the toggle where there is no verse text', () => {
		render(Header, { title: 'Stats', showVerseToggle: false });
		expect(screen.queryByLabelText(/성경 구절/)).toBeNull();
	});
});

// The eye is the only way to uncover a verse, and on a desktop it is a trip to
// the corner of the screen for something you do every few seconds while
// rehearsing. `h` is the same switch under the hand.
describe('Header verse-text keyboard shortcut', () => {
	it('h covers the verses', async () => {
		render(Header, { title: 'Library' });
		await fireEvent.keyDown(window, { code: 'KeyH', key: 'h' });
		expect(verseVisibility.shown).toBe(false);
		expect(screen.getByLabelText('성경 구절 보이기')).toBeInTheDocument();
	});

	it('h uncovers them again', async () => {
		render(Header, { title: 'Library' });
		await fireEvent.keyDown(window, { code: 'KeyH', key: 'h' });
		await fireEvent.keyDown(window, { code: 'KeyH', key: 'h' });
		expect(verseVisibility.shown).toBe(true);
	});

	// The readers are Korean and the IME is usually on, which turns the same
	// physical key into 'ㅎ'. Matching the character would leave the shortcut
	// dead exactly where it is most wanted.
	it('works with the Hangul IME on, where the key reports ㅎ', async () => {
		render(Header, { title: 'Library' });
		await fireEvent.keyDown(window, { code: 'KeyH', key: 'ㅎ' });
		expect(verseVisibility.shown).toBe(false);
	});

	it('persists the choice, the same as the button', async () => {
		render(Header, { title: 'Library' });
		await fireEvent.keyDown(window, { code: 'KeyH', key: 'h' });
		// The keypress deliberately does not wait on storage, so the assertion
		// retries until the write lands rather than reading too early.
		await waitFor(async () => expect(await getShowVerseTextInList()).toBe(false));
	});

	// Search, the OYO table and the 점검 answer box are all typing surfaces on
	// screens that carry the header.
	it('ignores h typed into a text field', async () => {
		render(Header, { title: 'Library' });
		const input = document.createElement('input');
		document.body.appendChild(input);
		await fireEvent.keyDown(input, { code: 'KeyH', key: 'h' });
		expect(verseVisibility.shown).toBe(true);
		input.remove();
	});

	it('ignores h typed into a textarea', async () => {
		render(Header, { title: 'Library' });
		const area = document.createElement('textarea');
		document.body.appendChild(area);
		await fireEvent.keyDown(area, { code: 'KeyH', key: 'h' });
		expect(verseVisibility.shown).toBe(true);
		area.remove();
	});

	it('ignores h typed into a contenteditable', async () => {
		render(Header, { title: 'Library' });
		const box = document.createElement('div');
		// setAttribute, not the IDL property: jsdom does not reflect the latter.
		box.setAttribute('contenteditable', 'true');
		document.body.appendChild(box);
		await fireEvent.keyDown(box, { code: 'KeyH', key: 'h' });
		expect(verseVisibility.shown).toBe(true);
		box.remove();
	});

	// A half-composed 한글 syllable delivers keydowns of its own; none of them
	// are a shortcut.
	it('ignores a keypress that is mid-IME-composition', async () => {
		render(Header, { title: 'Library' });
		await fireEvent.keyDown(window, { code: 'KeyH', key: 'Process', isComposing: true });
		expect(verseVisibility.shown).toBe(true);
	});

	// ⌘H hides the window on macOS, Ctrl+H is the browser's history.
	it('leaves modifier combinations to the browser', async () => {
		render(Header, { title: 'Library' });
		await fireEvent.keyDown(window, { code: 'KeyH', key: 'h', metaKey: true });
		await fireEvent.keyDown(window, { code: 'KeyH', key: 'h', ctrlKey: true });
		await fireEvent.keyDown(window, { code: 'KeyH', key: 'h', altKey: true });
		expect(verseVisibility.shown).toBe(true);
	});

	// The shortcut is the button, so it exists exactly where the button does.
	it('is inert on screens with no verse toggle', async () => {
		render(Header, { title: 'Stats', showVerseToggle: false });
		await fireEvent.keyDown(window, { code: 'KeyH', key: 'h' });
		expect(verseVisibility.shown).toBe(true);
	});

	// A modal owns the keyboard while it is open. The list behind one is
	// blurred, so a toggle there is a change the reader cannot watch happen —
	// it just lies in wait for them when they close the panel. 점검, 암송, the
	// history sheet and the OYO editor all carry aria-modal while open.
	it('is inert while a modal is open', async () => {
		render(Header, { title: 'Library' });
		const modal = document.createElement('div');
		modal.setAttribute('aria-modal', 'true');
		document.body.appendChild(modal);
		await fireEvent.keyDown(window, { code: 'KeyH', key: 'h' });
		expect(verseVisibility.shown).toBe(true);
		modal.remove();
	});

	it('names the shortcut on the button for anyone with a keyboard', () => {
		render(Header, { title: 'Library' });
		expect(screen.getByLabelText('성경 구절 가리기')).toHaveAttribute(
			'title',
			'성경 구절 가리기 (H)'
		);
	});
});
