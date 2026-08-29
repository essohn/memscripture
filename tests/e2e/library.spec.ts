import { test, expect } from '@playwright/test';
import { joinTeam } from './helpers';

test('library lists curated packages and the user-defined OYO package', async ({ page }) => {
	await joinTeam(page);
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

// The team gate, from the outside. Every spec above joins first, so without
// this nothing would notice if the gate stopped gating.
test('team packages are withheld from a reader with no team', async ({ page }) => {
	await page.goto('/library');
	await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

	// Open to everyone
	await expect(page.getByText('그리스도와의 새출발 5구절')).toBeVisible();
	// Team-scoped
	await expect(page.getByText('무장 900구절')).toHaveCount(0);
	await expect(page.getByText('확립 100구절')).toHaveCount(0);
	await expect(page.getByTestId('package-card')).toHaveCount(6);
});

test('joining a team opens its packages', async ({ page }) => {
	await page.goto('/library');
	await expect(page.getByTestId('package-card')).toHaveCount(6);

	await joinTeam(page);
	await page.goto('/library');
	await expect(page.getByText('무장 900구절')).toBeVisible();
	await expect(page.getByTestId('package-card')).toHaveCount(8);
});

/*
 * A 구절집 narrowed by series, group or range is a list, and the useful next
 * move on a list is to hear it. Asserted end to end rather than in jsdom
 * because the buttons only exist where the browser has speech, and jsdom does
 * not — a unit test would be asserting the stub.
 */
test('a package list offers 전체 듣기 and 따라 읽기', async ({ page }) => {
	await page.goto('/library/5_krv');
	await expect(page.getByTestId('verse-row')).toHaveCount(5);
	await expect(page.getByLabel(/전체 듣기/)).toBeVisible();
	await expect(page.getByLabel(/따라 읽기/)).toBeVisible();
});
