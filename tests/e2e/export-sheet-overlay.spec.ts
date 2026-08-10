import { test, expect } from '@playwright/test';

// The export options sheet is a modal and must sit above the fixed TabBar.
// It first shipped at z-50 — the same z-index as the bar — and since an equal
// z-index is broken by DOM order, and the bar renders after the page content,
// the bar won. Its confirm button was not merely hidden: a tap at the button's
// own coordinates landed on a TabBar link and navigated away instead of
// downloading. Asserting the class would not have caught that; asserting what
// receives the tap does.
test('export sheet buttons receive their own taps, not the TabBar behind them', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: /엑셀로 다운로드/ }).click();
	await expect(page.getByRole('dialog')).toBeVisible();

	for (const name of ['다운로드', '취소']) {
		const button = page.getByRole('button', { name, exact: true });
		await expect(button).toBeVisible();

		// Hit-test the button's own centre point. If anything else is on top,
		// this returns that element instead.
		const ownsItsCentre = await button.evaluate((el) => {
			const r = el.getBoundingClientRect();
			return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el;
		});
		expect(ownsItsCentre, `${name} button is covered by another element`).toBe(true);
	}

	// And the tap must actually reach the handler: cancelling closes the sheet.
	await page.getByRole('button', { name: '취소', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeHidden();
});
