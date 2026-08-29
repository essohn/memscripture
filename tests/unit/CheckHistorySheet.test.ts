import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import CheckHistorySheet from '../../src/lib/components/card/CheckHistorySheet.svelte';
import type { CheckRecord } from '../../src/lib/db/local';

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

const WORDS = ['하나님의', '말씀은', '살아', '있고', '활력이', '있어'];

const mount = (records: CheckRecord[], onClose = () => {}) =>
	render(CheckHistorySheet, {
		props: { heading: '히브리서 4:12', records, words: WORDS, now: NOW, onClose }
	});

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

	// The summary is the reason the sheet is worth opening; the rows are its
	// evidence. Evidence goes underneath.
	it('puts the diagnosis above the first row', () => {
		mount([
			record({ id: 'a', checkedAt: NOW - DAY, typed: WORDS.join(' '), missed: [2] }),
			record({ id: 'b', checkedAt: NOW - 2 * DAY, typed: WORDS.join(' '), missed: [2] })
		]);
		const diagnosis = screen.getByTestId('check-diagnosis');
		const firstRow = screen.getAllByTestId('check-history-row')[0];
		expect(diagnosis.compareDocumentPosition(firstRow)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	});

	it('shows the rows alone when there is only one check to show', () => {
		mount([record()]);
		expect(screen.queryByTestId('check-diagnosis')).not.toBeInTheDocument();
		expect(screen.getAllByTestId('check-history-row')).toHaveLength(1);
	});
});
