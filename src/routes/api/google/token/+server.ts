import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { exchangeCode } from '$lib/server/googleToken';

// Runs in the Worker, so it must not be prerendered — the root layout turns
// prerendering on for everything, and a prerendered endpoint would be frozen
// at build time into a file with no secret and no way to reach Google.
export const prerender = false;

/**
 * Trades an authorization code for tokens.
 *
 * The client secret is read from a Worker secret, never from wrangler.jsonc:
 * that file is in version control, which is right for the public client ID
 * beside it and would be a disclosure for this.
 */
export const POST: RequestHandler = async ({ request }) => {
	const secret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
	const clientId = publicEnv.PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim();
	if (!secret || !clientId) return json({ error: 'not_configured' }, { status: 503 });

	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const code = typeof body?.code === 'string' ? body.code : '';
	const verifier = typeof body?.code_verifier === 'string' ? body.code_verifier : '';
	const redirectUri = typeof body?.redirect_uri === 'string' ? body.redirect_uri : '';
	if (!code || !verifier || !redirectUri) return json({ error: 'bad_request' }, { status: 400 });

	const result = await exchangeCode({ clientId, clientSecret: secret }, code, verifier, redirectUri);
	return json(result.body, { status: result.status });
};
