import { test, expect } from '@playwright/test';

/*
 * The Recent tab remembers one thing — the last list of verses the reader was
 * on — and every part of that lives outside any single component: the layout
 * notices the navigation, localStorage carries it across a reload, and the bar
 * renders it. The unit tests cover each piece; only a real browser proves the
 * three are actually wired to each other.
 */
test.describe('Recent tab', () => {
	test('starts dimmed, then goes back to the list that was opened', async ({ page }) => {
		await page.goto('/');

		const bar = page.getByRole('navigation', { name: '주 네비게이션' });
		await expect(bar).toBeVisible();

		// Nothing opened yet: the tab is there, but not as something to follow.
		await expect(bar.getByText('Recent')).toBeVisible();
		await expect(bar.getByRole('link', { name: 'Recent' })).toHaveCount(0);

		// The placeholder Stats tab is gone for good.
		await expect(bar.getByText('Stats')).toHaveCount(0);

		await page.goto('/library/60_krv');
		await expect(page.getByTestId('verse-row').first()).toBeVisible();

		await bar.getByRole('link', { name: 'Home' }).click();
		await expect(page).toHaveURL('/');

		const recent = bar.getByRole('link', { name: 'Recent' });
		await expect(recent).toBeVisible();
		await recent.click();
		await expect(page).toHaveURL('/library/60_krv');
		await expect(page.getByTestId('verse-row').first()).toBeVisible();
	});

	test('remembers the group filter, not just the package', async ({ page }) => {
		await page.goto('/library/60_krv');
		await expect(page.getByTestId('verse-row').first()).toBeVisible();

		// Narrow to a series, which the library page records in the URL. That
		// filter is the whole point of remembering a search string rather than a
		// bare path.
		const seriesStrip = page.getByRole('group', { name: '시리즈 선택' });
		await seriesStrip.getByRole('button').nth(1).click();
		await expect(page).toHaveURL(/[?&]s=0/);
		const filtered = page.url().replace(/^https?:\/\/[^/]+/, '');

		const bar = page.getByRole('navigation', { name: '주 네비게이션' });
		await bar.getByRole('link', { name: 'Home' }).click();
		await expect(page).toHaveURL('/');

		await bar.getByRole('link', { name: 'Recent' }).click();
		await expect(page).toHaveURL(filtered);
	});

	test('survives a reload, which is the point of the tab', async ({ page }) => {
		const bar = page.getByRole('navigation', { name: '주 네비게이션' });

		await page.goto('/bookmarks');
		// The bar appearing is the app saying it has hydrated. goto() resolves on
		// the document's load event, which is earlier — navigating away at that
		// point leaves the layout that does the remembering yet to mount, and the
		// list is never recorded. Cheap to hit on a slower device profile.
		await expect(bar).toBeVisible();

		await page.goto('/');
		await page.reload();

		await expect(bar.getByRole('link', { name: 'Recent' })).toHaveAttribute('href', '/bookmarks');
	});

	// Browsing the package index is not opening a list of verses, and a screen
	// that is only ever passed through should not evict what Recent holds.
	test('is not overwritten by the library index', async ({ page }) => {
		await page.goto('/library/60_krv');
		await expect(page.getByTestId('verse-row').first()).toBeVisible();

		const bar = page.getByRole('navigation', { name: '주 네비게이션' });
		await bar.getByRole('link', { name: 'Library' }).click();
		await expect(page).toHaveURL('/library');

		await expect(bar.getByRole('link', { name: 'Recent' })).toHaveAttribute(
			'href',
			'/library/60_krv'
		);
	});
});
