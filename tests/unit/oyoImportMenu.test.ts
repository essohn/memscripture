// First line, per the repo's convention: this page reaches db/oyoBackup and
// db/local, which open Dexie.
import 'fake-indexeddb/auto';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OyoPage from '../../src/routes/library/oyo/+page.svelte';
import { goto } from '$app/navigation';
import { buildImportLink } from '../../src/lib/oyo/importLink';

vi.mock('$app/navigation', async () => ({
	...(await vi.importActual<Record<string, unknown>>('$app/navigation')),
	goto: vi.fn()
}));

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

	// The door a reader needs on iOS, where a link cannot reach this app at all:
	// every home-screen web app owns its storage, so they arrive carrying the
	// link on the clipboard instead of following it.
	it('points the link door at the deeplink import route', async () => {
		render(OyoPage);
		await fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
		expect(screen.getByRole('menuitem', { name: /링크 붙여넣기/ })).toHaveAttribute(
			'href',
			'/oyo/import'
		);
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

	it('closes the menu on an outside click', async () => {
		render(OyoPage);
		await fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
		expect(screen.getByRole('menu', { name: '가져오기 방법' })).toBeInTheDocument();
		const backdrop = document.querySelector('[role="presentation"]');
		expect(backdrop).not.toBeNull();
		await fireEvent.click(backdrop!);
		expect(screen.queryByRole('menu', { name: '가져오기 방법' })).toBeNull();
	});

	it('lands focus on the first item so a keyboard reader is inside the menu', async () => {
		render(OyoPage);
		await fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
		expect(document.activeElement).toBe(
			screen.getByRole('menuitem', { name: /표에서 가져오기/ })
		);
	});

	it('walks the items with the arrow keys', async () => {
		render(OyoPage);
		await fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
		const menu = screen.getByRole('menu', { name: '가져오기 방법' });
		await fireEvent.keyDown(menu, { key: 'ArrowDown' });
		expect(document.activeElement).toBe(
			screen.getByRole('menuitem', { name: /링크 붙여넣기/ })
		);
		await fireEvent.keyDown(menu, { key: 'ArrowDown' });
		expect(document.activeElement).toBe(
			screen.getByRole('menuitem', { name: /백업에서 복원/ })
		);
	});
});

/**
 * The clipboard is the only carrier that crosses iOS's per-app storage
 * containers, so on the installed app it is the *normal* way verses arrive —
 * not a recovery path. Three taps through a submenu is too long a walk for
 * the ordinary case, so the header offers it directly.
 */
describe('나의 구절 — 클립보드에서 가져오기', () => {
	const LINK = buildImportLink('https://mem.lifescripture.org', {
		source: 'bible.lifescripture.org',
		verses: [{ cite: '창 12:1', w: '여호와께서 아브람에게 이르시되', title: null }]
	});

	function clipboardYields(read: () => Promise<string>) {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { readText: read }
		});
	}

	beforeEach(() => {
		vi.mocked(goto).mockClear();
	});

	it('carries a copied link straight to the review screen', async () => {
		clipboardYields(async () => LINK);
		render(OyoPage);
		await fireEvent.click(screen.getByRole('button', { name: '클립보드에서 가져오기' }));
		await vi.waitFor(() => expect(goto).toHaveBeenCalledTimes(1));
		expect(vi.mocked(goto).mock.calls[0][0]).toBe(
			`/oyo/import${LINK.slice(LINK.indexOf('#'))}`
		);
	});

	it('says so when the clipboard holds something that is not an import link', async () => {
		clipboardYields(async () => 'https://bible.lifescripture.org/bible/krv/john/3');
		render(OyoPage);
		await fireEvent.click(screen.getByRole('button', { name: '클립보드에서 가져오기' }));
		expect(await screen.findByText('클립보드에 가져오기 링크가 없습니다')).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});

	// Firefox does not give page scripts readText at all, and a permission can
	// be refused anywhere. Neither is a dead end: the paste screen takes the
	// link by hand.
	it('falls back to the paste screen when the clipboard cannot be read', async () => {
		clipboardYields(async () => {
			throw new Error('denied');
		});
		render(OyoPage);
		await fireEvent.click(screen.getByRole('button', { name: '클립보드에서 가져오기' }));
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/oyo/import'));
	});
});
