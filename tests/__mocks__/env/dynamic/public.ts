/** Stand-in for SvelteKit's $env/dynamic/public, which only exists inside a
 *  build. Route components that read runtime config (the OAuth client id, for
 *  one) are otherwise unreachable from a unit test. */
export const env: Record<string, string | undefined> = {};
