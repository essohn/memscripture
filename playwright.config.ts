import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: true,
	reporter: 'list',
	use: {
		baseURL: 'http://localhost:4183',
		trace: 'on-first-retry'
	},
	/*
	 * Its own port, and never anyone else's server.
	 *
	 * 4173 is vite preview's default, so it is the port every other project on
	 * the machine also reaches for — and `reuseExistingServer` meant that
	 * whatever answered there got tested. A plain file server squatting on it
	 * once turned a port collision into 38 failing specs that had nothing to
	 * do with the code: every one of them had loaded a directory listing.
	 *
	 * Refusing to reuse turns that into a bind error naming the port, which is
	 * a question with an answer.
	 */
	webServer: {
		command: 'pnpm build && pnpm preview --port 4183',
		port: 4183,
		timeout: 120_000,
		reuseExistingServer: false
	},
	projects: [
		{ name: 'chromium', use: devices['Desktop Chrome'] },
		{ name: 'iphone-14', use: devices['iPhone 14'] }
	]
});
