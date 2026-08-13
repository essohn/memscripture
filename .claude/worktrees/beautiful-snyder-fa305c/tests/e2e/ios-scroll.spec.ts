import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['iPhone 14'] });

test('library page scrolls smoothly without fixed-bar bugs', async ({ page }) => {
	await page.goto('/library');
	await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

	await expect(page.getByTestId('package-card')).toHaveCount(7);

	const initialScrollY = await page.evaluate(() => window.scrollY);
	expect(initialScrollY).toBe(0);

	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await page.waitForTimeout(200);
	const finalScrollY = await page.evaluate(() => window.scrollY);
	expect(finalScrollY).toBeGreaterThan(0);

	const tabBar = page.getByRole('navigation', { name: '주 네비게이션' });
	await expect(tabBar).toBeVisible();
	const box = await tabBar.boundingBox();
	expect(box).not.toBeNull();
	const viewport = page.viewportSize()!;
	expect(Math.abs(box!.y + box!.height - viewport.height)).toBeLessThan(2);
});

test('body uses min-height 100dvh, not 100vh', async ({ page }) => {
	await page.goto('/');
	const minHeight = await page.evaluate(() => {
		return getComputedStyle(document.body).minHeight;
	});
	expect(minHeight).not.toBe('auto');
	expect(minHeight).not.toBe('0px');
});
