import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// execFileSync (no shell) — args are static, but this avoids any shell.
// Returns trimmed stdout, or null if git isn't available / the command fails.
function gitOut(args: string[]): string | null {
	try {
		return execFileSync('git', args, { encoding: 'utf8' }).trim();
	} catch {
		return null;
	}
}

// Derive the displayed version so it changes on every commit instead of sitting
// at the static package.json value. Shape: `major.minor.<patch>+<sha>`, e.g.
// `0.1.187+4469199`, with a `-dev` flag for uncommitted tracked changes.
//
//  - major.minor: from package.json.
//  - patch: the commit count (monotonic) when full history is available; on a
//    SHALLOW clone — how Cloudflare builds the deploy — `rev-list --count` is
//    truncated (often 1), so the count alone would freeze the version. We keep
//    it as a best-effort patch (0 when unknown) but no longer rely on it for
//    uniqueness.
//  - +sha: the short commit SHA, which IS present even at clone depth 1. This is
//    the part that reliably changes per build. Prefer the CI-provided SHA env
//    var (set even when the git binary isn't on the build PATH), then git.
function appVersion(): string {
	const [major = '0', minor = '0'] = pkg.version.split('.');

	const rawSha =
		process.env.CF_PAGES_COMMIT_SHA ?? // Cloudflare Pages
		process.env.WORKERS_CI_COMMIT_SHA ?? // Cloudflare Workers Builds
		process.env.GITHUB_SHA ?? // GitHub Actions
		gitOut(['rev-parse', 'HEAD']);
	const shortSha = rawSha ? rawSha.slice(0, 7) : null;

	const patch = gitOut(['rev-list', '--count', 'HEAD']) ?? '0';

	// `-dev` only makes sense with a real working tree (git diff exits non-zero
	// when HEAD has uncommitted tracked changes).
	let dirty = false;
	if (gitOut(['rev-parse', '--git-dir'])) {
		try {
			execFileSync('git', ['diff', 'HEAD', '--quiet'], { stdio: 'ignore' });
		} catch {
			dirty = true;
		}
	}

	return `${major}.${minor}.${patch}${shortSha ? `+${shortSha}` : ''}${dirty ? '-dev' : ''}`;
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	define: {
		__APP_VERSION__: JSON.stringify(appVersion())
	}
});
