import { describe, expect, it, vi } from 'vitest';
// fireEvent, not user-event: the latter is not a dependency of this project
// and the no-new-dependencies constraint applies to devDependencies too.
// Every existing component test uses fireEvent — see BookmarkControl.test.ts.
import { fireEvent, render, screen } from '@testing-library/svelte';
import EventExportSheet from '../../src/lib/components/home/EventExportSheet.svelte';

const props = {
	eventTitle: '2026 여름 암송 DAY',
	busy: false,
	sheetBusy: false,
	sheetNotice: null
};

/** The three handlers every render needs. Spread after `props` so a test can
 *  still override any single one. */
function handlers() {
	return { onConfirm: vi.fn(), onSheets: vi.fn(), onCancel: vi.fn() };
}

describe('EventExportSheet', () => {
	it('defaults both options on', () => {
		render(EventExportSheet, { ...props, ...handlers() });
		expect(screen.getByLabelText(/난이도 열 포함/)).toBeChecked();
		expect(screen.getByLabelText(/장절 순서/)).toBeChecked();
	});

	it('confirms the defaults untouched', async () => {
		const onConfirm = vi.fn();
		render(EventExportSheet, { ...props, ...handlers(), onConfirm });
		await fireEvent.click(screen.getByRole('button', { name: '엑셀 다운로드' }));
		expect(onConfirm).toHaveBeenCalledWith({
			includeDifficulty: true,
			sortByScripture: true
		});
	});

	// Both boxes now start checked, so unchecking is the path that proves the
	// bindings are live rather than the confirm handler echoing its defaults.
	it('reports each box after it is unchecked', async () => {
		const onConfirm = vi.fn();
		render(EventExportSheet, { ...props, ...handlers(), onConfirm });
		await fireEvent.click(screen.getByLabelText(/장절 순서/));
		await fireEvent.click(screen.getByRole('button', { name: '엑셀 다운로드' }));
		expect(onConfirm).toHaveBeenLastCalledWith({
			includeDifficulty: true,
			sortByScripture: false
		});

		await fireEvent.click(screen.getByLabelText(/난이도 열 포함/));
		await fireEvent.click(screen.getByRole('button', { name: '엑셀 다운로드' }));
		expect(onConfirm).toHaveBeenLastCalledWith({
			includeDifficulty: false,
			sortByScripture: false
		});
	});

	it('disables the confirm button while a download is running', () => {
		render(EventExportSheet, { ...props, ...handlers(), busy: true });
		expect(screen.getByRole('button', { name: /엑셀 다운로드/ })).toBeDisabled();
	});

	// The confirm button keeps a static aria-label, so aria-busy is the only
	// way a screen reader hears the 만드는 중 progress state.
	it('marks the confirm button aria-busy while a download is running', () => {
		render(EventExportSheet, { ...props, ...handlers(), busy: true });
		expect(screen.getByRole('button', { name: /엑셀 다운로드/ })).toHaveAttribute('aria-busy', 'true');
	});

	it('leaves the confirm button aria-busy false when idle', () => {
		render(EventExportSheet, { ...props, ...handlers() });
		expect(screen.getByRole('button', { name: '엑셀 다운로드' })).toHaveAttribute('aria-busy', 'false');
	});
});

// The Sheets button carries the same option state as the download button —
// they are two destinations for one export, not two exports.
describe('EventExportSheet — Google Sheets', () => {
	it('sends the current options to the Sheets handler', async () => {
		const onSheets = vi.fn();
		render(EventExportSheet, { ...props, ...handlers(), onSheets });
		await fireEvent.click(screen.getByLabelText(/난이도 열 포함/));
		await fireEvent.click(screen.getByRole('button', { name: 'Google Sheets' }));
		expect(onSheets).toHaveBeenCalledWith({
			includeDifficulty: false,
			sortByScripture: true
		});
	});

	// Each button reports only its own work: a download in flight must not
	// grey out the Sheets button, and the reverse.
	it('keeps the two busy states independent', () => {
		const { unmount } = render(EventExportSheet, { ...props, ...handlers(), busy: true });
		expect(screen.getByRole('button', { name: 'Google Sheets' })).toBeEnabled();
		unmount();

		render(EventExportSheet, { ...props, ...handlers(), sheetBusy: true });
		expect(screen.getByRole('button', { name: 'Google Sheets' })).toBeDisabled();
		expect(screen.getByRole('button', { name: '엑셀 다운로드' })).toBeEnabled();
	});

	it('marks the Sheets button aria-busy while it runs', () => {
		render(EventExportSheet, { ...props, ...handlers(), sheetBusy: true });
		expect(screen.getByRole('button', { name: 'Google Sheets' })).toHaveAttribute(
			'aria-busy',
			'true'
		);
	});

	// The document is the deliverable; without a reachable link a blocked
	// pop-up would strand the reader with a sheet they cannot find.
	it('offers the finished document as a link', () => {
		render(EventExportSheet, {
			...props,
			...handlers(),
			sheetNotice: {
				text: 'Google Sheets 문서를 만들었습니다',
				href: 'https://docs.google.com/spreadsheets/d/abc/edit',
				tone: 'ok' as const
			}
		});
		expect(screen.getByRole('link', { name: '열기' })).toHaveAttribute(
			'href',
			'https://docs.google.com/spreadsheets/d/abc/edit'
		);
	});

	it('points an unconnected reader at settings instead of a document', () => {
		render(EventExportSheet, {
			...props,
			...handlers(),
			sheetNotice: {
				text: 'Google Drive를 먼저 연결해주세요',
				settings: true,
				tone: 'error' as const
			}
		});
		expect(screen.getByText(/Google Drive를 먼저 연결/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: '설정으로' })).toHaveAttribute('href', '/settings');
		expect(screen.queryByRole('link', { name: '열기' })).toBeNull();
	});
});
