import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// Derive the displayed version from git so it changes on every commit instead
// of sitting at the static package.json value: major.minor from package.json +
// the commit count as the patch (monotonically increasing), with a `-dev` flag
// when there are uncommitted changes to tracked files. Falls back to the plain
// package.json version when git isn't available (e.g. a tarball/CI build).
// execFileSync (no shell) — the args are static, but this avoids any shell.
function appVersion(): string {
	try {
		const count = execFileSync('git', ['rev-list', '--count', 'HEAD'], {
			encoding: 'utf8'
		}).trim();
		const [major = '0', minor = '0'] = pkg.version.split('.');
		let dirty = false;
		try {
			execFileSync('git', ['diff', 'HEAD', '--quiet'], { stdio: 'ignore' });
		} catch {
			dirty = true;
		}
		return `${major}.${minor}.${count}${dirty ? '-dev' : ''}`;
	} catch {
		return pkg.version;
	}
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	define: {
		__APP_VERSION__: JSON.stringify(appVersion())
	}
});
