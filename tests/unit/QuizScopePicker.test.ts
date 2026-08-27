import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import QuizScopePicker from '../../src/lib/components/quiz/QuizScopePicker.svelte';
import { loadAttempts, type Target } from '../../src/lib/quiz/scope';
import type { ItemRating, QuizItem } from '../../src/lib/quiz/session';

vi.mock('../../src/lib/quiz/scope', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../src/lib/quiz/scope')>()),
	loadAttempts: vi.fn(async () => new Map([['a_krv:1', '거의 맞은 문장']]))
}));

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

describe('QuizScopePicker — games', () => {
	it('offers the three games and starts on 전체 타이핑', () => {
		setup();
		expect(screen.getByRole('button', { name: '전체 타이핑' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect(screen.getByRole('button', { name: '첫 단어' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '틀린 곳 찾기' })).toBeInTheDocument();
	});

	it('tells onStart which game was chosen', async () => {
		const { onStart } = setup();
		await fireEvent.click(screen.getByRole('button', { name: '첫 단어' }));
		await fireEvent.click(screen.getByRole('button', { name: '시작' }));
		expect(onStart.mock.calls[0][1]).toBe('opening');
	});

	// Early on most verses have no recorded attempt, and without this line the
	// winning strategy is to press 이상 없음 every round.
	it('says how many real questions 틀린 곳 찾기 has', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '틀린 곳 찾기' }));
		await waitFor(() =>
			expect(screen.getByText('2구절 중 1개에 내 오답 기록이 있습니다')).toBeInTheDocument()
		);
	});

	it('says nothing about attempts for the other games', () => {
		setup();
		expect(screen.queryByText(/내 오답 기록이 있습니다/)).toBeNull();
	});

	// The heading names what the chips do — they pick a group of verses by
	// difficulty, they do not set one.
	it('heads the difficulty chips 난이도 그룹 선택', () => {
		setup();
		expect(screen.getByText('난이도 그룹 선택')).toBeInTheDocument();
		expect(screen.queryByText('난이도')).toBeNull();
	});

	// The total (queue.length, template-read) updates the instant a chip
	// moves, but the attempt count is read async. Left un-reset, the count
	// from the larger, pre-toggle scope would sit next to the new, smaller
	// total — "1구절 중 2개" is an impossible ratio. The mock's second call
	// is held pending so the in-flight state is directly observable rather
	// than raced against real timing.
	it('drops the count while a chip change is being re-read, rather than pairing it with a smaller total', async () => {
		const mocked = vi.mocked(loadAttempts);
		mocked.mockImplementationOnce(
			async () =>
				new Map([
					['a_krv:1', '거의 맞은 문장'],
					['a_krv:2', '다른 문장']
				])
		);
		let resolveSecond: ((m: Map<string, string>) => void) | undefined;
		mocked.mockImplementationOnce(
			() =>
				new Promise<Map<string, string>>((resolve) => {
					resolveSecond = resolve;
				})
		);

		setup();
		await fireEvent.click(screen.getByRole('button', { name: '틀린 곳 찾기' }));
		await waitFor(() =>
			expect(screen.getByText('2구절 중 2개에 내 오답 기록이 있습니다')).toBeInTheDocument()
		);

		await fireEvent.click(screen.getByRole('button', { name: 'xEasy' }));
		// The re-read for the smaller scope is still in flight. Nothing —
		// not the stale "2개", not any other figure — may be shown against
		// the new "1구절" total until the new answer lands.
		expect(screen.queryByText(/내 오답 기록이 있습니다/)).toBeNull();

		resolveSecond?.(new Map([['a_krv:1', '거의 맞은 문장']]));
		await waitFor(() =>
			expect(screen.getByText('1구절 중 1개에 내 오답 기록이 있습니다')).toBeInTheDocument()
		);
	});

	// A regression that swapped the filtered queue for the raw items would
	// still read as "some count of some total" — only checking what
	// loadAttempts was actually called with catches it.
	it('reads attempts for the tier-filtered queue, not the raw items', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '틀린 곳 찾기' }));
		await fireEvent.click(screen.getByRole('button', { name: 'xEasy' }));
		await waitFor(() => {
			const calls = vi.mocked(loadAttempts).mock.calls;
			const last = calls.at(-1)?.[0] as QuizItem[] | undefined;
			expect(last?.map((i) => i.id)).toEqual(['a_krv:1']);
		});
	});
});
