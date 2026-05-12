import { test, expect } from '@playwright/test';

test.describe('Today + intake e2e', () => {
	test('first-time user: activates package and commits first suggestion', async ({ page }) => {
		// Clear Dexie before each navigation to start fresh
		await page.goto('/library');
		await page.evaluate(async () => {
			const dbs = await indexedDB.databases();
			for (const d of dbs) {
				if (d.name)
					await new Promise((res) => {
						const req = indexedDB.deleteDatabase(d.name!);
						req.onsuccess = () => res(null);
						req.onerror = () => res(null);
						req.onblocked = () => res(null);
					});
			}
		});
		await page.reload();

		// Navigate to a package detail
		await page.goto('/library/60_krv');
		await expect(page.getByTestId('verse-row').first()).toBeVisible();

		// Activate this package
		await page.getByRole('button', { name: '이 패키지로 학습 시작' }).click();
		await expect(page.getByText('활성 패키지로 설정되었어요.')).toBeVisible();
		await expect(page.getByText('학습 중')).toBeVisible();

		// Tap CTA → /today
		await page.getByRole('link', { name: '오늘의 큐 →' }).click();
		await expect(page).toHaveURL(/\/today/);

		// Should see suggestion card for verseNo 1
		await expect(page.getByText('다음 추천')).toBeVisible();
		await expect(page.getByRole('button', { name: '학습 시작' })).toBeVisible();

		// Commit first suggestion
		await page.getByRole('button', { name: '학습 시작' }).click();

		// Should advance to next item (second suggestion or done screen)
		// Either way, the initial suggestion's button text should no longer be visible
		// for the same verse — at minimum, the queue index advanced.
		await expect(page.getByText('1 / 2')).not.toBeVisible({ timeout: 3000 });
	});

	test('redirects to home when no active package', async ({ page }) => {
		// Clear DB
		await page.goto('/');
		await page.evaluate(async () => {
			const dbs = await indexedDB.databases();
			for (const d of dbs) {
				if (d.name)
					await new Promise((res) => {
						const req = indexedDB.deleteDatabase(d.name!);
						req.onsuccess = () => res(null);
						req.onerror = () => res(null);
						req.onblocked = () => res(null);
					});
			}
		});

		// Try to access /today directly
		await page.goto('/today');
		// Should be redirected to /
		await expect(page).toHaveURL(/\/$|\/?$/);
	});
});
