import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { joinTeam } from './helpers';

test('home renders the dashboard at / and Pretendard is the active body font', async ({ page }) => {
	await page.goto('/');
	// Dashboard route — stays at /, no redirect.
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

	// Wait for fonts to settle
	await page.evaluate(() => document.fonts.ready);

	// Body's computed font-family should reference Pretendard Variable
	const bodyFontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
	expect(bodyFontFamily).toContain('Pretendard');

	// And the font is actually loaded (used = true means rendered with Pretendard, not fallback)
	const fontUsed = await page.evaluate(() => {
		return document.fonts.check('16px "Pretendard Variable"');
	});
	expect(fontUsed).toBe(true);
});

// The quiz card shipped with no bottom margin, so the 최근 heading sat flush
// against its lower edge — a zero-pixel gap, measured. Every other top-level
// block on this page owns the space beneath it (EventSection carries mb-8),
// and the quiz card is the one that did not.
//
// Asserted in a real browser rather than jsdom on purpose: this is a layout
// bug, and jsdom computes no layout, so a unit test could only check that a
// class string is present rather than that the pixels moved.
test('the quiz card does not run into the section beneath it', async ({ page }) => {
	await page.goto('/');
	const quiz = page.getByRole('link', { name: /퀴즈/ });
	await expect(quiz).toBeVisible();

	const gap = await page.evaluate(() => {
		const card = document.querySelector('a[href="/quiz"]');
		const next = card?.nextElementSibling;
		if (!card || !next) return -1;
		return Math.round(next.getBoundingClientRect().top - card.getBoundingClientRect().bottom);
	});

	// 24px is the tightest gap this page uses between blocks; anything less
	// reads as the two being one element.
	expect(gap).toBeGreaterThanOrEqual(24);
});

/**
 * A speechSynthesis that reports progress without making a sound.
 *
 * Headless Chromium exposes the interface but never fires `end` or
 * `boundary`, so a real one would leave the bar frozen and prove nothing.
 * This one ends each utterance on a timer, which is enough for the bar to
 * appear, name a verse, and be dismissed.
 */
const FAKE_SYNTH = `
	class FakeUtterance extends EventTarget {
		constructor(text) { super(); this.text = text; this.lang = ''; this.rate = 1; this.voice = null;
			this.onend = null; this.onerror = null; this.onboundary = null; }
	}
	let current = null;
	window.SpeechSynthesisUtterance = FakeUtterance;
	Object.defineProperty(window, 'speechSynthesis', {
		configurable: true,
		value: {
			speaking: false, pending: false, paused: false,
			getVoices: () => [{ name: 'Test Korean', lang: 'ko-KR', localService: true }],
			speak(u) {
				current = u;
				this.speaking = true;
				setTimeout(() => { if (current === u) { this.speaking = false; current = null; u.onend && u.onend(); } }, 3000);
			},
			cancel() { const u = current; current = null; this.speaking = false; if (u && u.onend) u.onend(); },
			resume() {}
		}
	});
`;

/**
 * Same local-date rule as todayLocalKey() in src/lib/db/activity.ts, not
 * toISOString() — that's UTC and would disagree with the app near midnight
 * in KST, skipping (or not) on a different clock than the one deciding what
 * the home screen shows.
 */
function todayLocalKey(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/**
 * Same rule as activeEvents() in src/lib/db/events.ts, read from the shipped
 * fixture rather than a copied date — a hardcoded date rots the same way the
 * fixture's own dueAt eventually will. When this is false there is genuinely
 * no 암송 DAY on screen to listen to, and the spec has nothing to assert.
 */
function hasActiveEvent(): boolean {
	const raw = readFileSync(new URL('../../static/data/events.json', import.meta.url), 'utf-8');
	const events = JSON.parse(raw) as Array<{ startAt?: string; dueAt: string }>;
	const today = todayLocalKey();
	return events.some((e) => (e.startAt ? e.startAt <= today : true) && today <= e.dueAt);
}

test('home offers 전체 듣기 for the 암송 DAY and the bar can be dismissed', async ({ page }) => {
	test.skip(
		!hasActiveEvent(),
		'No active 암송 DAY in static/data/events.json — add one with a live dueAt to exercise this spec.'
	);

	await page.addInitScript(FAKE_SYNTH);
	await joinTeam(page);

	// The home card only carries verse text for packages it can already read
	// from IndexedDB — home must never install one just to build its card, so
	// on a fresh profile the day's ranges show but this button does not.
	// Opening each package once through the library is the same door any
	// reader would use before coming back to a schedule that reads it to them.
	await page.goto('/library/242_krv');
	await expect(page.getByTestId('verse-row').first()).toBeVisible();
	await page.goto('/library/900_krv');
	await expect(page.getByTestId('verse-row').first()).toBeVisible();

	// A fresh load, not a client-side return: the event card is built by a
	// $effect racing the layout's own join effect, and right after joinTeam
	// that race is lost more often than won, leaving the card empty for good
	// with nothing left to re-trigger it. This navigation starts only after
	// both the join and the two installs have already landed, so there is
	// nothing left to race.
	await page.goto('/');

	const listen = page.getByRole('button', { name: /전체 듣기$/ }).first();
	await expect(listen).toBeVisible();
	await listen.click();

	// The bar names the verse it is reading and how far into the list it is.
	// 242_krv verse 1 opens the day's first range, so this is what a reader
	// actually hears first, not a placeholder any label would satisfy.
	const close = page.getByRole('button', { name: '재생 닫기' });
	await expect(close).toBeVisible();
	await expect(page.getByText('고린도후서 13 : 5', { exact: true })).toBeVisible();
	await expect(page.getByText('1/149', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: '목록 반복' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	await close.click();
	await expect(close).toBeHidden();
});
