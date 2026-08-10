import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
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
