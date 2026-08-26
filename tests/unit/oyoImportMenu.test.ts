// First line, per the repo's convention: this page reaches db/oyoBackup and
// db/local, which open Dexie.
import 'fake-indexeddb/auto';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import OyoPage from '../../src/routes/library/oyo/+page.svelte';

vi.mock('../../src/lib/db/oyo', () => ({
	OYO_PACKAGE_ID: 'oyo',
	listOyoVerses: vi.fn(async () => []),
	createOyoVerse: vi.fn(async () => ({})),
	updateOyoVerse: vi.fn(async () => {}),
	deleteOyoVerse: vi.fn(async () => null),
	restoreOyoVerse: vi.fn(async () => {})
}));

vi.mock('../../src/lib/db/verseRatings', () => ({
	getVerseRating: vi.fn(async () => null),
	setStartDifficulty: vi.fn(async () => {}),
	setFullDifficulty: vi.fn(async () => {})
}));

describe('나의 구절 — 가져오기 menu', () => {
	it('offers both doors instead of going straight to a file picker', async () => {
		render(OyoPage);
		await fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
		expect(screen.getByRole('menuitem', { name: /표에서 가져오기/ })).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: /백업에서 복원/ })).toBeInTheDocument();
	});

	it('points the table door at its route', async () => {
		render(OyoPage);
		await fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
		expect(screen.getByRole('menuitem', { name: /표에서 가져오기/ })).toHaveAttribute(
			'href',
			'/oyo/import/table'
		);
	});

	it('closes the menu on Escape', async () => {
		render(OyoPage);
		await fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(screen.queryByRole('menu', { name: '가져오기 방법' })).toBeNull();
	});
});
