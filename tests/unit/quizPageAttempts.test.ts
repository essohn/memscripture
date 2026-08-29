// First line, per the repo's convention: this page reaches db/checkHistory
// and the header's verseVisibility/fontScale state, which open Dexie.
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import QuizPage from '../../src/routes/quiz/+page.svelte';
import { db } from '../../src/lib/db/local';
import { listChecks } from '../../src/lib/db/checkHistory';
import { listTargets, type Target } from '../../src/lib/quiz/scope';
import type { ItemRating, QuizItem } from '../../src/lib/quiz/session';

const target: Target = { kind: 'package', id: 'a_krv', label: 'A구절' };
/** A second 대상 so the picker still renders a list: one target on its own is
 *  locked, and the race test below needs a button to press. */
const other: Target = { kind: 'package', id: 'b_krv', label: 'B구절' };

function item(packageId: string, verseNo: number, w: string): QuizItem {
	return {
		id: `${packageId}:${verseNo}`,
		packageId,
		verseNo,
		title: `제목 ${verseNo}`,
		cite: `창세기 1 : ${verseNo}`,
		w
	};
}

/**
 * Every verse these tests use, rated Hard in both dimensions.
 *
 * The picker opens with only Impossible/xHard/Hard on, so a fixture that left
 * its verses 미평가 would resolve to an empty session and a disabled Quiz! —
 * which is correct behaviour and useless as a fixture.
 */
const HARD: Map<string, ItemRating> = new Map(
	Array.from({ length: 60 }, (_, i) => [`a_krv:${i + 1}`, { start: 2, full: 2 }])
);

const verse = item('a_krv', 1, '또 증거는 이것이니 하나님이 우리에게 영생을 주신 것이라');

// vi.hoisted: the mock factory below runs before this file's own top-level
// code, so the fn it references has to exist before that point too.
const { resolveTargetMock } = vi.hoisted(() => ({ resolveTargetMock: vi.fn() }));

vi.mock('../../src/lib/quiz/scope', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../src/lib/quiz/scope')>()),
	listTargets: vi.fn(async () => [target, other]),
	resolveTarget: resolveTargetMock
}));

beforeEach(async () => {
	resolveTargetMock.mockReset();
	resolveTargetMock.mockResolvedValue({
		items: [verse],
		ratings: HARD,
		signals: new Map(),
		attempts: new Map()
	});
	await db.delete();
	await db.open();
});

/** Drives the picker to a running 틀린 곳 찾기 round over the one-verse scope
 *  above: waits for the auto-picked target's items to resolve (the 시작
 *  button is disabled until then), chooses the game, then starts. */
async function startSpotRun() {
	render(QuizPage);
	await waitFor(() => expect(screen.getByRole('button', { name: 'Quiz!' })).not.toBeDisabled());
	await fireEvent.click(screen.getByRole('button', { name: '자주 틀리는 곳 찾기 게임' }));
	await fireEvent.click(screen.getByRole('button', { name: 'Quiz!' }));
}

describe('quiz/+page.svelte — 틀린 곳 찾기 attempts', () => {
	function withAttempt() {
		resolveTargetMock.mockResolvedValue({
			items: [verse],
			ratings: HARD,
			signals: new Map(),
			attempts: new Map([
				['a_krv:1', '또 증거는 이것이니 하나님이 우리에게 영생은 주신 것이라']
			])
		});
	}

	// The round used to mount immediately on 시작 and have `shown` swapped
	// underneath it once the attempts read resolved. Now attempts arrive with
	// the scope, before 시작 is even enabled, so the round mounts once,
	// already holding the right text.
	//
	// Which of the two texts it holds is a coin, so the coin is held still
	// here: a test that let it fall would pass about half the time, which is
	// worse than no test.
	it('shows the recorded attempt when the draw calls for it', async () => {
		withAttempt();
		vi.spyOn(Math, 'random').mockReturnValue(0.99);
		try {
			await startSpotRun();
			await waitFor(() => expect(screen.getByText('영생은')).toBeInTheDocument());
			expect(screen.queryByText('영생을')).toBeNull();
		} finally {
			vi.mocked(Math.random).mockRestore();
		}
	});

	// The queue only picks verses it has an attempt for, so showing the attempt
	// every time made 이상 있음 the right answer in every round.
	it('shows the verse intact when the draw calls for that', async () => {
		withAttempt();
		vi.spyOn(Math, 'random').mockReturnValue(0.01);
		try {
			await startSpotRun();
			await waitFor(() => expect(screen.getByText('영생을')).toBeInTheDocument());
			expect(screen.queryByText('영생은')).toBeNull();
		} finally {
			vi.mocked(Math.random).mockRestore();
		}
	});
});

