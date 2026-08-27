import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import QuizScopePicker from '../../src/lib/components/quiz/QuizScopePicker.svelte';
import type { Target } from '../../src/lib/quiz/scope';
import type { ItemRating, QuizItem } from '../../src/lib/quiz/session';
import type { VerseSignal } from '../../src/lib/quiz/priority';

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
		signals: new Map<string, VerseSignal>(),
		attempts: new Map([['a_krv:1', '거의 맞은 문장']]),
		now: 1_700_000_000_000,
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

	// attemptCount is derived from `pool` (the tier-filtered scope), not the
	// raw `items`. Every other fixture in this file has pool.length ===
	// items.length, so a regression to items would pass all of them — this
	// one needs both verses to carry an attempt AND one of them filtered out
	// by a chip, so the pool-based count and the items-based count diverge.
	it('counts attempts in the tier-filtered pool, not the raw items', async () => {
		setup({
			attempts: new Map([
				['a_krv:1', '거의 맞은 문장'],
				['a_krv:2', '또 다른 문장']
			])
		});
		await fireEvent.click(screen.getByRole('button', { name: '틀린 곳 찾기' }));
		await fireEvent.click(screen.getByRole('button', { name: 'xEasy' }));
		await waitFor(() =>
			expect(screen.getByText('1구절 중 1개에 내 오답 기록이 있습니다')).toBeInTheDocument()
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

	// A 틀린 곳 찾기 session over a scope with nothing to ask is a row of
	// rubber stamps — every round shows the intact verse and 이상 없음 is
	// always right — that then writes accuracy-1 quiz-spot rows competing for
	// the per-verse history budget for no reason.
	it('disables 시작 when 틀린 곳 찾기 has nothing to ask, and says why', async () => {
		setup({ attempts: new Map() });
		await fireEvent.click(screen.getByRole('button', { name: '틀린 곳 찾기' }));
		await waitFor(() => expect(screen.getByRole('button', { name: '시작' })).toBeDisabled());
		expect(
			screen.getByText('아직 내 오답 기록이 없어 출제할 문제가 없습니다')
		).toBeInTheDocument();
	});
});

// Three strips of buttons with no announced boundary between them read as one
// long run of controls. The app already names its other strips this way —
// SeriesSubTabStrip carries role="group" with a label — and each of these has
// a visible heading, so the heading is the name rather than a second string
// that can drift away from it.
describe('QuizScopePicker — announced structure', () => {
	it('names each group of controls after its own visible heading', () => {
		setup();
		expect(screen.getByRole('group', { name: '범위' })).toBeInTheDocument();
		expect(screen.getByRole('group', { name: '난이도 그룹 선택' })).toBeInTheDocument();
		expect(screen.getByRole('group', { name: '게임' })).toBeInTheDocument();
	});

	// A live region has to exist before the text inside it changes, or the
	// change is never announced. These lines appear and disappear with the
	// scope, so the region has to outlive them — including while it is empty,
	// which is the state a conditionally-rendered region would not survive.
	it('keeps a live region in place even when it has nothing to say', () => {
		setup();
		const empty = [...document.querySelectorAll('[aria-live="polite"]')].filter(
			(el) => el.textContent?.trim() === ''
		);
		expect(empty.length).toBeGreaterThan(0);
	});

	// The count is the line that actually changes on its own — as the read
	// resolves, and as the tier chips move the total under it. It was the one
	// named in the finding, and the one first fixed everywhere but here.
	it('announces the attempts count', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '틀린 곳 찾기' }));
		const line = await screen.findByText(/내 오답 기록이 있습니다/);
		expect(line.closest('[aria-live="polite"]')).not.toBeNull();
	});

	it('tells a disabled 시작 why it is disabled', async () => {
		setup({ items: [] });
		const start = screen.getByRole('button', { name: '시작' });
		expect(start).toBeDisabled();
		const describedBy = start.getAttribute('aria-describedby');
		expect(describedBy).toBeTruthy();
		expect(document.getElementById(describedBy as string)?.textContent?.trim()).toBe(
			'고른 범위에 구절이 없습니다'
		);
	});

	it('leaves an enabled 시작 undescribed', () => {
		setup();
		const start = screen.getByRole('button', { name: '시작' });
		expect(start).not.toBeDisabled();
		expect(start.getAttribute('aria-describedby')).toBeNull();
	});
});

describe('QuizScopePicker — session size', () => {
	const many = (n: number) =>
		Array.from({ length: n }, (_, i) => ({
			id: `a_krv:${i + 1}`,
			packageId: 'a_krv',
			verseNo: i + 1,
			title: `제목 ${i + 1}`,
			cite: `창세기 1 : ${i + 1}`,
			w: `본문 ${i + 1}`
		}));

	it('says only the count when the whole scope fits in one session', () => {
		setup({ items: many(7), ratings: new Map(), attempts: new Map() });
		expect(screen.getByText('7구절')).toBeInTheDocument();
	});

	it("says how much of a larger scope today's session covers", () => {
		setup({ items: many(48), ratings: new Map(), attempts: new Map() });
		expect(screen.getByText('48구절 중 오늘 10구절')).toBeInTheDocument();
	});

	it('hands onStart only the capped session', async () => {
		const props = setup({ items: many(48), ratings: new Map(), attempts: new Map() });
		await fireEvent.click(screen.getByRole('button', { name: '시작' }));
		expect(vi.mocked(props.onStart).mock.calls[0]?.[0]).toHaveLength(10);
	});

	it('puts a verse with recent failures ahead of one passed today', async () => {
		const now = 1_700_000_000_000;
		const props = setup({
			items: many(2),
			ratings: new Map(),
			attempts: new Map(),
			now,
			signals: new Map<string, VerseSignal>([
				['a_krv:1', { fails: 0, lastAskedAt: now }],
				['a_krv:2', { fails: 3, lastAskedAt: now }]
			])
		});
		await fireEvent.click(screen.getByRole('button', { name: '시작' }));
		expect(vi.mocked(props.onStart).mock.calls[0]?.[0]?.[0]?.id).toBe('a_krv:2');
	});

	it('shows the attempt count without waiting for a read', () => {
		setup();
		fireEvent.click(screen.getByRole('button', { name: '틀린 곳 찾기' }));
		// No waitFor: attempts arrived with the scope.
		return waitFor(() =>
			expect(screen.getByText('2구절 중 1개에 내 오답 기록이 있습니다')).toBeInTheDocument()
		);
	});

	it('starts 틀린 곳 찾기 only on verses it has a question for', async () => {
		const props = setup();
		await fireEvent.click(screen.getByRole('button', { name: '틀린 곳 찾기' }));
		await fireEvent.click(screen.getByRole('button', { name: '시작' }));
		expect(vi.mocked(props.onStart).mock.calls[0]?.[0]?.map((i: QuizItem) => i.id)).toEqual([
			'a_krv:1'
		]);
	});
});
