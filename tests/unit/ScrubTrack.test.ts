import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import ScrubTrack from '../../src/lib/components/player/ScrubTrack.svelte';

const props = { fraction: 0.25, totalMs: 60_000, onSeek: () => {} };

describe('ScrubTrack', () => {
	it('exposes the position as a slider', () => {
		render(ScrubTrack, { props });
		const slider = screen.getByRole('slider', { name: '재생 위치' });
		expect(slider).toHaveAttribute('aria-valuenow', '25');
	});

	// Ten seconds' worth is the granularity that is useful in a verse, rather
	// than the one that is easy to implement.
	it('arrow right seeks forward ten seconds', async () => {
		const onSeek = vi.fn();
		render(ScrubTrack, { props: { ...props, onSeek } });
		await fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
		expect(onSeek).toHaveBeenCalledWith(0.25 + 10_000 / 60_000);
	});

	it('arrow left seeks back and never below zero', async () => {
		const onSeek = vi.fn();
		render(ScrubTrack, { props: { ...props, fraction: 0.05, onSeek } });
		await fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' });
		expect(onSeek).toHaveBeenCalledWith(0);
	});

	it('ignores keys that are not seeks', async () => {
		const onSeek = vi.fn();
		render(ScrubTrack, { props: { ...props, onSeek } });
		await fireEvent.keyDown(screen.getByRole('slider'), { key: 'Enter' });
		expect(onSeek).not.toHaveBeenCalled();
	});
});
