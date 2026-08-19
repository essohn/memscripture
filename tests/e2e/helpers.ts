import { expect, type Page } from '@playwright/test';

/**
 * Joins the team that 100구절, 900구절 and the 암송 DAY schedule belong to.
 *
 * Those are withheld from readers outside the team — the package route even
 * 404s — so any spec that touches them has to say who it is first. Done
 * through the invite link, which is the same path a reader takes.
 *
 * The wait is on the app's own signal rather than on IndexedDB: opening the
 * database from the test creates an empty one when the app has not yet, which
 * races Dexie's versioned open. The layout strips `team` from the URL once the
 * join resolves, so the parameter disappearing is the join finishing.
 */
export async function joinTeam(page: Page, code = 'cdm-b'): Promise<void> {
	await page.goto(`/?team=${code}`);
	await expect(page).toHaveURL((url) => !url.searchParams.has('team'));
}
