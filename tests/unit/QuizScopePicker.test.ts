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
	// It used to open on Impossible, xHard and Hard. The rows intersect, and a
	// verse is only rated by being checked, so on a library that has barely
	// been checked almost everything is 미평가 and fell out of both — a
	// 149-verse 암송 DAY offered two. Narrowing is the reader's to do.
	it('opens with every chip on in both rows', () => {
		setup();
		for (const row of ['시작 난이도', '전체 난이도'] as const) {
			for (const label of ['Impossible', 'xHard', 'Hard', 'Normal', 'Easy', 'xEasy', '미평가']) {
				expect(chip(row, label), `${row} ${label}`).toHaveAttribute('aria-pressed', 'true');
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
		// Everything is on, so it qualifies. Take xEasy off the 전체 row and the
		// verse fails that row while still clearing the 시작 one.
		expect(screen.getByText('1구절')).toBeInTheDocument();

		await fireEvent.click(chip('전체 난이도', 'xEasy'));
		expect(screen.getByText('고른 난이도 그룹에 해당하는 구절이 없습니다')).toBeInTheDocument();
	});

	it('files each dimension separately under 미평가', async () => {
		setup({
			items: [item(1)],
			ratings: new Map<string, ItemRating>([['a_krv:1', { start: 2, full: null }]])
		});
		expect(screen.getByText('1구절')).toBeInTheDocument();

		// Its 전체 rating is 미평가, so taking that chip off the 전체 row alone
		// drops it — the 시작 row, where it is rated Hard, never sees 미평가.
		await fireEvent.click(chip('전체 난이도', '미평가'));
		expect(screen.getByText('고른 난이도 그룹에 해당하는 구절이 없습니다')).toBeInTheDocument();
	});
});

	// Seven chips a row is a lot of tapping to say "this dimension only".
	it('clears a whole row in one press, then selects it back', async () => {
		setup();
		const row = '시작 난이도' as const;

		// It opens full, so the button offers the clear first.
		await fireEvent.click(chip(row, '전체 해제'));
		for (const label of ['Impossible', 'xHard', 'Hard', 'Normal', 'Easy', 'xEasy', '미평가']) {
			expect(chip(row, label)).toHaveAttribute('aria-pressed', 'false');
		}

		// Now that it is empty, the same button offers the fill.
		await fireEvent.click(chip(row, '전체 선택'));
		for (const label of ['Impossible', 'xHard', 'Hard', 'Normal', 'Easy', 'xEasy', '미평가']) {
			expect(chip(row, label)).toHaveAttribute('aria-pressed', 'true');
		}
	});

	it('moves one row without touching the other', async () => {
		setup();
		await fireEvent.click(chip('시작 난이도', '전체 해제'));
		expect(chip('시작 난이도', 'xEasy')).toHaveAttribute('aria-pressed', 'false');
		expect(chip('전체 난이도', 'xEasy')).toHaveAttribute('aria-pressed', 'true');
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
	// a different scope, a range emptied by the chips needs different chips.
	it('separates an empty range from one the chips emptied', async () => {
		setup({ items: [] });
		expect(screen.getByText('고른 범위에 구절이 없습니다')).toBeInTheDocument();
		expect(screen.queryByText('고른 난이도 그룹에 해당하는 구절이 없습니다')).toBeNull();
	});

	it('says it was the chips when the range itself has verses', async () => {
		// The rows open full, so the reader has to take something off before
		// this state exists at all — which is the point of telling the two
		// apart: this one is fixed by putting a chip back.
		setup({ items: [item(1)], ratings: new Map() });
		await fireEvent.click(chip('시작 난이도', '미평가'));

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
		expect(screen.getByRole('button', { name: '시작 단어 맞추기 게임' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '자주 틀리는 곳 찾기 게임' })).toBeInTheDocument();
	});

	it('tells onStart which game was chosen', async () => {
		const { onStart } = setup();
		await fireEvent.click(screen.getByRole('button', { name: '시작 단어 맞추기 게임' }));
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

	// Under 자주 틀린 순, which is no longer the opening order — 오래된 순 is,
	// and these two were both checked today.
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
		await fireEvent.click(screen.getByRole('radio', { name: '자주 틀린 순' }));
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

describe('QuizScopePicker opening word count', () => {
	const pickOpening = async () =>
		fireEvent.click(screen.getByRole('button', { name: '시작 단어 맞추기 게임' }));

	// The bar belongs to the run, not to the round: fixed before the first
	// question so every verse in a session is asked the same way and the score
	// means one thing.
	//
	// A slider rather than a row of pills. It is one dial with a range, and a
	// range is a thing you slide: four buttons made the reader read four labels
	// and pick, where a knob is read at a glance and moved by a thumb.
	it('offers the count as a slider once 시작 단어 is chosen', async () => {
		setup();
		await pickOpening();
		const dial = screen.getByRole('slider', { name: '시작 단어 수' });
		expect(dial).toHaveValue('3');
		expect(dial).toHaveAttribute('min', '2');
		expect(dial).toHaveAttribute('max', '5');
	});

	// The number is the point of the control, so it is on screen beside it
	// rather than only under the knob.
	it('says the count in words', async () => {
		setup();
		await pickOpening();
		expect(screen.getByTestId('opening-words-value')).toHaveTextContent('3단어');
	});

	// The other two games do not ask for an opening, so the dial would be a
	// control with nothing to turn.
	it('keeps it out of the way for the other games', () => {
		setup();
		expect(screen.queryByRole('slider', { name: '시작 단어 수' })).toBeNull();
	});

	it('tells onStart the count that was chosen', async () => {
		const { onStart } = setup();
		await pickOpening();
		const dial = screen.getByRole('slider', { name: '시작 단어 수' });
		await fireEvent.input(dial, { target: { value: '5' } });
		expect(screen.getByTestId('opening-words-value')).toHaveTextContent('5단어');
		await fireEvent.click(goButton());
		expect(onStart.mock.calls[0][2]).toBe(5);
	});

	// A screen reader saying "3" alone leaves out what is being counted.
	it('reads the value as a count of words', async () => {
		setup();
		await pickOpening();
		expect(screen.getByRole('slider', { name: '시작 단어 수' })).toHaveAttribute(
			'aria-valuetext',
			'3단어'
		);
	});
});

describe('QuizScopePicker — 문항 수', () => {
	const many = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1));
	const sizes = () => screen.getAllByRole('radio', { name: /구절$/ }).map((r) => r.textContent?.trim());
	const sizeChip = (name: string) => screen.getByRole('radio', { name });

	it('offers round steps the scope can fill, ending on 전체', () => {
		setup({ items: many(48), ratings: hard(48), attempts: new Map() });
		expect(sizes()).toEqual(['5구절', '10구절', '20구절', '30구절', '전체 48구절']);
	});

	// Ten is what this screen has always asked, so it stays the opening answer
	// wherever the scope is big enough to give it.
	it('opens on 10 when the scope is larger than one session', () => {
		setup({ items: many(48), ratings: hard(48), attempts: new Map() });
		expect(sizeChip('10구절')).toBeChecked();
	});

	// Ten is not on offer here, and falling back to the smallest step would
	// hide three of the seven verses behind a chip the reader never pressed.
	it('opens on 전체 when the scope is smaller than one session', () => {
		setup({ items: many(7), ratings: hard(7), attempts: new Map() });
		expect(sizeChip('전체 7구절')).toBeChecked();
	});

	// One choice is not a choice, and a radiogroup of one is a control that
	// cannot be pressed wrong — the same reason a lone 대상 is stated rather
	// than offered.
	it('says nothing when the scope leaves only one honest answer', () => {
		setup();
		expect(screen.queryByRole('radiogroup', { name: '문항 수' })).toBeNull();
	});

	it('hands onStart the number of verses that was chosen', async () => {
		const { onStart } = setup({ items: many(48), ratings: hard(48), attempts: new Map() });
		await fireEvent.click(sizeChip('20구절'));
		await fireEvent.click(goButton());
		expect(onStart.mock.calls[0][0]).toHaveLength(20);
	});

	it('moves the count line with the chosen size', async () => {
		setup({ items: many(48), ratings: hard(48), attempts: new Map() });
		await fireEvent.click(sizeChip('20구절'));
		expect(screen.getByText('48구절 중 오늘 20구절')).toBeInTheDocument();
	});

	it('drops the 중 오늘 half once the whole scope is the session', async () => {
		setup({ items: many(48), ratings: hard(48), attempts: new Map() });
		await fireEvent.click(sizeChip('전체 48구절'));
		expect(screen.getByText('48구절')).toBeInTheDocument();
	});

	// 전체 is a standing answer, not the number it happened to be worth when
	// it was pressed. A chip that silently fell back to 10 the moment the
	// reader narrowed the difficulty would be the opposite of what they said.
	it('keeps 전체 meaning 전체 after the scope shrinks', async () => {
		setup({
			items: many(52),
			ratings: new Map<string, ItemRating>(
				Array.from({ length: 52 }, (_, i) => [
					`a_krv:${i + 1}`,
					i < 40 ? { start: 2, full: 2 } : { start: 1, full: 1 }
				])
			),
			attempts: new Map()
		});
		await fireEvent.click(sizeChip('전체 52구절'));
		await fireEvent.click(chip('시작 난이도', 'xHard'));
		expect(sizeChip('전체 40구절')).toBeChecked();
		expect(screen.getByText('40구절')).toBeInTheDocument();
	});
});

describe('QuizScopePicker — 출제 순서', () => {
	const many = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1));
	const NOW = 1_700_000_000_000;
	const DAY = 86_400_000;

	/** 1 checked today, 2 checked nine days ago and never failed, 3 checked
	 *  today and failed three times. One fixture, three different answers. */
	const signals = new Map<string, VerseSignal>([
		['a_krv:1', { fails: 0, lastAskedAt: NOW }],
		['a_krv:2', { fails: 0, lastAskedAt: NOW - 9 * DAY }],
		['a_krv:3', { fails: 3, lastAskedAt: NOW }]
	]);

	const three = () =>
		setup({ items: many(3), ratings: hard(3), attempts: new Map(), now: NOW, signals });

	const started = (props: { onStart: ReturnType<typeof vi.fn> }) =>
		vi.mocked(props.onStart).mock.calls[0]?.[0]?.map((i: QuizItem) => i.id);

	it('opens on 오래된 순', () => {
		three();
		expect(screen.getByRole('radio', { name: '오래된 순' })).toBeChecked();
	});

	it('asks about the least recently checked verse first', async () => {
		const props = three();
		await fireEvent.click(goButton());
		expect(started(props)?.[0]).toBe('a_krv:2');
	});

	it('puts the often-failed verse first once 자주 틀린 순 is chosen', async () => {
		const props = three();
		await fireEvent.click(screen.getByRole('radio', { name: '자주 틀린 순' }));
		await fireEvent.click(goButton());
		expect(started(props)?.[0]).toBe('a_krv:3');
	});

	it('ignores both signals once 무작위 is chosen', async () => {
		const draw = vi.spyOn(Math, 'random').mockReturnValue(0);
		try {
			const props = three();
			await fireEvent.click(screen.getByRole('radio', { name: '무작위' }));
			await fireEvent.click(goButton());
			const ids = started(props);
			expect(draw).toHaveBeenCalled();
			expect([...(ids ?? [])].sort()).toEqual(['a_krv:1', 'a_krv:2', 'a_krv:3']);
			expect(ids).not.toEqual(['a_krv:2', 'a_krv:1', 'a_krv:3']);
		} finally {
			draw.mockRestore();
		}
	});
});
