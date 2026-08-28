import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
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

/** The picker opens on Impossible/xHard/Hard, so a fixture that wants its
 *  verses in the default pool has to rate them there. An unrated verse is
 *  미평가, which is off by default. */
const hard = (n: number): Map<string, ItemRating> =>
	new Map(Array.from({ length: n }, (_, i) => [`a_krv:${i + 1}`, { start: 2, full: 2 }]));

function setup(over: Record<string, unknown> = {}) {
	const props = {
		targets,
		selected: targets[1],
		items: [item(1), item(2)],
		ratings: new Map<string, ItemRating>([
			['a_krv:1', { start: 2, full: 2 }],
			['a_krv:2', { start: 1, full: 1 }]
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

/** The two difficulty rows carry the same chip labels, so a chip has to be
 *  reached through the row that owns it. */
const chip = (row: '시작 난이도' | '전체 난이도', label: string) =>
	within(screen.getByRole('group', { name: row })).getByRole('button', { name: label });

const goButton = () => screen.getByRole('button', { name: 'Quiz!' });

describe('QuizScopePicker', () => {
	it('offers every 대상 it was given', () => {
		setup();
		expect(screen.getByRole('button', { name: '11월 암송 데이' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'A구절' })).toBeInTheDocument();
	});

	// The count is the whole guard against starting a 900-verse session: the
	// reader sees the number before pressing Quiz!.
	it('shows how many verses the current scope resolves to', () => {
		setup();
		expect(screen.getByText('2구절')).toBeInTheDocument();
	});

	it('moves the count when a difficulty chip is turned off', async () => {
		setup();
		await fireEvent.click(chip('시작 난이도', 'xHard'));
		expect(screen.getByText('1구절')).toBeInTheDocument();
	});

	// Nothing selected is a scope of nothing, and starting it would open a
	// session with no rounds in it.
	it('disables Quiz! when the scope is empty, and says why', async () => {
		setup({ items: [] });
		expect(goButton()).toBeDisabled();
		expect(screen.getByText('고른 범위에 구절이 없습니다')).toBeInTheDocument();
	});

	it('hands the filtered queue to onStart', async () => {
		const { onStart } = setup();
		await fireEvent.click(chip('시작 난이도', 'xHard'));
		await fireEvent.click(goButton());
		expect(onStart).toHaveBeenCalledTimes(1);
		expect(onStart.mock.calls[0][0].map((i: QuizItem) => i.id)).toEqual(['a_krv:1']);
	});

	it('reports a 대상 the reader picked', async () => {
		const { onPick } = setup();
		await fireEvent.click(screen.getByRole('button', { name: '11월 암송 데이' }));
		expect(onPick).toHaveBeenCalledWith(targets[0]);
	});
});

describe('QuizScopePicker — 난이도 rows', () => {
	// The quiz is where a reader goes to work on what they keep losing, so it
	// opens pointed at the hard end rather than at everything.
	it('opens with Impossible, xHard and Hard on in both rows', () => {
		setup();
		for (const row of ['시작 난이도', '전체 난이도'] as const) {
			for (const on of ['Impossible', 'xHard', 'Hard']) {
				expect(chip(row, on)).toHaveAttribute('aria-pressed', 'true');
			}
			for (const off of ['Normal', 'Easy', 'xEasy', '미평가']) {
				expect(chip(row, off)).toHaveAttribute('aria-pressed', 'false');
			}
		}
	});

	// 시작 난이도 and 전체 난이도 are rated separately, and the two rows
	// intersect. A verse hard to begin but easy once running clears the 시작
	// row and fails the 전체 row, so it does not make the session — under a
	// union it would, which is what the old single collapsed row did.
	it('needs a verse to clear both rows', async () => {
		setup({
			items: [item(1)],
			ratings: new Map<string, ItemRating>([['a_krv:1', { start: 2, full: 5 }]])
		});
		expect(screen.getByText('고른 난이도 그룹에 해당하는 구절이 없습니다')).toBeInTheDocument();

		await fireEvent.click(chip('전체 난이도', 'xEasy'));
		expect(screen.getByText('1구절')).toBeInTheDocument();
	});

	it('files each dimension separately under 미평가', async () => {
		setup({
			items: [item(1)],
			ratings: new Map<string, ItemRating>([['a_krv:1', { start: 2, full: null }]])
		});
		expect(screen.getByText('고른 난이도 그룹에 해당하는 구절이 없습니다')).toBeInTheDocument();

		await fireEvent.click(chip('전체 난이도', '미평가'));
		expect(screen.getByText('1구절')).toBeInTheDocument();
	});
});

	// Seven chips a row is a lot of tapping to say "this dimension only".
	it('clears a whole row in one press, then selects it back', async () => {
		setup();
		const row = '시작 난이도' as const;

		// Not everything is on to begin with, so the button offers the fill.
		await fireEvent.click(chip(row, '전체 선택'));
		for (const label of ['Impossible', 'xHard', 'Hard', 'Normal', 'Easy', 'xEasy', '미평가']) {
			expect(chip(row, label)).toHaveAttribute('aria-pressed', 'true');
		}

		// Now that it is full, the same button offers the clear.
		await fireEvent.click(chip(row, '전체 해제'));
		for (const label of ['Impossible', 'xHard', 'Hard', 'Normal', 'Easy', 'xEasy', '미평가']) {
			expect(chip(row, label)).toHaveAttribute('aria-pressed', 'false');
		}
	});

	it('moves one row without touching the other', async () => {
		setup();
		await fireEvent.click(chip('시작 난이도', '전체 선택'));
		expect(chip('시작 난이도', 'xEasy')).toHaveAttribute('aria-pressed', 'true');
		expect(chip('전체 난이도', 'xEasy')).toHaveAttribute('aria-pressed', 'false');
	});

describe('QuizScopePicker — 범위', () => {
	// Arriving from a 암송 DAY, the scope was decided on the way in. Re-asking
	// would invite an answer that disagrees with the screen they came from.
	it('states a locked scope instead of offering the list', () => {
		setup({ lockedLabel: '2026 여름 암송 Day' });
		expect(screen.getByText('2026 여름 암송 Day')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: '11월 암송 데이' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'A구절' })).toBeNull();
	});

	// Two different empty states with two different fixes: an empty range needs
	// a different scope, a range emptied by the chips needs different chips. A
	// freshly installed package is 미평가 throughout and the rows open on the
	// hard end, so the second is what a reader meets first.
	it('separates an empty range from one the chips emptied', async () => {
		setup({ items: [] });
		expect(screen.getByText('고른 범위에 구절이 없습니다')).toBeInTheDocument();
		expect(screen.queryByText('고른 난이도 그룹에 해당하는 구절이 없습니다')).toBeNull();
	});

	it('says it was the chips when the range itself has verses', () => {
		setup({ items: [item(1)], ratings: new Map() });
		expect(screen.getByText('고른 난이도 그룹에 해당하는 구절이 없습니다')).toBeInTheDocument();
		expect(screen.queryByText('고른 범위에 구절이 없습니다')).toBeNull();

		const describedBy = goButton().getAttribute('aria-describedby');
		expect(document.getElementById(describedBy as string)?.textContent?.trim()).toBe(
			'고른 난이도 그룹에 해당하는 구절이 없습니다'
		);
	});

	it('offers the list when no scope was handed in', () => {
		setup();
		expect(screen.getByRole('group', { name: '범위' })).toBeInTheDocument();
	});
});

describe('QuizScopePicker — games', () => {
	it('offers the three games and starts on 퍼펙트 게임', () => {
		setup();
		expect(screen.getByRole('button', { name: '퍼펙트 게임' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect(screen.getByRole('button', { name: '시작 3단어 맞추기 게임' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '자주 틀리는 곳 찾기 게임' })).toBeInTheDocument();
	});

	it('tells onStart which game was chosen', async () => {
		const { onStart } = setup();
		await fireEvent.click(screen.getByRole('button', { name: '시작 3단어 맞추기 게임' }));
		await fireEvent.click(goButton());
		expect(onStart.mock.calls[0][1]).toBe('opening');
	});

	// Early on most verses have no recorded attempt, and without this line the
	// winning strategy is to press 이상 없음 every round.
	it('says how many real questions 자주 틀리는 곳 찾기 has', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '자주 틀리는 곳 찾기 게임' }));
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
		await fireEvent.click(screen.getByRole('button', { name: '자주 틀리는 곳 찾기 게임' }));
		await fireEvent.click(chip('시작 난이도', 'xHard'));
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
	});

	// A 자주 틀리는 곳 찾기 session over a scope with nothing to ask is a row of
	// rubber stamps — every round shows the intact verse and 이상 없음 is
	// always right — that then writes accuracy-1 quiz-spot rows competing for
	// the per-verse history budget for no reason.
	it('disables Quiz! when 자주 틀리는 곳 찾기 has nothing to ask, and says why', async () => {
		setup({ attempts: new Map() });
		await fireEvent.click(screen.getByRole('button', { name: '자주 틀리는 곳 찾기 게임' }));
		await waitFor(() => expect(goButton()).toBeDisabled());
		expect(
			screen.getByText('아직 내 오답 기록이 없어 출제할 문제가 없습니다')
		).toBeInTheDocument();
	});
});

// Strips of buttons with no announced boundary between them read as one long
// run of controls. The app already names its other strips this way —
// SeriesSubTabStrip carries role="group" with a label — and each of these has
// a visible heading, so the heading is the name rather than a second string
// that can drift away from it.
describe('QuizScopePicker — announced structure', () => {
	it('names each group of controls after its own visible heading', () => {
		setup();
		expect(screen.getByRole('group', { name: '범위' })).toBeInTheDocument();
		expect(screen.getByRole('group', { name: '게임' })).toBeInTheDocument();
		expect(screen.getByRole('group', { name: '시작 난이도' })).toBeInTheDocument();
		expect(screen.getByRole('group', { name: '전체 난이도' })).toBeInTheDocument();
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

	it('announces the attempts count', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '자주 틀리는 곳 찾기 게임' }));
		const line = await screen.findByText(/내 오답 기록이 있습니다/);
		expect(line.closest('[aria-live="polite"]')).not.toBeNull();
	});

	it('tells a disabled Quiz! why it is disabled', async () => {
		setup({ items: [] });
		const start = goButton();
		expect(start).toBeDisabled();
		const describedBy = start.getAttribute('aria-describedby');
		expect(describedBy).toBeTruthy();
		expect(document.getElementById(describedBy as string)?.textContent?.trim()).toBe(
			'고른 범위에 구절이 없습니다'
		);
	});

	it('leaves an enabled Quiz! undescribed', () => {
		setup();
		const start = goButton();
		expect(start).not.toBeDisabled();
		expect(start.getAttribute('aria-describedby')).toBeNull();
	});

	// The pile is decoration for a number the sentence beside it already
	// states, so it must not be read out twice.
	it('hides the card pile from the accessibility tree', () => {
		setup();
		const stack = document.querySelector('.stack');
		expect(stack).not.toBeNull();
		expect(stack).toHaveAttribute('aria-hidden', 'true');
	});
});

