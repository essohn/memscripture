import { test, expect } from '@playwright/test';

test.describe('OYO package — phase 1', () => {
	test.beforeEach(async ({ page }) => {
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
		await page.waitForLoadState('networkidle');

		// Stub the KRV text endpoint so the autofill flow is deterministic and
		// doesn't actually hit bolls.life from CI. Returning an empty array lets
		// the silent-fail branch run (body stays empty for the test to fill).
		await page.route('https://bolls.life/**', (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
		);
	});

	test('add → view → edit → delete (with undo) on /library/oyo', async ({ page }) => {
		// Library list shows the OYO card with chip
		await page.goto('/library');
		await expect(page.getByText('사용자 정의')).toBeVisible();

		// Tap OYO card
		await page.getByRole('link', { name: /OYO/i }).click();
		await expect(page).toHaveURL(/\/library\/oyo$/);
		await expect(page.getByText('아직 추가된 구절이 없어요.')).toBeVisible();

		// Add a verse
		await page.getByRole('button', { name: /구절 추가/ }).click();
		await page.getByLabel('장절').fill('요 3:16');
		await page.getByLabel('제목 (선택)').fill('영생');
		await page.getByRole('textbox', { name: '본문' }).fill('하나님이 세상을 이처럼 사랑하사…');
		await page.getByRole('button', { name: '저장' }).click();

		// Verse renders. The blur on 장절 normalizes the freehand input to the
		// project-standard form (요한복음 3 : 16).
		await expect(page.getByText('영생')).toBeVisible();
		await expect(page.getByText('요한복음 3 : 16')).toBeVisible();
		await expect(page.getByText('총 1개')).toBeVisible();

		// Edit it
		await page.getByRole('button', { name: '구절 메뉴' }).click();
		await page.getByRole('menuitem', { name: /편집/ }).click();
		await page.getByLabel('제목 (선택)').fill('영생 (요한복음)');
		await page.getByRole('button', { name: '저장' }).click();
		await expect(page.getByText('영생 (요한복음)')).toBeVisible();

		// Delete with undo
		await page.getByRole('button', { name: '구절 메뉴' }).click();
		await page.getByRole('menuitem', { name: /삭제/ }).click();
		await expect(page.getByText('아직 추가된 구절이 없어요.')).toBeVisible();
		await expect(page.getByText('영생 (요한복음)')).not.toBeVisible();
		await expect(page.getByRole('status')).toContainText('구절을 지웠어요');
		await page.getByRole('button', { name: '실행 취소' }).click();
		await expect(page.getByText('영생 (요한복음)')).toBeVisible();
	});
});
