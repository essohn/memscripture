import { test, expect } from '@playwright/test';

test('home redirects to /library and Pretendard is the active body font', async ({ page }) => {
	await page.goto('/');
	// With the Today section disabled, / 307s to /library — Playwright follows it.
	await expect(page).toHaveURL(/\/library$/);

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