describe('QuizScopePicker — session size', () => {
	const many = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1));

	it('says only the count when the whole scope fits in one session', () => {
		setup({ items: many(7), ratings: hard(7), attempts: new Map() });
		expect(screen.getByText('7구절')).toBeInTheDocument();
	});

	it("says how much of a larger scope today's session covers", () => {
		setup({ items: many(48), ratings: hard(48), attempts: new Map() });
		expect(screen.getByText('48구절 중 오늘 10구절')).toBeInTheDocument();
	});

	it('hands onStart only the capped session', async () => {
		const props = setup({ items: many(48), ratings: hard(48), attempts: new Map() });
		await fireEvent.click(goButton());
		expect(vi.mocked(props.onStart).mock.calls[0]?.[0]).toHaveLength(10);
	});

	it('puts a verse with recent failures ahead of one passed today', async () => {
		const now = 1_700_000_000_000;
		const props = setup({
			items: many(2),
			ratings: hard(2),
			attempts: new Map(),
			now,
			signals: new Map<string, VerseSignal>([
				['a_krv:1', { fails: 0, lastAskedAt: now }],
				['a_krv:2', { fails: 3, lastAskedAt: now }]
			])
		});
		await fireEvent.click(goButton());
		expect(vi.mocked(props.onStart).mock.calls[0]?.[0]?.[0]?.id).toBe('a_krv:2');
	});

	it('shows the attempt count without waiting for a read', () => {
		setup();
		fireEvent.click(screen.getByRole('button', { name: '자주 틀리는 곳 찾기 게임' }));
		// No waitFor on a read: attempts arrived with the scope.
		return waitFor(() =>
			expect(screen.getByText('2구절 중 1개에 내 오답 기록이 있습니다')).toBeInTheDocument()
		);
	});

	it('starts 자주 틀리는 곳 찾기 only on verses it has a question for', async () => {
		const props = setup();
		await fireEvent.click(screen.getByRole('button', { name: '자주 틀리는 곳 찾기 게임' }));
		await fireEvent.click(goButton());
		expect(vi.mocked(props.onStart).mock.calls[0]?.[0]?.map((i: QuizItem) => i.id)).toEqual([
			'a_krv:1'
		]);
	});

	// One card per verse the sitting will ask about, so the count has a shape
	// before it has a number — capped, because past a handful the pile stops
	// reading as "a few more" and starts reading as noise.
	it('draws one card per verse in the session, capped', () => {
		setup({ items: many(3), ratings: hard(3), attempts: new Map() });
		expect(document.querySelectorAll('.card-layer')).toHaveLength(3);
	});

	it('stops growing the pile past its cap', () => {
		setup({ items: many(48), ratings: hard(48), attempts: new Map() });
		expect(document.querySelectorAll('.card-layer')).toHaveLength(6);
	});
});
