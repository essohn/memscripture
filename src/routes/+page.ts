import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// Today section is temporarily disabled. While disabled, the root path bounces
// to /library so the bottom nav stays the source of truth for landing.
// To re-enable Today: delete this file and restore the TabBar 'today' entry.
export const load: PageLoad = () => {
	throw redirect(307, '/library');
};
