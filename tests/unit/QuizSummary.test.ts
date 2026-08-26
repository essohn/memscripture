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
});
