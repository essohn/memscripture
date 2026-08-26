import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import QuizScopePicker from '../../src/lib/components/quiz/QuizScopePicker.svelte';
import type { Target } from '../../src/lib/quiz/scope';
import type { ItemRating, QuizItem } from '../../src/lib/quiz/session';

const targets: Target[] = [
	{ kind: 'event', id: 'e1', label: '11월 암송 데이', ranges: [] },
	{ kind: 'package', id: 'a_krv', label: 'A구절' }
];

const item = (no: number): QuizItem => ({
	id: `a_krv:${no}`,
	packageId: 'a_krv',
	verseNo: no,
	title: `제목 ${no}`,
	cite: `창세기 1 : ${no}`,
	w: `본문 ${no}`
});

function setup(over: Record<string, unknown> = {}) {
	const props = {
		targets,
		selected: targets[1],
		items: [item(1), item(2)],
		ratings: new Map<string, ItemRating>([
			['a_krv:1', { start: 2, full: 2 }],
			['a_krv:2', { start: 5, full: 5 }]
		]),
		onPick: vi.fn(),
		onStart: vi.fn(),
		...over
	};
	render(QuizScopePicker, props);
	return props;
}

describe('QuizScopePicker', () => {
	it('offers every 대상 it was given', () => {
		setup();
		expect(screen.getByRole('button', { name: '11월 암송 데이' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'A구절' })).toBeInTheDocument();
	});

	// The count is the whole guard against starting a 900-verse session: the
	// reader sees the number before pressing 시작.
	it('shows how many verses the current scope resolves to', () => {
		setup();
		expect(screen.getByText('2구절')).toBeInTheDocument();
	});

	it('moves the count when a difficulty chip is turned off', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: 'xEasy' }));
		expect(screen.getByText('1구절')).toBeInTheDocument();
	});

	// Nothing selected is a scope of nothing, and starting it would open a
	// session with no rounds in it.
	it('disables 시작 when the scope is empty, and says why', async () => {
		setup({ items: [] });
		expect(screen.getByRole('button', { name: '시작' })).toBeDisabled();
		expect(screen.getByText('고른 범위에 구절이 없습니다')).toBeInTheDocument();
	});

	it('hands the filtered queue to onStart', async () => {
		const { onStart } = setup();
		await fireEvent.click(screen.getByRole('button', { name: 'xEasy' }));
		await fireEvent.click(screen.getByRole('button', { name: '시작' }));
		expect(onStart).toHaveBeenCalledTimes(1);
		expect(onStart.mock.calls[0][0].map((i: QuizItem) => i.id)).toEqual(['a_krv:1']);
	});

	it('reports a 대상 the reader picked', async () => {
		const { onPick } = setup();
		await fireEvent.click(screen.getByRole('button', { name: '11월 암송 데이' }));
		expect(onPick).toHaveBeenCalledWith(targets[0]);
	});
});
