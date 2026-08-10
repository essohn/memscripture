import { describe, expect, it, vi } from 'vitest';
// fireEvent, not user-event: the latter is not a dependency of this project
// and the no-new-dependencies constraint applies to devDependencies too.
// Every existing component test uses fireEvent — see BookmarkControl.test.ts.
import { fireEvent, render, screen } from '@testing-library/svelte';
import EventExportSheet from '../../src/lib/components/home/EventExportSheet.svelte';

const props = { eventTitle: '2026 여름 암송 DAY', busy: false };

describe('EventExportSheet', () => {
	it('defaults both options on', () => {
		render(EventExportSheet, { ...props, onConfirm: vi.fn(), onCancel: vi.fn() });
		expect(screen.getByLabelText(/난이도 열 포함/)).toBeChecked();
		expect(screen.getByLabelText(/장절 순서/)).toBeChecked();
	});

	it('confirms the defaults untouched', async () => {
		const onConfirm = vi.fn();
		render(EventExportSheet, { ...props, onConfirm, onCancel: vi.fn() });
		await fireEvent.click(screen.getByRole('button', { name: '다운로드' }));
		expect(onConfirm).toHaveBeenCalledWith({
			includeDifficulty: true,
			sortByScripture: true
		});
	});

	// Both boxes now start checked, so unchecking is the path that proves the
	// bindings are live rather than the confirm handler echoing its defaults.
	it('reports each box after it is unchecked', async () => {
		const onConfirm = vi.fn();
		render(EventExportSheet, { ...props, onConfirm, onCancel: vi.fn() });
		await fireEvent.click(screen.getByLabelText(/장절 순서/));
		await fireEvent.click(screen.getByRole('button', { name: '다운로드' }));
		expect(onConfirm).toHaveBeenLastCalledWith({
			includeDifficulty: true,
			sortByScripture: false
		});

		await fireEvent.click(screen.getByLabelText(/난이도 열 포함/));
		await fireEvent.click(screen.getByRole('button', { name: '다운로드' }));
		expect(onConfirm).toHaveBeenLastCalledWith({
			includeDifficulty: false,
			sortByScripture: false
		});
	});

	it('disables the confirm button while a download is running', () => {
		render(EventExportSheet, { ...props, busy: true, onConfirm: vi.fn(), onCancel: vi.fn() });
		expect(screen.getByRole('button', { name: /다운로드/ })).toBeDisabled();
	});

	// The confirm button keeps a static aria-label, so aria-busy is the only
	// way a screen reader hears the 만드는 중 progress state.
	it('marks the confirm button aria-busy while a download is running', () => {
		render(EventExportSheet, { ...props, busy: true, onConfirm: vi.fn(), onCancel: vi.fn() });
		expect(screen.getByRole('button', { name: /다운로드/ })).toHaveAttribute('aria-busy', 'true');
	});

	it('leaves the confirm button aria-busy false when idle', () => {
		render(EventExportSheet, { ...props, onConfirm: vi.fn(), onCancel: vi.fn() });
		expect(screen.getByRole('button', { name: '다운로드' })).toHaveAttribute('aria-busy', 'false');
	});
});
