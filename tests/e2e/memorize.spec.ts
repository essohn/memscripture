import { test, expect, type Page } from '@playwright/test';

async function getParagraphBox(page: Page) {
	const handle = await page.locator('p.paragraph').elementHandle();
	if (!handle) throw new Error('paragraph not visible');
	const box = await handle.boundingBox();
	if (!box) throw new Error('paragraph has no bounding box');
	return box;
}

async function dragHorizontally(page: Page, fromXPct: number, toXPct: number) {
	const box = await getParagraphBox(page);
	const y = box.y + box.height / 2;
	const fromX = box.x + box.width * fromXPct;
	const toX = box.x + box.width * toXPct;
	await page.mouse.move(fromX, y);
	await page.mouse.down();
	// Move in small steps so direction-lock heuristic engages on a real path
	const steps = 12;
	for (let i = 1; i <= steps; i++) {
		const x = fromX + ((toX - fromX) * i) / steps;
		await page.mouse.move(x, y);
	}
	await page.mouse.up();
}

test.describe('swipe curtain memorize mode', () => {
	test('verse detail starts in read mode with body visible', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await expect(page.getByText('잠언 3 : 5-6')).toBeVisible();
		await expect(page.getByText('너는 마음을 다하여 여호와를 의뢰하고')).toBeVisible();
		await expect(page.getByRole('button', { name: '암송 시작' })).toBeVisible();
	});

	test('암송 시작 covers every word with a striped overlay', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();

		// 17 words in 잠언 3:5-6, all covered initially
		await expect(page.locator('.word')).toHaveCount(17);
		await expect(page.locator('.word.covered')).toHaveCount(17);

		// Drag hint visible while not all revealed
		await expect(page.getByText(/드래그해서 단어를 열어보세요/)).toBeVisible();
	});

	test('horizontal drag reveals words in reading order', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();

		// Drag from left edge to ~30% across the paragraph
		await dragHorizontally(page, 0.0, 0.3);

		const covered = await page.locator('.word.covered').count();
		const uncovered = await page.locator('.word:not(.covered)').count();
		expect(uncovered).toBeGreaterThan(0);
		expect(covered).toBeGreaterThan(0);
		expect(covered + uncovered).toBe(17);

		// First uncovered word should be the first word of the verse
		const firstWord = await page
			.locator('.word:not(.covered) .word-text')
			.first()
			.textContent();
		expect(firstWord?.trim()).toBe('너는');
	});

	test('drag accumulates across gestures', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();

		await dragHorizontally(page, 0.0, 0.2);
		const afterFirst = await page.locator('.word:not(.covered)').count();
		expect(afterFirst).toBeGreaterThan(0);

		await dragHorizontally(page, 0.0, 0.2);
		const afterSecond = await page.locator('.word:not(.covered)').count();
		expect(afterSecond).toBeGreaterThan(afterFirst);
	});

	test('전체 보기 reveals all words and removes itself', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();
		await page.getByRole('button', { name: '전체 보기' }).click();

		await expect(page.locator('.word.covered')).toHaveCount(0);
		await expect(page.getByRole('button', { name: '전체 보기' })).toHaveCount(0);
	});

	test('처음부터 다시 re-covers all words', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();
		await page.getByRole('button', { name: '전체 보기' }).click();
		await page.getByRole('button', { name: '처음부터 다시' }).click();

		await expect(page.locator('.word.covered')).toHaveCount(17);
	});

	test('암송 종료 returns to read mode', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();
		await page.getByRole('button', { name: '암송 종료' }).click();

		await expect(page.getByText('너는 마음을 다하여 여호와를 의뢰하고')).toBeVisible();
		await expect(page.getByRole('button', { name: '암송 시작' })).toBeVisible();
		// .word elements gone in read mode
		await expect(page.locator('.word')).toHaveCount(0);
	});
});
