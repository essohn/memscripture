import { test, expect, devices } from '@playwright/test';
import { joinTeam } from './helpers';

test.use({ ...devices['iPhone 14'] });

test('library page scrolls smoothly without fixed-bar bugs', async ({ page }) => {
	await joinTeam(page);
	await page.goto('/library');
	await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

	// 7 curated packages plus the OYO row. This said 7 from before OYO existed
	// and had been failing in CI since May.
	await expect(page.getByTestId('package-card')).toHaveCount(8);

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

// iOS Safari zooms in when a focused control's text is under 16px, and never
// zooms back out — leaving the page scrolling sideways after every check. The
// only reliable prevention is not being under 16px in the first place.
test('form controls are large enough that iOS will not zoom', async ({ page }) => {
	await page.goto('/search');
	const size = await page
		.getByLabel('구절 검색')
		.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
	expect(size).toBeGreaterThanOrEqual(16);
});
