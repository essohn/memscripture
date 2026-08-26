import { test, expect } from '@playwright/test';

test.describe('표에서 가져오기', () => {
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

		// Stand in for bolls.life so the run neither depends on that host being
		// up nor pays for its latency. One verse per number, so any range in
		// the fixture resolves.
		await page.route('https://bolls.life/get-text/**', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(
					Array.from({ length: 40 }, (_, i) => ({ verse: i + 1, text: `본문 ${i + 1}` }))
				)
			})
		);
	});

	test('paste → confirm → fill → save', async ({ page }) => {
		await page.goto('/library/oyo');

		// The 가져오기 button now offers two doors.
		await page.getByRole('button', { name: '가져오기' }).click();
		await page.getByRole('menuitem', { name: /표에서 가져오기/ }).click();
		await expect(page).toHaveURL(/\/oyo\/import\/table$/);

		// A three-row table with no bodies at all — the fill has to supply them.
		await page
			.getByLabel('표 붙여넣기')
			.fill('장절\t제목\n요 3:16\t영생\n창 12:1\t부르심\n시 23:1\t목자');
		await page.getByRole('button', { name: '표 읽기' }).click();

		// Step one: the guess, shown before anything is fetched.
		await expect(page.getByText('이렇게 읽었습니다. 맞나요?')).toBeVisible();
		await expect(page.getByText('본문 없는 3개는 성경에서 가져옵니다')).toBeVisible();

		await page.getByRole('button', { name: '맞아요, 계속' }).click();

		// Step two: the bodies land and the save button counts them.
		await expect(page.getByText('본문 16')).toBeVisible();
		const save = page.getByRole('button', { name: /나의 구절에 담기 \(3\)/ });
		await expect(save).toBeEnabled();
		await save.click();

		await expect(page.getByText('3개 구절을 나의 구절에 담았습니다')).toBeVisible();

		// And they are really there.
		await page.getByRole('link', { name: '나의 구절 보기' }).click();
		await expect(page).toHaveURL(/\/library\/oyo$/);
		await expect(page.getByText('요한복음 3 : 16')).toBeVisible();
		await expect(page.getByText('창세기 12 : 1')).toBeVisible();
		await expect(page.getByText('시편 23 : 1')).toBeVisible();
	});

	test('an .xlsx is refused with a way out', async ({ page }) => {
		await page.goto('/oyo/import/table');
		await page.getByLabel('CSV 파일 선택').setInputFiles({
			name: 'verses.xlsx',
			mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])
		});
		await expect(page.getByText(/엑셀 파일은 아직 직접 읽지 못합니다/)).toBeVisible();
	});
});
