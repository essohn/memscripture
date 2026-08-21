import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { refreshToken } from '$lib/server/googleToken';

export const prerender = false;

/**
 * Trades a refresh token for a fresh access token.
 *
 * This is what replaces the popup: an ordinary fetch, so it works while the
 * app is opening, in the background, and without a window appearing.
 */
export const POST: RequestHandler = async ({ request }) => {
	const secret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
	const clientId = publicEnv.PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim();
	if (!secret || !clientId) return json({ error: 'not_configured' }, { status: 503 });

	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const refresh = typeof body?.refresh_token === 'string' ? body.refresh_token : '';
	if (!refresh) return json({ error: 'bad_request' }, { status: 400 });

	const result = await refreshToken({ clientId, clientSecret: secret }, refresh);
	return json(result.body, { status: result.status });
};
