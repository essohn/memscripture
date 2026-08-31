import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Page from '../../src/routes/events/edit/+page.svelte';
import type { EventEditLoadData } from '../../src/routes/events/edit/+page';
import { saveUserEvent, removeUserEvent } from '../../src/lib/db/userEvents';

vi.mock('$app/navigation', async () => ({
	...(await vi.importActual<Record<string, unknown>>('$app/navigation')),
	goto: vi.fn()
}));

vi.mock('../../src/lib/db/userEvents', async () => {
	const actual = await vi.importActual<Record<string, unknown>>('../../src/lib/db/userEvents');
	return { ...actual, saveUserEvent: vi.fn(), removeUserEvent: vi.fn() };
});

function data(over: Partial<EventEditLoadData> = {}): EventEditLoadData {
	return {
		draft: {
			id: 'my:abc',
			title: '2026 가을 암송 DAY',
			dueAt: '2026-11-30',
			ranges: [{ packageId: '5_krv', from: 3, to: 5 }]
		},
		packages: [
			{ id: '5_krv', name: '샘플 묶음', maxVerseNo: 113 },
			{ id: 'other', name: '다른 묶음', maxVerseNo: 20 }
		],
		editable: true,
		existing: false,
		...over
	};
}

describe('암송 DAY form', () => {
	beforeEach(() => {
		vi.mocked(saveUserEvent).mockReset().mockResolvedValue(undefined);
		vi.mocked(removeUserEvent).mockReset().mockResolvedValue(undefined);
	});

	// The whole point of asking for two numbers: the reader writes 3~5 and the
	// app writes down the three verses the rest of it reads.
	it('saves the verses the range spells out', async () => {
		render(Page, { data: data() });
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		expect(saveUserEvent).toHaveBeenCalledWith({
			id: 'my:abc',
			title: '2026 가을 암송 DAY',
			dueAt: '2026-11-30',
			ranges: [{ packageId: '5_krv', verseNos: [3, 4, 5] }]
		});
	});

	it('counts the verses the ranges cover', () => {
		render(Page, { data: data() });
		expect(screen.getByText('3구절')).toBeInTheDocument();
	});

	it('will not save a DAY with no title, and says why', async () => {
		const d = data();
		d.draft.title = '   ';
		render(Page, { data: d });
		expect(screen.getByText('제목을 입력해주세요.')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		expect(saveUserEvent).not.toHaveBeenCalled();
	});

	it('adds another range row on request', async () => {
		render(Page, { data: data() });
		expect(screen.getAllByLabelText('시작 번호')).toHaveLength(1);
		await fireEvent.click(screen.getByRole('button', { name: /범위 추가/ }));
		expect(screen.getAllByLabelText('시작 번호')).toHaveLength(2);
	});

	// One range is the floor — a DAY with no verses is not a DAY, so the last
	// row has nothing to remove it with.
	it('offers to drop a range only when there is more than one', async () => {
		render(Page, { data: data() });
		expect(screen.queryByLabelText('이 범위 지우기')).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: /범위 추가/ }));
		expect(screen.getAllByLabelText('이 범위 지우기')).toHaveLength(2);
	});

	it('says how far the chosen package goes', () => {
		render(Page, { data: data() });
		expect(screen.getByText('/ 113')).toBeInTheDocument();
	});

	it('offers deletion only for a DAY that exists, and asks first', async () => {
		render(Page, { data: data() });
		expect(screen.queryByRole('button', { name: /지우기$/ })).not.toBeInTheDocument();

		render(Page, { data: data({ existing: true }) });
		await fireEvent.click(screen.getByRole('button', { name: '이 암송 DAY 지우기' }));
		expect(removeUserEvent).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: '지우기' }));
		expect(removeUserEvent).toHaveBeenCalledWith('my:abc');
	});

	// A published DAY ships with the app; the next release would overwrite
	// whatever was typed here.
	it('refuses to edit a DAY that came with the app', () => {
		render(Page, { data: data({ editable: false, existing: true }) });
		expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument();
		expect(screen.getByText(/고칠 수 없습니다/)).toBeInTheDocument();
	});

	// Failing quietly would send the reader back to a list without the DAY
	// they just wrote, with nothing said.
	it('says so when saving fails', async () => {
		vi.mocked(saveUserEvent).mockRejectedValue(new Error('nope'));
		render(Page, { data: data() });
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		expect(await screen.findByText(/저장하지 못했습니다/)).toBeInTheDocument();
	});
});
