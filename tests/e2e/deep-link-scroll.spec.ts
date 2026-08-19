import { test, expect } from '@playwright/test';
import { joinTeam } from './helpers';

// The home dashboard links a bundle/event range as /library/{id}?sel=127,128,...
// The list must anchor the FIRST verse of the range just under the sticky
// header — landing mid-viewport buries it behind unselected earlier verses.
const RANGE = Array.from({ length: 36 }, (_, i) => 127 + i);

test('?sel deep-link anchors the first verse near the top, not the middle', async ({ page }) => {
	await joinTeam(page);
	await page.goto(`/library/900_krv?sel=${RANGE.join(',')}`);

	const first = page.locator('#verse-127');
	// Generous on purpose: this is the 900-verse package, so the first paint
	// waits on installing and rendering all 900 rows. The default 5s covers it
	// on a laptop and does not on a CI runner, which is exactly the shape of
	// flake that gets a suite ignored.
	await expect(first).toBeAttached({ timeout: 20_000 });

	// The jump is a smooth scroll across ~33,000px; wait for scrollY to settle.
	await page.waitForFunction(
		() => {
			const w = window as unknown as { __lastY?: number; __stable?: number };
			const y = Math.round(window.scrollY);
			w.__stable = y === w.__lastY ? (w.__stable ?? 0) + 1 : 0;
			w.__lastY = y;
			return y > 0 && (w.__stable ?? 0) >= 5;
		},
		null,
		{ timeout: 15_000, polling: 100 }
	);

	const box = (await first.boundingBox())!;
	const viewportH = page.viewportSize()!.height;

	// Anchored below the sticky header, well inside the top third of the screen.
	expect(box.y).toBeGreaterThan(0);
	expect(box.y).toBeLessThan(viewportH / 3);

	// And no earlier (unselected) verse should be sitting above it on screen.
	const idAtTop = await page.evaluate(() => {
		for (const el of document.querySelectorAll('[id^="verse-"]')) {
			if (el.getBoundingClientRect().top >= -20) return el.id;
		}
		return null;
	});
	expect(idAtTop).toBe('verse-127');
});
