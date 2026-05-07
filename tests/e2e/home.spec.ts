import { test, expect } from '@playwright/test';

test('home renders and Pretendard is the active body font', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: /오늘은 학습할 구절이/ })).toBeVisible();

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
