/**
 * Renders scripts/og/template.html to static/og.png at exactly 1200x630.
 *
 * Run with `node scripts/og/render.mjs` after editing the template. The PNG is
 * committed, so this is not part of the build — nobody should need Playwright
 * installed to ship the site.
 */
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const WIDTH = 1200;
const HEIGHT = 630;

async function dataUri(path, mime) {
	const buf = await readFile(join(root, path));
	return `data:${mime};base64,${buf.toString('base64')}`;
}

// replaceAll, not replace: a single replace takes the first occurrence, and
// any mention of a token elsewhere in the file silently steals the swap.
const html = (await readFile(join(here, 'template.html'), 'utf8'))
	.replaceAll('__FONT__', await dataUri('static/fonts/PretendardVariable.woff2', 'font/woff2'))
	.replaceAll('__ICON__', await dataUri('static/icon-192.png', 'image/png'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await page.setContent(html, { waitUntil: 'load' });
// setContent resolves before webfonts finish; a card rendered in the fallback
// face is the whole point of embedding Pretendard, so wait for it explicitly.
await page.evaluate(() => document.fonts.ready);
// And assert the artwork actually decoded. A broken <img> renders as empty
// space that looks like deliberate padding — this shipped once already.
const iconWidth = await page.evaluate(() => document.querySelector('.brand img')?.naturalWidth ?? 0);
if (iconWidth === 0) throw new Error('brand icon failed to load — check the token swap');
const png = await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
await browser.close();

await writeFile(join(root, 'static/og.png'), png);
console.log(`static/og.png — ${WIDTH}x${HEIGHT}, ${(png.length / 1024).toFixed(0)}KB`);
