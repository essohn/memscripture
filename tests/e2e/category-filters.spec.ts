import { test, expect } from '@playwright/test';

test.describe('category filters', () => {
	test('60_krv: series strip visible, group strip hidden until series selected', async ({
		page
	}) => {
		await page.goto('/library/60_krv');
		await expect(page.getByTestId('verse-row').first()).toBeVisible();

		// Series strip exists with 전체 + at least one series
		const seriesStrip = page.getByRole('group', { name: '시리즈 선택' });
		await expect(seriesStrip).toBeVisible();
		await expect(page.getByRole('button', { name: '전체' })).toBeVisible();

		// Group SUB label not visible initially
		await expect(page.getByText('SUB', { exact: true })).not.toBeVisible();

		// All 60 verses initially
		await expect(page.getByTestId('verse-row')).toHaveCount(60);

		// Click first non-전체 series chip (index 1, 전체 is index 0)
		const chips = seriesStrip.getByRole('button');
		await chips.nth(1).click();

		// URL has ?s=0
		await expect(page).toHaveURL(/\?s=0/, { timeout: 5000 });

		// Group strip now visible
		await expect(page.getByText('SUB', { exact: true })).toBeVisible();

		// Verse count drops below 60 (series A in 60_krv has 12 verses)
		const remaining = await page.getByTestId('verse-row').count();
		expect(remaining).toBeLessThan(60);
	});

	test('60_krv: deep link with ?s=0&g=0 renders filtered list', async ({ page }) => {
		await page.goto('/library/60_krv?s=0&g=0');
		await expect(page.getByTestId('verse-row').first()).toBeVisible();
		// Series A's first level-2 group has 2 verses
		await expect(page.getByTestId('verse-row')).toHaveCount(2);
	});

	test('60_krv: ?s=99 (out of range) falls back to all verses', async ({ page }) => {
		await page.goto('/library/60_krv?s=99');
		await expect(page.getByTestId('verse-row').first()).toBeVisible();
		await expect(page.getByTestId('verse-row')).toHaveCount(60);
	});

	test('5_krv: no series strip, no group strip, no inline tags', async ({ page }) => {
		await page.goto('/library/5_krv');
		await expect(page.getByTestId('verse-row').first()).toBeVisible();

		// Series strip must not render
		await expect(page.getByRole('group', { name: '시리즈 선택' })).toHaveCount(0);

		// SUB label must not exist
		await expect(page.getByText('SUB', { exact: true })).toHaveCount(0);

		// 5 verses
		await expect(page.getByTestId('verse-row')).toHaveCount(5);
	});

	test('100_krv: series strip visible, group strip hidden after series selection', async ({
		page
	}) => {
		await page.goto('/library/100_krv?s=0');
		await expect(page.getByTestId('verse-row').first()).toBeVisible();

		// Series strip rendered
		await expect(page.getByRole('group', { name: '시리즈 선택' })).toBeVisible();

		// Group SUB label still hidden because 100_krv has no level-2
		await expect(page.getByText('SUB', { exact: true })).not.toBeVisible();
	});

	test('PackageTabStrip lets you jump to another package', async ({ page }) => {
		await page.goto('/library/5_krv');
		await page.getByRole('navigation', { name: '패키지 선택' }).getByText('60구절').click();
		await expect(page).toHaveURL(/\/library\/60_krv$/);
	});

	test('VerseCard tag tap navigates to filtered package detail', async ({ page }) => {
		await page.goto('/library/60_krv/1');
		// CategoryTag is the only article button with aria-pressed; difficulty
		// badges use aria-haspopup, bookmark/overflow controls use aria-label.
		// Anchoring on aria-pressed keeps the test stable as new badges are
		// added to the card header.
		const tagButtons = page.locator('article button[aria-pressed]');
		await expect(tagButtons.first()).toBeVisible();
		await tagButtons.first().click();
		await expect(page).toHaveURL(/\/library\/60_krv\?s=0/);
	});
});
