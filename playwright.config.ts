import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: true,
	reporter: 'list',
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry'
	},
	webServer: {
		command: 'pnpm build && pnpm preview',
		port: 4173,
		timeout: 120_000,
		reuseExistingServer: !process.env.CI
	},
	projects: [
		{ name: 'chromium', use: devices['Desktop Chrome'] },
		{ name: 'iphone-14', use: devices['iPhone 14'] }
	]
});
