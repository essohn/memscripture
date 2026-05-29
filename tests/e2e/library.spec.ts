import { test, expect } from '@playwright/test';

test('library lists curated packages and the user-defined OYO package', async ({ page }) => {
	await page.goto('/library');
	await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
	await expect(page.getByText('그리스도와의 새출발 5구절')).toBeVisible();
	await expect(page.getByText('무장 900구절')).toBeVisible();
	// OYO seed adds one user-kind row alongside the 7 curated packages.
	await expect(page.getByText('사용자 정의')).toBeVisible();
	const cards = page.getByTestId('package-card');
	await expect(cards).toHaveCount(8);
});

test('package detail shows verse list', async ({ page }) => {
	await page.goto('/library/5_krv');
	await expect(page.getByRole('heading', { name: /5구절/ })).toBeVisible();
	await expect(page.getByTestId('verse-row')).toHaveCount(5);
});

test('verse detail shows the verse text', async ({ page }) => {
	await page.goto('/library/5_krv/5');
	await expect(page.getByText('잠언 3 : 5-6')).toBeVisible();
	await expect(page.getByText('너는 마음을 다하여 여호와를 의뢰하고')).toBeVisible();
});
