import { describe, it, expect } from 'vitest';
import { currentTab, isVerseList } from '../../src/lib/utils/route';

describe('currentTab', () => {
	it('maps the root to home', () => {
		expect(currentTab('/')).toBe('home');
	});

	it('maps the library index and a package to library', () => {
		expect(currentTab('/library')).toBe('library');
		expect(currentTab('/library/60_krv')).toBe('library');
	});

	it('maps the bookmarks list to bookmarks', () => {
		expect(currentTab('/bookmarks')).toBe('bookmarks');
	});

	// The difficulty list is the one screen with no section of its own in the
	// bar, so it lights Recent — the tab that opened it.
	it('maps a difficulty list to recent', () => {
		expect(currentTab('/stats/verses')).toBe('recent');
	});

	it('falls back to home for a path no tab owns', () => {
		expect(currentTab('/settings')).toBe('home');
	});
});

describe('isVerseList', () => {
	it('remembers a difficulty bucket', () => {
		expect(isVerseList('/stats/verses')).toBe(true);
	});

	it("remembers a package's verses", () => {
		expect(isVerseList('/library/60_krv')).toBe(true);
	});

	it('remembers the 나만의 구절 list', () => {
		expect(isVerseList('/library/oyo')).toBe(true);
	});

	it('remembers the bookmarks list', () => {
		expect(isVerseList('/bookmarks')).toBe(true);
	});

	it('ignores the library index, which lists packages rather than verses', () => {
		expect(isVerseList('/library')).toBe(false);
	});

	it('ignores a single verse', () => {
		expect(isVerseList('/library/60_krv/12')).toBe(false);
	});

	// The search query lives in component state, not the URL, so a remembered
	// /search would reopen an empty box rather than the results that were on it.
	it('ignores search', () => {
		expect(isVerseList('/search')).toBe(false);
	});

	it('ignores the screens that are not lists of verses', () => {
		for (const p of ['/', '/settings', '/quiz', '/stats', '/today']) {
			expect(isVerseList(p)).toBe(false);
		}
	});

	// A trailing slash is the same screen. SvelteKit normalizes it away, but
	// this predicate decides what gets stored and a near-miss would silently
	// stop remembering.
	it('accepts a trailing slash', () => {
		expect(isVerseList('/library/60_krv/')).toBe(true);
	});
});
