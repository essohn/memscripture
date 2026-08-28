import { test, expect } from '@playwright/test';

/*
 * The check input is the one field anyone types a whole verse into, and it was
 * the smallest reading text on the panel at 14px.
 *
 * It went unnoticed because on a phone it never rendered that way: the
 * `pointer: coarse` floor in app.css — there to stop iOS zooming, not for
 * legibility — quietly raised it to 16px. A desktop pointer, where that rule
 * does not apply, got the 14px the class actually asked for. So the box
 * holding the most text was the one showing it smallest, on the platform with
 * the most room for it.
 *
 * Asserted without `test.use`, so it runs under both projects: the phone,
 * where the floor is what holds the line, and the desktop, where the class
 * itself has to.
 */
test('the check input is at least 16px on any pointer', async ({ page }) => {
	await page.goto('/library/5_krv');
	await page.getByRole('button', { name: '점검' }).first().click();
	const input = page.getByLabel('암송 구절 입력');
	await expect(input).toBeVisible();
	const size = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
	expect(size).toBeGreaterThanOrEqual(16);
});
