import type { Handle } from '@sveltejs/kit';
import { isContentPage } from '$lib/utils/route';

/**
 * Matches the static fallback head block in src/app.html.
 *
 * Non-greedy, so it stops at the first closing sentinel rather than eating the
 * rest of the document if the markers are ever duplicated.
 */
const SEO_FALLBACK = /<!--seo-fallback-->[\s\S]*?<!--\/seo-fallback-->/;

/**
 * Removes the static head fallback from pages that render their own.
 *
 * app.html carries a hardcoded title, description and Open Graph set, because
 * the app is client-rendered and the crawlers that matter most in Korea —
 * Naver, and the KakaoTalk link preview — do not run JavaScript. The
 * server-rendered content pages do emit their own head, so without this they
 * would ship two title tags, and which one wins is a rule about document order
 * rather than a decision anyone made.
 *
 * Only the content routes are stripped. The SPA fallback shell is rendered
 * with no matched route, so it keeps the block — which is the entire point of
 * having it.
 */
export const handle: Handle = ({ event, resolve }) =>
	resolve(event, {
		transformPageChunk: ({ html }) =>
			isContentPage(event.url.pathname) ? html.replace(SEO_FALLBACK, '') : html
	});
