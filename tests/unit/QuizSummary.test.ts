import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import QuizSummary from '../../src/lib/components/quiz/QuizSummary.svelte';
import type { QuizItem } from '../../src/lib/quiz/session';

const failed: QuizItem[] = [
	{ id: 'a_krv:2', packageId: 'a_krv', verseNo: 2, title: '제목 2', cite: '창세기 1 : 2', w: '본문 2' }
];

describe('QuizSummary', () => {
	it('reports the score', () => {
		render(QuizSummary, { passed: 2, total: 3, failed, onAgain: vi.fn(), onClose: vi.fn() });
		expect(screen.getByText('2 / 3')).toBeInTheDocument();
	});

	it('names the verses to come back to', () => {
		render(QuizSummary, { passed: 2, total: 3, failed, onAgain: vi.fn(), onClose: vi.fn() });
		expect(screen.getByText('창세기 1 : 2')).toBeInTheDocument();
	});

	// A clean run has nothing to come back to, and an empty list under a
	// heading reads as a bug.
	it('says nothing about failures when there were none', () => {
		render(QuizSummary, { passed: 3, total: 3, failed: [], onAgain: vi.fn(), onClose: vi.fn() });
		expect(screen.queryByText('다시 볼 구절')).toBeNull();
	});

	it('offers another run', async () => {
		const onAgain = vi.fn();
		render(QuizSummary, { passed: 3, total: 3, failed: [], onAgain, onClose: vi.fn() });
		await fireEvent.click(screen.getByRole('button', { name: '다시 하기' }));
		expect(onAgain).toHaveBeenCalledTimes(1);
	});

	// Silence is how a total storage failure once hid for a whole session.
	it('reports rounds that could not be stored', () => {
		render(QuizSummary, {
			passed: 2,
			total: 3,
			failed: [],
			unsaved: 2,
			onAgain: vi.fn(),
			onClose: vi.fn()
		});
		expect(screen.getByText('2개 라운드는 기록하지 못했습니다')).toBeInTheDocument();
	});

	it('says nothing about storage when nothing was lost', () => {
		render(QuizSummary, {
			passed: 3,
			total: 3,
			failed: [],
			unsaved: 0,
			onAgain: vi.fn(),
			onClose: vi.fn()
		});
		expect(screen.queryByText(/기록하지 못했습니다/)).toBeNull();
	});
});

// A list of citations is a list of homework: the reader has to go find each
// one. The library page already knows how to open on a single verse — ?v=
// scrolls it into view and flashes it — so the summary hands that over
// directly.
describe('QuizSummary — getting to the verse', () => {
	const twoFailed: QuizItem[] = [
		{ id: 'a_krv:2', packageId: 'a_krv', verseNo: 2, title: '제목 2', cite: '창세기 1 : 2', w: '본문 2' },
		{ id: 'b_krv:7', packageId: 'b_krv', verseNo: 7, title: '제목 7', cite: '요한복음 3 : 7', w: '본문 7' }
	];

	it('links each verse to its own card', () => {
		render(QuizSummary, { passed: 1, total: 3, failed: twoFailed, onAgain: vi.fn(), onClose: vi.fn() });
		const links = screen.getAllByRole('link');
		expect(links.map((a) => a.getAttribute('href'))).toEqual([
			'/library/a_krv?v=2',
			'/library/b_krv?v=7'
		]);
	});

	// One 암송 DAY can span packages, so the link has to carry the package as
	// well as the number — a verse 2 alone would open the wrong book.
	it('carries the package, not just the verse number', () => {
		render(QuizSummary, { passed: 1, total: 3, failed: twoFailed, onAgain: vi.fn(), onClose: vi.fn() });
		expect(screen.getByRole('link', { name: /요한복음 3 : 7/ })).toHaveAttribute(
			'href',
			'/library/b_krv?v=7'
		);
	});

	it('offers no links when nothing failed', () => {
		render(QuizSummary, { passed: 3, total: 3, failed: [], onAgain: vi.fn(), onClose: vi.fn() });
		expect(screen.queryAllByRole('link')).toHaveLength(0);
	});
});
