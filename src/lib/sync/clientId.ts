import { env } from '$env/dynamic/public';

/**
 * Returns the Google OAuth client ID configured for this deployment, or
 * null when unset. Callers should treat null as "Drive sync disabled" and
 * hide the affordance.
 */
export function getGoogleOauthClientId(): string | null {
	const id = env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim();
	if (!id) return null;
	return id;
}
