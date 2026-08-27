import { test, expect } from '@playwright/test';

test('home renders the dashboard at / and Pretendard is the active body font', async ({ page }) => {
	await page.goto('/');
	// Dashboard route — stays at /, no redirect.
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

	// Wait for fonts to settle
	await page.evaluate(() => document.fonts.ready);

	// Body's computed font-family should reference Pretendard Variable
	const bodyFontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
	expect(bodyFontFamily).toContain('Pretendard');

	// And the font is actually loaded (used = true means rendered with Pretendard, not fallback)
	const fontUsed = await page.evaluate(() => {
		return document.fonts.check('16px "Pretendard Variable"');
	});
	expect(fontUsed).toBe(true);
});

// The quiz card shipped with no bottom margin, so the 최근 heading sat flush
// against its lower edge — a zero-pixel gap, measured. Every other top-level
// block on this page owns the space beneath it (EventSection carries mb-8),
// and the quiz card is the one that did not.
//
// Asserted in a real browser rather than jsdom on purpose: this is a layout
// bug, and jsdom computes no layout, so a unit test could only check that a
// class string is present rather than that the pixels moved.
test('the quiz card does not run into the section beneath it', async ({ page }) => {
	await page.goto('/');
	const quiz = page.getByRole('link', { name: /퀴즈/ });
	await expect(quiz).toBeVisible();

	const gap = await page.evaluate(() => {
		const card = document.querySelector('a[href="/quiz"]');
		const next = card?.nextElementSibling;
		if (!card || !next) return -1;
		return Math.round(next.getBoundingClientRect().top - card.getBoundingClientRect().bottom);
	});

	// 24px is the tightest gap this page uses between blocks; anything less
	// reads as the two being one element.
	expect(gap).toBeGreaterThanOrEqual(24);
});
