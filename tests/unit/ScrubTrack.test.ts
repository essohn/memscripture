import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import ScrubTrack from '../../src/lib/components/player/ScrubTrack.svelte';

const props = { fraction: 0.25, totalMs: 60_000, onSeek: () => {} };

// fractionAt() maps clientX through getBoundingClientRect(), which jsdom
// always reports as zeros. Stub a known-size rect so a clientX maps to a
// known fraction — otherwise every drag resolves to 0 and proves nothing.
function stubRect(el: HTMLElement, left: number, width: number) {
	vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
		left,
		width,
		top: 0,
		height: 0,
		right: left + width,
		bottom: 0,
		x: left,
		y: 0,
		toJSON() {}
	} as DOMRect);
}

describe('ScrubTrack', () => {
	it('exposes the position as a slider', () => {
		render(ScrubTrack, { props });
		const slider = screen.getByRole('slider', { name: '재생 위치' });
		expect(slider).toHaveAttribute('aria-valuemin', '0');
		expect(slider).toHaveAttribute('aria-valuemax', '100');
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

	it('arrow right seeks forward and never above one', async () => {
		const onSeek = vi.fn();
		render(ScrubTrack, { props: { ...props, fraction: 0.98, onSeek } });
		await fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
		expect(onSeek).toHaveBeenCalledWith(1);
	});

	it('ignores keys that are not seeks', async () => {
		const onSeek = vi.fn();
		render(ScrubTrack, { props: { ...props, onSeek } });
		await fireEvent.keyDown(screen.getByRole('slider'), { key: 'Enter' });
		expect(onSeek).not.toHaveBeenCalled();
	});

	it('pointerdown captures the pointer', async () => {
		render(ScrubTrack, { props });
		const track = screen.getByRole('slider');
		stubRect(track, 0, 200);
		await fireEvent.pointerDown(track, { clientX: 100, pointerId: 1 });
		expect(track.hasPointerCapture(1)).toBe(true);
	});

	it('pointermove while held moves the thumb without seeking', async () => {
		const onSeek = vi.fn();
		render(ScrubTrack, { props: { ...props, onSeek } });
		const track = screen.getByRole('slider');
		stubRect(track, 0, 200);
		await fireEvent.pointerDown(track, { clientX: 100, pointerId: 1 });
		await fireEvent.pointerMove(track, { clientX: 150, pointerId: 1 });
		expect(track).toHaveAttribute('aria-valuenow', '75');
		expect(onSeek).not.toHaveBeenCalled();
	});

	it('pointerup releases and seeks to the dragged position, once', async () => {
		const onSeek = vi.fn();
		render(ScrubTrack, { props: { ...props, onSeek } });
		const track = screen.getByRole('slider');
		stubRect(track, 0, 200);
		await fireEvent.pointerDown(track, { clientX: 100, pointerId: 1 });
		await fireEvent.pointerMove(track, { clientX: 150, pointerId: 1 });
		await fireEvent.pointerUp(track, { clientX: 150, pointerId: 1 });
		expect(onSeek).toHaveBeenCalledTimes(1);
		expect(onSeek).toHaveBeenCalledWith(0.75);
		expect(track.hasPointerCapture(1)).toBe(false);
	});

	it('ignores pointermove with no prior pointerdown', async () => {
		const onSeek = vi.fn();
		render(ScrubTrack, { props: { ...props, onSeek } });
		const track = screen.getByRole('slider');
		stubRect(track, 0, 200);
		await fireEvent.pointerMove(track, { clientX: 150, pointerId: 1 });
		expect(track).toHaveAttribute('aria-valuenow', '25');
		expect(onSeek).not.toHaveBeenCalled();
	});

	it('pointercancel behaves like pointerup', async () => {
		const onSeek = vi.fn();
		render(ScrubTrack, { props: { ...props, onSeek } });
		const track = screen.getByRole('slider');
		stubRect(track, 0, 200);
		await fireEvent.pointerDown(track, { clientX: 100, pointerId: 1 });
		await fireEvent.pointerCancel(track, { clientX: 100, pointerId: 1 });
		expect(onSeek).toHaveBeenCalledTimes(1);
		expect(onSeek).toHaveBeenCalledWith(0.5);
		expect(track.hasPointerCapture(1)).toBe(false);
	});
});
