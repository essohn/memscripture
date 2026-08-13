import { SITEMAP_ROUTES, canonical } from '$lib/seo/site';

// Prerendered to a static file, so the SPA fallback never gets a chance to
// answer /sitemap.xml with the app shell — which is what a crawler would
// otherwise be handed, and what would make the sitemap look broken.
export const prerender = true;

export function GET(): Response {
	const urls = SITEMAP_ROUTES.map(
		({ path, changefreq, priority }) =>
			`	<url>
		<loc>${canonical(path)}</loc>
		<changefreq>${changefreq}</changefreq>
		<priority>${priority}</priority>
	</url>`
	).join('\n');

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
		{ headers: { 'content-type': 'application/xml; charset=utf-8' } }
	);
}
