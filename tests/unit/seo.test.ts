import { describe, expect, it } from 'vitest';
import {
	SITEMAP_ROUTES,
	SITE_DESCRIPTION,
	SITE_TITLE,
	SITE_URL,
	canonical,
	pageTitle
} from '../../src/lib/seo/site';
import { isContentPage } from '../../src/lib/utils/route';

describe('canonical', () => {
	it('builds an absolute URL from a site-relative path', () => {
		expect(canonical('/guide')).toBe('https://mem.lifescripture.org/guide');
	});

	it('tolerates a path given without its leading slash', () => {
		expect(canonical('guide')).toBe('https://mem.lifescripture.org/guide');
	});

	// Advertising both /guide and /guide/ as canonical splits whatever ranking
	// the page earns across two URLs.
	it('drops a trailing slash', () => {
		expect(canonical('/guide/')).toBe('https://mem.lifescripture.org/guide');
	});

	it('keeps the root as a bare slash', () => {
		expect(canonical('/')).toBe(`${SITE_URL}/`);
	});
});

describe('pageTitle', () => {
	it('appends the brand', () => {
		expect(pageTitle('소개')).toBe('소개 | MemScripture');
	});

	// "MemScripture — 성경 암송 앱 | MemScripture" reads like a bug because it is.
	it('does not append the brand to the site title itself', () => {
		expect(pageTitle(SITE_TITLE)).toBe(SITE_TITLE);
		expect(pageTitle(undefined)).toBe(SITE_TITLE);
	});
});

describe('site copy', () => {
	// Google truncates a description around 160 characters; Korean characters
	// are counted the same. A cut-off sentence in the results page is the first
	// thing a searcher sees.
	it('keeps the default description within what search results show', () => {
		expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(170);
	});

	// The audience searches in Korean. A title with no Korean in it can only be
	// found by someone who already knows the name.
	it('has Korean in the site title', () => {
		expect(SITE_TITLE).toMatch(/[가-힣]/);
	});
});

describe('sitemap routes', () => {
	// The three landing pages are held back pending a content review, so the
	// sitemap is down to the app root — see drafts/pages/README.md.
	it('lists only pages that render text without the reader’s own data', () => {
		expect(SITEMAP_ROUTES.map((r) => r.path)).toEqual(['/']);
	});

	// A sitemap entry invites a crawler in. While the pages are unpublished,
	// naming one here would advertise a URL that now falls through to the app
	// shell — which is exactly what must not get indexed under their names.
	it('advertises none of the held-back pages', () => {
		for (const p of ['/guide', '/about', '/amsong-day']) {
			expect(SITEMAP_ROUTES.some((r) => r.path === p)).toBe(false);
		}
	});

	// The sitemap is a promise that these URLs have something to read. Every
	// entry but the app root must therefore be a server-rendered content page —
	// advertising a client-only route sends crawlers to an empty shell.
	it('advertises nothing that renders client-side only', () => {
		for (const r of SITEMAP_ROUTES) {
			if (r.path === '/') continue;
			expect(isContentPage(r.path)).toBe(true);
		}
	});

	it('gives every entry an absolute location', () => {
		for (const r of SITEMAP_ROUTES) {
			expect(canonical(r.path).startsWith(`${SITE_URL}/`)).toBe(true);
		}
	});
});

describe('isContentPage', () => {
	// This predicate does three jobs at once: it strips the app chrome, and it
	// tells hooks.server.ts which pages own their head tags. A page that is
	// server-rendered but not listed here would ship two <title> tags.
	// Empty while the landing pages are held back: nothing is server-rendered,
	// so nothing needs its app chrome stripped or owns its own head tags.
	it('matches nothing while no content page is published', () => {
		for (const p of ['/guide', '/about', '/amsong-day']) {
			expect(isContentPage(p)).toBe(false);
		}
	});

	it('does not match the app screens', () => {
		for (const p of ['/', '/library', '/library/900_krv', '/bookmarks', '/stats', '/settings']) {
			expect(isContentPage(p)).toBe(false);
		}
	});
});
