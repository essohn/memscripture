import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import UpdateBanner from '../../src/lib/components/feedback/UpdateBanner.svelte';

function serve(version: string) {
	return vi.fn(async () => new Response(JSON.stringify({ version }), { status: 200 }));
}

beforeEach(() => {
	vi.restoreAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('UpdateBanner', () => {
	// A tab left open keeps running the bundle it loaded, and the only way to
	// find out otherwise was a gesture nobody had been told about.
	it('offers a reload when the server is serving something else', async () => {
		vi.stubGlobal('fetch', serve('0.1.9+bbbbbbb'));
		render(UpdateBanner, { version: '0.1.8+aaaaaaa' });
		await waitFor(() =>
			expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument()
		);
	});

	it('says nothing when the tab is already current', async () => {
		vi.stubGlobal('fetch', serve('0.1.8+aaaaaaa'));
		render(UpdateBanner, { version: '0.1.8+aaaaaaa' });
		await new Promise((r) => setTimeout(r, 0));
		expect(screen.queryByTestId('update-banner')).toBeNull();
	});

	// Offline, or a deploy mid-flight. Nothing worth alarming anyone about.
	it('says nothing when it cannot ask', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('offline');
			})
		);
		render(UpdateBanner, { version: '0.1.8+aaaaaaa' });
		await new Promise((r) => setTimeout(r, 0));
		expect(screen.queryByTestId('update-banner')).toBeNull();
	});

	// It offers rather than acts: reloading on its own would throw away a quiz
	// in progress or half a verse typed into the check panel.
	it('leaves the reader a way to carry on', async () => {
		vi.stubGlobal('fetch', serve('0.1.9+bbbbbbb'));
		render(UpdateBanner, { version: '0.1.8+aaaaaaa' });
		await waitFor(() => expect(screen.getByTestId('update-banner')).toBeInTheDocument());
		await fireEvent.click(screen.getByRole('button', { name: '나중에' }));
		expect(screen.queryByTestId('update-banner')).toBeNull();
	});

	// The check is a request and the trigger fires every time the reader
	// switches apps.
	it('does not ask again the moment the tab comes back', async () => {
		const fetchMock = serve('0.1.8+aaaaaaa');
		vi.stubGlobal('fetch', fetchMock);
		render(UpdateBanner, { version: '0.1.8+aaaaaaa' });
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		document.dispatchEvent(new Event('visibilitychange'));
		await new Promise((r) => setTimeout(r, 0));
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