describe('quiz/+page.svelte — session size and order', () => {
	const many = (n: number) =>
		Array.from({ length: n }, (_, i) => item('a_krv', i + 1, `본문 ${i + 1}`));

	it('asks about at most SESSION_SIZE verses from a larger scope', async () => {
		resolveTargetMock.mockResolvedValue({
			items: many(48),
			ratings: HARD,
			signals: new Map(),
			attempts: new Map()
		});

		render(QuizPage);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Quiz!' })).not.toBeDisabled());
		expect(screen.getByText('48구절 중 오늘 10구절')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Quiz!' }));

		// The round header counts the session, not the scope. QuizTypingRound
		// renders `{index + 1} / {total}`.
		await waitFor(() => expect(screen.getByText('1 / 10')).toBeInTheDocument());
	});

	it('opens on the verse with the most recent failures', async () => {
		const now = Date.now();
		resolveTargetMock.mockResolvedValue({
			items: [item('a_krv', 1, '첫째 구절'), item('a_krv', 2, '둘째 구절')],
			ratings: HARD,
			signals: new Map([
				['a_krv:1', { fails: 0, lastAskedAt: now }],
				['a_krv:2', { fails: 3, lastAskedAt: now }]
			]),
			attempts: new Map()
		});

		render(QuizPage);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Quiz!' })).not.toBeDisabled());
		await fireEvent.click(screen.getByRole('button', { name: 'Quiz!' }));

		await waitFor(() => expect(screen.getByText('제목 2')).toBeInTheDocument());
	});

	// pickVersion is the guard that survives this change: resolveTarget is
	// still async and a reader can still tap a second 대상 before the first
	// resolves. It has never had a test; deleting the runVersion one without
	// leaving a race covered is how the last two defects hid.
	it('discards a 대상 that resolves after a later pick already applied', async () => {
		let resolveFirst: ((r: unknown) => void) | undefined;
		resolveTargetMock.mockImplementationOnce(
			() => new Promise((resolve) => { resolveFirst = resolve; })
		);
		resolveTargetMock.mockResolvedValueOnce({
			items: [item('a_krv', 2, '둘째 구절')],
			ratings: HARD,
			signals: new Map(),
			attempts: new Map()
		});

		render(QuizPage);
		// findByRole, not getByRole: the auto-pick's own resolveTarget call is
		// the pending one above, so this button only appears once listTargets
		// resolves and re-renders — a separate wait from the pending pick.
		await fireEvent.click(await screen.findByRole('button', { name: 'A구절' }));
		await waitFor(() => expect(screen.getByText('1구절')).toBeInTheDocument());

		resolveFirst?.({
			items: many(48),
			ratings: HARD,
			signals: new Map(),
			attempts: new Map()
		});
		await new Promise((r) => setTimeout(r, 0));
		expect(screen.getByText('1구절')).toBeInTheDocument();
		expect(screen.queryByText('48구절 중 오늘 10구절')).toBeNull();
	});
});

// The plan calls this "the one that proves the source widening did what it
// claims" — each game must record its own value, not a shared 'quiz'.
describe('quiz/+page.svelte — source recording', () => {
	it('records source "quiz" for a completed typing round', async () => {
		render(QuizPage);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Quiz!' })).not.toBeDisabled());
		await fireEvent.click(screen.getByRole('button', { name: 'Quiz!' }));

		await fireEvent.input(screen.getByRole('textbox', { name: '암송 구절 입력' }), {
			target: { value: verse.w }
		});
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));

		await waitFor(async () => {
			const rows = await listChecks('a_krv', 1);
			expect(rows[0]?.source).toBe('quiz');
		});
	});

	it('records source "quiz-opening" for a completed opening round', async () => {
		render(QuizPage);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Quiz!' })).not.toBeDisabled());
		await fireEvent.click(screen.getByRole('button', { name: '시작 단어 맞추기 게임' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Quiz!' }));

		await fireEvent.input(screen.getByRole('textbox', { name: '구절 첫머리 입력' }), {
			target: { value: '또 증거는 이것이니' }
		});
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));

		await waitFor(async () => {
			const rows = await listChecks('a_krv', 1);
			expect(rows[0]?.source).toBe('quiz-opening');
		});
	});

	it('records source "quiz-spot" for a completed spot round', async () => {
		// 틀린 곳 찾기 can only ask about a verse with a recorded attempt, so
		// the scope needs one to have anything to start.
		resolveTargetMock.mockResolvedValue({
			items: [verse],
			ratings: HARD,
			signals: new Map(),
			attempts: new Map([['a_krv:1', verse.w]])
		});

		await startSpotRun();
		await waitFor(() =>
			expect(screen.getByRole('button', { name: '이상 없음' })).toBeInTheDocument()
		);
		await fireEvent.click(screen.getByRole('button', { name: '이상 없음' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));

		await waitFor(async () => {
			const rows = await listChecks('a_krv', 1);
			expect(rows[0]?.source).toBe('quiz-spot');
		});
	});
});

// The reader's natural loop — finish ten verses, tap 끝내기, tap 시작 — must
// hand back a freshly ranked ten, not the identical ones. The ten verses just
// asked about now carry a fresh lastAskedAt, and that only reaches the queue
// if closing the summary re-resolves the 대상.
describe('quiz/+page.svelte — closing re-resolves the 대상', () => {
	it('re-resolves the 대상 on 끝내기, not just on the initial pick', async () => {
		render(QuizPage);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Quiz!' })).not.toBeDisabled());
		await fireEvent.click(screen.getByRole('button', { name: 'Quiz!' }));

		await fireEvent.input(screen.getByRole('textbox', { name: '암송 구절 입력' }), {
			target: { value: verse.w }
		});
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));

		await waitFor(() =>
			expect(screen.getByRole('button', { name: '끝내기' })).toBeInTheDocument()
		);

		const callsBeforeClose = resolveTargetMock.mock.calls.length;
		await fireEvent.click(screen.getByRole('button', { name: '끝내기' }));

		await waitFor(() =>
			expect(resolveTargetMock.mock.calls.length).toBeGreaterThan(callsBeforeClose)
		);
	});
});

