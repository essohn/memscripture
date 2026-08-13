/**
 * Site-level identity, in one place.
 *
 * Canonical links, Open Graph tags and the sitemap all need the same absolute
 * origin, and a mismatch between any two of them is the kind of thing that
 * silently costs a ranking rather than breaking a test.
 */
export const SITE_URL = 'https://mem.lifescripture.org';

export const SITE_NAME = 'MemScripture';

/** Korean, because every user-facing word in this app is. A search for
 *  "MemScripture" is a search by someone who already knows us. */
export const SITE_TITLE = 'MemScripture — 성경 암송 앱';

export const SITE_DESCRIPTION =
	'성경 구절을 외우고 스스로 점검하는 무료 웹 앱. 구절을 가린 채 한 단어씩 여는 연습과, 직접 입력해 정확도·속도를 재는 점검을 함께 제공합니다. 설치 없이 브라우저에서 바로 쓰고, 구글 드라이브로 기기 간 동기화됩니다.';

/** Shared social preview image. The maskable 512 icon is the only square
 *  artwork that ships, and a missing og:image leaves a blank card in
 *  KakaoTalk — the way a Korean church app actually spreads. */
export const SITE_IMAGE = '/icon-512.png';

/** Absolute URL for a site-relative path. Trailing slashes are dropped so
 *  `/guide` and `/guide/` cannot both be advertised as canonical. */
export function canonical(path: string): string {
	if (!path.startsWith('/')) path = `/${path}`;
	const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path;
	return `${SITE_URL}${trimmed}`;
}

/** Page title with the brand appended, unless the page is the brand itself. */
export function pageTitle(title?: string): string {
	if (!title || title === SITE_TITLE) return SITE_TITLE;
	return `${title} | ${SITE_NAME}`;
}

/**
 * Pages worth advertising to a search engine, newest-intent first.
 *
 * Only routes that render meaningful text without a user's local data belong
 * here. The app screens read from IndexedDB, so a crawler that follows them
 * finds an empty shell — listing them would spend crawl budget proving there
 * is nothing to see.
 */
export const SITEMAP_ROUTES: { path: string; changefreq: string; priority: string }[] = [
	{ path: '/', changefreq: 'weekly', priority: '1.0' },
	{ path: '/guide', changefreq: 'monthly', priority: '0.9' },
	{ path: '/about', changefreq: 'monthly', priority: '0.8' }
];
