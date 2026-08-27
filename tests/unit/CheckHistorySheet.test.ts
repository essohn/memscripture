import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import CheckHistorySheet from '../../src/lib/components/card/CheckHistorySheet.svelte';
import type { CheckRecord } from '../../src/lib/db/local';
import { shortDateKo } from '../../src/lib/utils/relativeTime';

const NOW = Date.UTC(2026, 7, 27, 12, 0, 0);
const DAY = 86_400_000;

const record = (over: Partial<CheckRecord> = {}): CheckRecord => ({
	id: '900_krv:1:1000:0',
	verseKey: '900_krv:1',
	packageId: '900_krv',
	verseNo: 1,
	checkedAt: NOW - DAY,
	start: 4,
	full: 5,
	accuracy: 1,
	elapsedMs: 30_000,
	...over
});

const mount = (records: CheckRecord[], onClose = () => {}) =>
	render(CheckHistorySheet, {
		props: { heading: '히브리서 4:12', records, now: NOW, onClose }
	});

const mountDeletable = (records: CheckRecord[]) => {
	const onDelete = vi.fn();
	const onRestore = vi.fn();
	render(CheckHistorySheet, {
		props: { heading: '히브리서 4:12', records, now: NOW, onClose: () => {}, onDelete, onRestore }
	});
	return { onDelete, onRestore };
};

describe('CheckHistorySheet', () => {
	it('names the verse it is reporting on', () => {
		mount([record()]);
		expect(screen.getByRole('dialog', { name: /히브리서 4:12/ })).toBeInTheDocument();
	});

	it('lists one row per check', () => {
		mount([record({ id: 'a', checkedAt: NOW - DAY }), record({ id: 'b', checkedAt: NOW - 2 * DAY })]);
		expect(screen.getAllByTestId('check-history-row')).toHaveLength(2);
	});

	it('shows both difficulties recorded at the time', () => {
		mount([record({ start: 2, full: 5 })]);
		expect(screen.getByLabelText('첫 시작 난이도 2')).toBeInTheDocument();
		expect(screen.getByLabelText('전체 암송 난이도 5')).toBeInTheDocument();
	});

	// 포기 records no level at all, deliberately — a reader who blanked on one
	// word and one who knew none of it both press it. The sheet must not
	// invent a number where the check declined to give one.
	it('marks an ungraded check rather than inventing a level', () => {
		mount([record({ start: null, full: null })]);
		expect(screen.getByLabelText('첫 시작 난이도 없음')).toBeInTheDocument();
		expect(screen.getByLabelText('전체 암송 난이도 없음')).toBeInTheDocument();
	});

	it('shows how long ago the check was', () => {
		mount([record({ checkedAt: NOW - 3 * DAY })]);
		expect(screen.getByText(/3일 전/)).toBeInTheDocument();
	});

	it('shows the text the reader typed at the time', () => {
		mount([record({ typed: '하나님의 말씀은 살아 있고 활력이 있어' })]);
		expect(screen.getByText('하나님의 말씀은 살아 있고 활력이 있어')).toBeInTheDocument();
	});

	// Absent and empty mean different things and the sheet has to say so, or a
	// check from before the field existed reads as a reader who typed nothing.
	it('says an old check captured no text', () => {
		mount([record({ typed: undefined })]);
		expect(screen.getByText('입력 본문이 기록되기 전의 점검입니다')).toBeInTheDocument();
	});

	it('says an empty attempt was saved empty', () => {
		mount([record({ typed: '' })]);
		expect(screen.getByText('입력한 내용 없이 저장했습니다')).toBeInTheDocument();
	});

	it('reports accuracy as a percentage', () => {
		mount([record({ accuracy: 0.82 })]);
		expect(screen.getByText(/82%/)).toBeInTheDocument();
	});

	// A 5 reached with eight nudges is not the same 5 as one reached cold, and
	// only this column can say so. Absent hints predate the field; zero is a
	// check that used none, and neither deserves a "힌트 0".
	it('shows hints only when some were spent', () => {
		mount([record({ id: 'a', hints: 3 })]);
		expect(screen.getByText(/힌트 3/)).toBeInTheDocument();
	});

	it('says nothing about hints when none were spent', () => {
		mount([record({ hints: 0 })]);
		expect(screen.queryByText(/힌트/)).not.toBeInTheDocument();
	});

	it('closes on Escape', async () => {
		const onClose = vi.fn();
		mount([record()], onClose);
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onClose).toHaveBeenCalled();
	});

	it('closes from the close button', async () => {
		const onClose = vi.fn();
		mount([record()], onClose);
		await fireEvent.click(screen.getByRole('button', { name: '닫기' }));
		expect(onClose).toHaveBeenCalled();
	});
});

describe('deleting a record', () => {
	// The button only exists where a caller can actually carry the deletion
	// out. A sheet opened read-only shows the same rows without them.
	it('offers no delete when the caller cannot handle one', () => {
		mount([record()]);
		expect(screen.queryByRole('button', { name: /점검 기록 삭제/ })).toBeNull();
	});

	// Named by date rather than "삭제": ten rows of identical buttons is a list
	// a screen reader cannot tell apart, and this one is destructive. Built from
	// the same formatter the row prints, so the label and the row it names
	// cannot drift apart.
	it('names the row each delete belongs to', () => {
		const at = NOW - DAY;
		mountDeletable([record({ checkedAt: at })]);
		expect(
			screen.getByRole('button', { name: `${shortDateKo(at)} 점검 기록 삭제` })
		).toBeInTheDocument();
	});

	it('hands the record to the caller', async () => {
		const { onDelete } = mountDeletable([record({ id: 'a' })]);
		await fireEvent.click(screen.getByRole('button', { name: /점검 기록 삭제/ }));
		expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
	});

	// The row holds its place rather than vanishing. A list that reflows under
	// the finger is how the next tap lands on the wrong record, and the undo
	// has to be somewhere the reader is already looking.
	it('leaves an undo where the row was', async () => {
		mountDeletable([record({ id: 'a' }), record({ id: 'b', checkedAt: NOW - 2 * DAY })]);
		await fireEvent.click(screen.getAllByRole('button', { name: /점검 기록 삭제/ })[0]);

		expect(screen.getAllByTestId('check-history-row')).toHaveLength(2);
		expect(screen.getByRole('button', { name: '실행 취소' })).toBeInTheDocument();
	});

	it('restores the record through the caller', async () => {
		const { onRestore } = mountDeletable([record({ id: 'a' })]);
		await fireEvent.click(screen.getByRole('button', { name: /점검 기록 삭제/ }));
		await fireEvent.click(screen.getByRole('button', { name: '실행 취소' }));

		expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
		expect(screen.getByRole('button', { name: /점검 기록 삭제/ })).toBeInTheDocument();
	});

	// Undoing one deletion must not bring the others back with it.
	it('undoes only the row that was undone', async () => {
		mountDeletable([record({ id: 'a' }), record({ id: 'b', checkedAt: NOW - 2 * DAY })]);
		const buttons = screen.getAllByRole('button', { name: /점검 기록 삭제/ });
		await fireEvent.click(buttons[0]);
		await fireEvent.click(buttons[1]);
		await fireEvent.click(screen.getAllByRole('button', { name: '실행 취소' })[0]);

		expect(screen.getAllByRole('button', { name: '실행 취소' })).toHaveLength(1);
	});
});
