import { test, expect } from '@playwright/test';

test.describe('memorize mode', () => {
	test('verse detail starts in read mode with body visible', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await expect(page.getByText('잠언 3 : 5-6')).toBeVisible();
		await expect(page.getByText('너는 마음을 다하여 여호와를 의뢰하고')).toBeVisible();
		await expect(page.getByRole('button', { name: '암송 시작' })).toBeVisible();
	});

	test('암송 시작 hides body and shows the cue', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();

		// Cue is visible
		await expect(page.getByText(/구절을 떠올려보세요/)).toBeVisible();
		// Body text not visible as a single block — at least the first chunk's
		// surrounding context shouldn't be on screen yet
		await expect(page.getByText(/그리하면 네 길을 지도하시리라/)).not.toBeVisible();
	});

	test('tapping cue reveals chunks progressively', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();

		// First tap reveals chunk 1
		await page.getByRole('button', { name: /구절을 떠올려보세요/ }).click();
		await expect(page.getByText('너는 마음을 다하여 여호와를 의뢰하고')).toBeVisible();

		// Last chunk not yet revealed
		await expect(page.getByText('그리하면 네 길을 지도하시리라')).not.toBeVisible();

		// Tap until done
		const next = page.getByRole('button', { name: /다음 부분 보기/ });
		await next.click();
		await next.click();
		await next.click();

		await expect(page.getByText('그리하면 네 길을 지도하시리라')).toBeVisible();
		// Cue gone
		await expect(page.getByRole('button', { name: /다음 부분 보기/ })).toHaveCount(0);
	});

	test('전체 보기 reveals all chunks immediately', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();
		await page.getByRole('button', { name: '전체 보기' }).click();

		await expect(page.getByText('너는 마음을 다하여 여호와를 의뢰하고')).toBeVisible();
		await expect(page.getByText('그리하면 네 길을 지도하시리라')).toBeVisible();
		// 전체 보기 disappears once everything is revealed
		await expect(page.getByRole('button', { name: '전체 보기' })).toHaveCount(0);
	});

	test('처음부터 다시 resets reveal', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();
		await page.getByRole('button', { name: '전체 보기' }).click();
		await page.getByRole('button', { name: '처음부터 다시' }).click();

		await expect(page.getByText('그리하면 네 길을 지도하시리라')).not.toBeVisible();
		await expect(page.getByText(/구절을 떠올려보세요/)).toBeVisible();
	});

	test('암송 종료 returns to read mode', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();
		await page.getByRole('button', { name: '암송 종료' }).click();

		await expect(page.getByText('너는 마음을 다하여 여호와를 의뢰하고')).toBeVisible();
		await expect(page.getByRole('button', { name: '암송 시작' })).toBeVisible();
	});
});
