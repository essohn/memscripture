# Unpublished landing pages

Held back from the build pending a content review. They are ordinary SvelteKit
routes; moving these three directories back under `src/routes/` republishes
them, and the rest of the wiring is listed below so nothing is missed.

To publish again:

1. `git mv drafts/pages/{guide,about,amsong-day} src/routes/`
2. Re-add the paths to `SITEMAP_ROUTES` in `src/lib/seo/site.ts` — the sitemap
   is what invites a crawler in.
3. Re-add them to `CONTENT_PAGES` in `src/lib/utils/route.ts`, which both
   strips the app chrome from them and tells `hooks.server.ts` they own their
   own head tags. A server-rendered page missing from that set ships two
   `<title>` tags.
4. Drop the matching `Disallow` lines from `static/robots.txt`.
5. Restore the 읽을거리 section in `src/routes/settings/+page.svelte`.

While they are here they are not routed, not built, not linked and not
advertised — `/guide` and the rest fall through to the SPA shell.
