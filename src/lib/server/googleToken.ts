/**
 * The Worker's half of the OAuth code flow.
 *
 * It exists for one reason: the client secret cannot live in a browser, and
 * Google will not issue a refresh token without it. Everything else about the
 * flow happens on the device — this holds no state, stores nothing, and never
 * sees the reader's Drive contents. It adds the secret to a request and hands
 * a narrowed reply back.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export interface TokenExchangeConfig {
	clientId: string;
	clientSecret: string;
}

export interface TokenExchangeResult {
	status: number;
	body: Record<string, unknown>;
}

/** The only fields this app has any business relaying. An id_token carries
 *  profile claims nothing here reads, and narrowing means a future addition to
 *  Google's response cannot start flowing to the browser unnoticed. */
const RELAYED = ['access_token', 'refresh_token', 'expires_in', 'token_type'] as const;

function relay(body: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const key of RELAYED) if (key in body) out[key] = body[key];
	return out;
}

async function post(
	params: Record<string, string>,
	fetchImpl: typeof fetch = fetch
): Promise<TokenExchangeResult> {
	const res = await fetchImpl(TOKEN_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(params).toString()
	});
	const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	// Google's failure bodies quote the request back, including the grant and
	// the client. Relaying one verbatim would put the secret's own error text
	// in front of a browser, so failures are reported flatly.
	if (!res.ok) return { status: res.status, body: { error: 'token_exchange_failed' } };
	return { status: 200, body: relay(body) };
}

export function exchangeCode(
	cfg: TokenExchangeConfig,
	code: string,
	verifier: string,
	redirectUri: string,
	fetchImpl?: typeof fetch
): Promise<TokenExchangeResult> {
	return post(
		{
			client_id: cfg.clientId,
			client_secret: cfg.clientSecret,
			code,
			code_verifier: verifier,
			grant_type: 'authorization_code',
			redirect_uri: redirectUri
		},
		fetchImpl
	);
}

export function refreshToken(
	cfg: TokenExchangeConfig,
	refresh: string,
	fetchImpl?: typeof fetch
): Promise<TokenExchangeResult> {
	return post(
		{
			client_id: cfg.clientId,
			client_secret: cfg.clientSecret,
			refresh_token: refresh,
			grant_type: 'refresh_token'
		},
		fetchImpl
	);
}
