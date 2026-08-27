import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Settings from '../../src/routes/settings/+page.svelte';
import { goto } from '$app/navigation';

vi.mock('$app/navigation', async () => ({
	...(await vi.importActual<Record<string, unknown>>('$app/navigation')),
	goto: vi.fn()
}));

describe('settings back button', () => {
	// spyOn hands back the existing spy when one is already installed, so
	// without this the second case inherits the first case's call count.
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.mocked(goto).mockClear();
	});

	// Settings is reached from the gear in the shared Header, which sits on
	// nearly every screen. Sending the reader Home dropped them out of whatever
	// list they were working through — a difficulty group, a search result —
	// with no way back to it.
	it('returns to wherever the reader came from', async () => {
		history.pushState({}, '', '/settings'); // arrived from somewhere
		const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
		render(Settings);

		await fireEvent.click(screen.getByRole('button', { name: '뒤로' }));

		expect(back).toHaveBeenCalled();
		expect(goto).not.toHaveBeenCalled();
	});

	// A cold load — opened straight to /settings — has nothing to pop.
	it('falls back home when there is no history to pop', async () => {
		const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
		vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
		render(Settings);

		await fireEvent.click(screen.getByRole('button', { name: '뒤로' }));

		expect(back).not.toHaveBeenCalled();
		expect(goto).toHaveBeenCalledWith('/');
	});
});
