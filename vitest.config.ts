import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import path from 'node:path';

export default defineConfig({
	plugins: [svelte(), svelteTesting()],
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib')
		}
	},
	test: {
		environment: 'jsdom',
		include: ['tests/unit/**/*.test.ts'],
		globals: true,
		setupFiles: ['./tests/unit/setup.ts']
	}
});
