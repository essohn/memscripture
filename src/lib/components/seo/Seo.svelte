<script lang="ts">
	import {
		SITE_DESCRIPTION,
		SITE_IMAGE,
		SITE_IMAGE_HEIGHT,
		SITE_IMAGE_WIDTH,
		SITE_NAME,
		canonical,
		pageTitle
	} from '$lib/seo/site';

	interface Props {
		/** Page title without the brand suffix; omit for the site default. */
		title?: string;
		description?: string;
		/** Site-relative path this page canonically lives at. */
		path: string;
		/** Structured data object, serialized into a ld+json script. */
		jsonLd?: unknown;
		/** App screens have nothing to index — keep them out of the results
		 *  rather than letting an empty shell represent the site. */
		noindex?: boolean;
	}
	let { title, description = SITE_DESCRIPTION, path, jsonLd, noindex = false }: Props = $props();

	const url = $derived(canonical(path));
	const full = $derived(pageTitle(title));
	const image = $derived(canonical(SITE_IMAGE));

	// Every `<` is escaped so a closing script tag inside any future dynamic
	// value cannot end the block early. The data is static today; the escape
	// costs nothing and removes the question. (A regex literal is avoided here
	// on purpose — Svelte's parser reads `/<` as the start of a tag.)
	const ld = $derived(jsonLd ? JSON.stringify(jsonLd).replaceAll('<', '\\u003c') : null);
</script>

<svelte:head>
	<title>{full}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	{#if noindex}
		<meta name="robots" content="noindex, follow" />
	{/if}

	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:locale" content="ko_KR" />
	<meta property="og:title" content={full} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={url} />
	<meta property="og:image" content={image} />
	<!-- Declared so KakaoTalk and Facebook can lay the card out from the tag
	     alone, instead of deferring until they have fetched the image. -->
	<meta property="og:image:width" content={SITE_IMAGE_WIDTH} />
	<meta property="og:image:height" content={SITE_IMAGE_HEIGHT} />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={full} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={image} />

	{#if ld}
		{@html `<script type="application/ld+json">${ld}<` + `/script>`}
	{/if}
</svelte:head>
