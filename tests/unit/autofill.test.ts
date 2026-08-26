import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fillMissingBodies, type FillProgress } from '../../src/lib/oyo/autofill';
import { __clearChapterCacheForTest } from '../../src/lib/bible/fetch';
import type { TableDraft } from '../../src/lib/oyo/tableColumns';

function draft(cite: string, w = ''): TableDraft {
	return { row: 1, cite, title: '', w };
}

/** Stands in for bolls.life. Every chapter answers with one verse per number
 *  so a range always resolves to something. */
function stubFetch(onCall?: (url: string) => void) {
	const spy = vi.fn(async (url: string) => {
		onCall?.(url);
		const verses = Array.from({ length: 40 }, (_, i) => ({
			verse: i + 1,
			text: `절 ${i + 1}`
		}));
		return { ok: true, json: async () => verses } as unknown as Response;
	});
	vi.stubGlobal('fetch', spy);
	return spy;
}

beforeEach(() => {
	__clearChapterCacheForTest();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('fillMissingBodies', () => {
	it('leaves a row that already has a body untouched', async () => {
		const spy = stubFetch();
		const seen: FillProgress[] = [];
		const out = await fillMissingBodies([draft('요 3:16', '이미 있는 본문')], (p) => seen.push(p));
		expect(spy).not.toHaveBeenCalled();
		expect(seen).toEqual([]);
		expect(out).toEqual({ filled: 0, failed: 0, abortedEarly: false });
	});

	it('fetches one chapter however many rows point into it', async () => {
		const urls: string[] = [];
		stubFetch((u) => urls.push(u));
		const drafts = [draft('시 119:1'), draft('시 119:2'), draft('시 119:3')];
		const out = await fillMissingBodies(drafts, () => {});
		expect(urls).toHaveLength(1);
		expect(out.filled).toBe(3);
	});

	it('reports each row loading and then ready, with its text', async () => {
		stubFetch();
		const seen: FillProgress[] = [];
		await fillMissingBodies([draft('요 3:16')], (p) => seen.push(p));
		expect(seen[0]).toEqual({ index: 0, status: 'loading' });
		expect(seen[1].status).toBe('ready');
		expect(seen[1].w).toBe('절 16');
	});

	it('resolves an unparseable citation without a request', async () => {
		const spy = stubFetch();
		const seen: FillProgress[] = [];
		const out = await fillMissingBodies([draft('토비트 3 : 1')], (p) => seen.push(p));
		expect(spy).not.toHaveBeenCalled();
		expect(seen).toEqual([{ index: 0, status: 'no-body' }]);
		expect(out.failed).toBe(1);
	});

	it('marks a row no-body when its verse range is outside the chapter', async () => {
		stubFetch();
		const seen: FillProgress[] = [];
		await fillMissingBodies([draft('요 3:900')], (p) => seen.push(p));
		expect(seen.at(-1)).toEqual({ index: 0, status: 'no-body' });
	});

	it('marks a whole chapter group no-body when the chapter cannot be fetched', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response));
		const seen: FillProgress[] = [];
		const out = await fillMissingBodies([draft('요 3:16'), draft('요 3:17')], (p) => seen.push(p));
		expect(seen.filter((p) => p.status === 'no-body').map((p) => p.index)).toEqual([0, 1]);
		expect(out.failed).toBe(2);
	});

	it('gives up on a chapter that never answers', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise<Response>(() => {}))
		);
		const seen: FillProgress[] = [];
		const out = await fillMissingBodies([draft('요 3:16')], (p) => seen.push(p), {
			timeoutMs: 10
		});
		expect(seen.at(-1)).toEqual({ index: 0, status: 'no-body' });
		expect(out.failed).toBe(1);
	});

	it('stops after three chapters fail in a row and says so', async () => {
		const spy = vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response);
		vi.stubGlobal('fetch', spy);
		const drafts = [
			draft('요 1:1'),
			draft('요 2:1'),
			draft('요 3:1'),
			draft('요 4:1'),
			draft('요 5:1'),
			draft('요 6:1')
		];
		const out = await fillMissingBodies(drafts, () => {}, { concurrency: 1 });
		expect(out.abortedEarly).toBe(true);
		expect(spy.mock.calls.length).toBeLessThan(drafts.length);
		expect(out.failed).toBe(drafts.length);
	});

	it('resolves every row exactly once even when it gives up early', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response));
		const drafts = [draft('요 1:1'), draft('요 2:1'), draft('요 3:1'), draft('요 4:1')];
		const seen: FillProgress[] = [];
		await fillMissingBodies(drafts, (p) => seen.push(p), { concurrency: 1 });
		const terminal = seen.filter((p) => p.status !== 'loading').map((p) => p.index);
		expect([...terminal].sort()).toEqual([0, 1, 2, 3]);
	});

	it('stops between chapters when the signal aborts', async () => {
		const controller = new AbortController();
		const spy = vi.fn(async () => {
			controller.abort();
			const verses = [{ verse: 1, text: '절 1' }];
			return { ok: true, json: async () => verses } as unknown as Response;
		});
		vi.stubGlobal('fetch', spy);
		const drafts = [draft('요 1:1'), draft('요 2:1'), draft('요 3:1')];
		await fillMissingBodies(drafts, () => {}, { concurrency: 1, signal: controller.signal });
		expect(spy).toHaveBeenCalledTimes(1);
	});
});