// The reader reaches the quiz having already chosen a 암송 DAY, so the quiz
// must not hand that choice back as a list. Two ways in: the DAY named on the
// URL, and a single 대상 that is the only thing there is to name.
describe('quiz/+page.svelte — a scope decided before this screen', () => {
	const day: Target = { kind: 'event', id: 'e-summer', label: '2026 여름 암송 Day', ranges: [] };

	// Two DAYs, so a lone-대상 lock cannot be what makes this pass: without the
	// URL being read, both would be listed as buttons.
	const otherDay: Target = { kind: 'event', id: 'e-winter', label: '2026 겨울 암송 Day', ranges: [] };

	it('states the DAY named on the URL and offers no other scope', async () => {
		vi.mocked(listTargets).mockResolvedValueOnce([day, otherDay, target]);
		history.replaceState({}, '', '/quiz?event=e-summer');

		render(QuizPage);

		await waitFor(() => expect(screen.getByText('2026 여름 암송 Day')).toBeInTheDocument());
		expect(screen.queryByRole('button', { name: '2026 여름 암송 Day' })).toBeNull();
		expect(screen.queryByRole('button', { name: '2026 겨울 암송 Day' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'A구절' })).toBeNull();
		history.replaceState({}, '', '/quiz');
	});

	// A list of one is not a choice.
	it('states a lone 대상 rather than listing it', async () => {
		vi.mocked(listTargets).mockResolvedValueOnce([day]);

		render(QuizPage);

		await waitFor(() => expect(screen.getByText('2026 여름 암송 Day')).toBeInTheDocument());
		expect(screen.queryByRole('button', { name: '2026 여름 암송 Day' })).toBeNull();
	});

	// Packages are the fallback for a reader with no DAY at all — without them
	// that reader meets an empty picker.
	it('drops the packages once a DAY exists', async () => {
		vi.mocked(listTargets).mockResolvedValueOnce([day, target, other]);

		render(QuizPage);

		await waitFor(() => expect(screen.getByText('2026 여름 암송 Day')).toBeInTheDocument());
		expect(screen.queryByRole('button', { name: 'A구절' })).toBeNull();
	});
});

// A run had no way out of it. The only exits were answering every round or
// leaving the page, which on a ten-verse session is a long way to go for a
// scope picked by mistake.
describe('quiz/+page.svelte — 나가기와 다시', () => {
	async function startRun() {
		render(QuizPage);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Quiz!' })).not.toBeDisabled());
		await fireEvent.click(screen.getByRole('button', { name: '시작 단어 맞추기 게임' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Quiz!' }));
	}

	it('offers both while a run is on', async () => {
		await startRun();
		expect(screen.getByRole('button', { name: '나가기' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '다시' })).toBeInTheDocument();
	});

	it('goes back to the picker on 나가기', async () => {
		await startRun();
		await fireEvent.click(screen.getByRole('button', { name: '나가기' }));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Quiz!' })).toBeInTheDocument());
	});

	// 다시 restarts the run rather than leaving it: the same verses, from the
	// first, with the chain and the score back to nothing.
	it('returns to the first verse on 다시', async () => {
		await startRun();
		expect(screen.getByText('1 / 1')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: '다시' }));
		expect(screen.getByText('1 / 1')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Quiz!' })).toBeNull();
	});
});
