import { vi } from 'vitest';

/**
 * SvelteKit's `$app/state`, reduced to what these tests actually touch.
 *
 * `url` is a getter rather than a captured value: the import screens read
 * `page.url` inside an effect purely to re-run it when the location changes,
 * and a snapshot taken at import time would go stale the moment a test set
 * `location.hash`. The fragment itself those screens read from `location`
 * directly, so this only has to move when the location does.
 */
export const page = {
	get url() {
		return new URL(location.href);
	},
	params: {},
	route: { id: null as string | null },
	status: 200,
	error: null,
	data: {},
	form: null
};

export const navigating = null;
export const updated = { current: false, check: vi.fn(async () => false) };
