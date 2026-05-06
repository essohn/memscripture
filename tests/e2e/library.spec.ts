import { test, expect } from '@playwright/test';

test('library lists all 7 packages', async ({ page }) => {
	await page.goto('/library');
	await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
	await expect(page.getByText('그리스도와의 새출발 5구절')).toBeVisible();
	await expect(page.getByText('무장 900구절')).toBeVisible();
	const cards = page.getByTestId('package-card');
	await expect(cards).toHaveCount(7);
});

test('package detail shows verse list', async ({ page }) => {
	await page.goto('/library/5_krv');
	await expect(page.getByRole('heading', { name: /5구절/ })).toBeVisible();
	await expect(page.getByTestId('verse-row')).toHaveCount(5);
});
