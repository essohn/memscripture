import { describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import QuizOpeningRound from '../../src/lib/components/quiz/QuizOpeningRound.svelte';
import type { QuizItem } from '../../src/lib/quiz/session';
import { RAID_HIT_POINTS, RAID_LIMIT_MS } from '../../src/lib/arcade/raid';

// 그들에게(0) 율례와(1) 법도를(2) — three words is the opening this game asks for.
const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';
const OPENING = '그들에게 율례와 법도를';

const item: QuizItem = {
	id: '900_krv:127',
	packageId: '900_krv',
	verseNo: 127,
	title: '양  육',
	cite: '출애굽기 18 : 20',
	w: VERSE
};

function setup(props: { words?: number } = {}) {
	const onDone = vi.fn();
	render(QuizOpeningRound, { item, index: 0, total: 3, onDone, ...props });
	return { onDone };
}

const box = () => screen.getByRole('textbox');

async function type(text: string) {
	await fireEvent.input(box(), { target: { value: text } });
}

/** Enter as the keyboard delivers it once a syllable is already committed.
 *  On window, because the box is retired the moment the round is graded and
 *  Enter still has to reach 다음 from wherever focus ended up. */
async function pressEnter(init: Partial<KeyboardEventInit> = {}) {
	await fireEvent.keyDown(window, { key: 'Enter', ...init });
}

describe('QuizOpeningRound', () => {
	it('shows the cue and hides the verse', () => {
		setup();
		expect(screen.getByText('출애굽기 18 : 20')).toBeInTheDocument();
		expect(screen.queryByText(VERSE)).toBeNull();
	});

	// No 제출 button: the point of this game is getting going, and hunting
	// for a button after three words erases it.
	it('has no submit button', () => {
		setup();
		expect(screen.queryByRole('button', { name: '제출' })).toBeNull();
	});

	it('passes the moment the opening is produced', async () => {
		setup();
		await type(OPENING);
		expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
	});

	it('is not satisfied by one word', async () => {
		setup();
		await type('그들에게');
		expect(screen.queryByRole('button', { name: '다음' })).toBeNull();
	});

	// Two used to be enough. Three is a start you could carry on from.
	it('is not satisfied by two words', async () => {
		setup();
		await type('그들에게 율례와');
		expect(screen.queryByRole('button', { name: '다음' })).toBeNull();
	});

	// Korean spacing is a spelling problem, not a recall failure — the shared
	// normalization decides, not the space bar.
	it('is not decided by spacing', async () => {
		setup();
		await type('그들에게율례와법도를');
		expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
	});

	it('reports a pass only when 다음 is pressed', async () => {
		const { onDone } = setup();
		await type(OPENING);
		expect(onDone).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(
			expect.objectContaining({ id: '900_krv:127', passed: true, accuracy: 1, missed: [] })
		);
	});

	it('reveals the opening and fails on 모르겠어요', async () => {
		const { onDone } = setup();
		await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
		expect(screen.getByText(OPENING)).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: false, accuracy: 0 }));
	});

	// The route advances its index off onDone, so a second report would skip
	// the next verse entirely.
	it('reports once even if 다음 is tapped twice', async () => {
		const { onDone } = setup();
		await type(OPENING);
		const next = screen.getByRole('button', { name: '다음' });
		await fireEvent.click(next);
		await fireEvent.click(next);
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	it('says which round this is', () => {
		setup();
		expect(screen.getByText('1 / 3')).toBeInTheDocument();
	});

	// A pass used to be editable away: the box stayed live after grading, and
	// backspacing past the opening would take 통과 and 다음 with it and bring
	// 모르겠어요 back — which then recorded a failure for a verse the reader
	// had just demonstrably started. `done` is latched against that, and the
	// box is now retired outright, so the keystroke has nowhere to land.
	it('retires the box once the opening is produced', async () => {
		setup();
		await type(OPENING);
		expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
		expect(screen.queryByRole('textbox')).toBeNull();
		expect(screen.queryByRole('button', { name: '모르겠어요' })).toBeNull();
	});

	// Three words never wrap, and a two-row box invites a recital the game
	// does not grade — nor does it want the newline a textarea takes Enter to
	// mean.
	it('answers on a single line', () => {
		setup();
		expect(box().tagName).toBe('INPUT');
	});

	// The route wraps each round in {#key}, so this is a fresh component per
	// card: focusing on mount is what makes 다음 land the reader on the next
	// verse ready to type rather than one tap short of it.
	it('focuses the box when the round appears', async () => {
		setup();
		await tick();
		expect(document.activeElement).toBe(box());
	});

	it('advances on Enter once the opening is produced', async () => {
		const { onDone } = setup();
		await type(OPENING);
		await pressEnter();
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	it('does nothing on Enter while the opening is still missing', async () => {
		const { onDone } = setup();
		await type('그들에게 율례와');
		await pressEnter();
		expect(onDone).not.toHaveBeenCalled();
		// And it must not stand in for 모르겠어요 — that records a failure.
		expect(screen.getByRole('button', { name: '모르겠어요' })).toBeInTheDocument();
	});

	// Korean input uses Enter to commit a syllable. Advancing on that keystroke
	// would throw the reader onto the next verse as they finished a word.
	it('ignores the Enter that commits a syllable', async () => {
		const { onDone } = setup();
		await type(OPENING);
		await pressEnter({ isComposing: true });
		expect(onDone).not.toHaveBeenCalled();
	});

	// 모르겠어요 removes the button the reader just pressed, so the browser
	// drops focus to <body> and Enter stops reaching anything at all.
	it('hands focus to 다음 when 모르겠어요 takes its own button away', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
		await tick();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: '다음' }));
	});
});

// Whatever the round put on screen — a marked-up diff, three words, or a
// sentence that is wrong on purpose — none of them is the verse. Every round
// ends by showing it plainly, passed or failed, because a mark tells you where
// you slipped and not what to learn.
describe('QuizOpeningRound — the verse itself', () => {
	// The sharpest case: this round only ever showed three words, so the rest
	// of the verse never appeared at all.
	it('shows the whole verse once the round is done', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
		expect(screen.getByTestId('quiz-answer')).toHaveTextContent(VERSE);
	});

	it('does not give it away while the reader is still typing', () => {
		setup();
		// The rail is always in the layout so the round's height never changes;
		// what must not be there yet is the line in it.
		expect(screen.queryByTestId('quiz-answer-line')).toBeNull();
	});
});

// The round already asked for three words. The raider gives that ask a shape:
// it closes while the reader types, and the opening shoots it down. Running
// out of time is the verdict 모르겠어요 already writes, reached by the clock.
describe('QuizOpeningRound — 요격', () => {
	it('puts the raider on screen', () => {
		setup();
		expect(screen.getByTestId('raid-stage')).toBeInTheDocument();
	});

	it('fails the round when the raider arrives', async () => {
		vi.useFakeTimers();
		try {
			const { onDone } = setup();
			await vi.advanceTimersByTimeAsync(RAID_LIMIT_MS + 200);
			// Same shape as 모르겠어요: the opening is shown and the round is lost.
			expect(screen.getByText(OPENING)).toBeInTheDocument();
			await fireEvent.click(screen.getByRole('button', { name: '다음' }));
			expect(onDone).toHaveBeenCalledWith(
				expect.objectContaining({ passed: false, accuracy: 0 })
			);
		} finally {
			vi.useRealTimers();
		}
	});

	// The clock is the raider's, not the reader's. Once it has been shot down
	// there is nothing left to arrive, and a reader reading the answer must not
	// have the round fail underneath them.
	it('stops the clock once the opening is produced', async () => {
		vi.useFakeTimers();
		try {
			const { onDone } = setup();
			await type(OPENING);
			await vi.advanceTimersByTimeAsync(RAID_LIMIT_MS * 2);
			await fireEvent.click(screen.getByRole('button', { name: '다음' }));
			expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: true }));
		} finally {
			vi.useRealTimers();
		}
	});

	it('shows the raider destroyed, not arriving, when the answer lands', async () => {
		setup();
		await type(OPENING);
		expect(screen.getByTestId('raid-stage')).toHaveAttribute('data-outcome', 'destroyed');
	});

	it('shows the raider through when the clock runs out', async () => {
		vi.useFakeTimers();
		try {
			setup();
			await vi.advanceTimersByTimeAsync(RAID_LIMIT_MS + 200);
			expect(screen.getByTestId('raid-stage')).toHaveAttribute('data-outcome', 'impact');
		} finally {
			vi.useRealTimers();
		}
	});

	// Points are the arcade's own currency and never touch the verdict, but the
	// summary adds them up, so a round has to hand them over.
	it('pays for the interception, and pays more for a fast one', async () => {
		const { onDone } = setup();
		await type(OPENING);
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		const paid = onDone.mock.calls[0][0].points;
		expect(paid).toBeGreaterThan(RAID_HIT_POINTS);
	});

	// Shooting the raider down *is* beating the clock — the round has no other
	// one — so a hit has to say so, or the session's chain can never start.
	it('counts an interception as beating the clock', async () => {
		const { onDone } = setup();
		await type(OPENING);
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ inTime: true }));
	});

	it('counts a round the raider won as beaten by it', async () => {
		const { onDone } = setup();
		await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ inTime: false }));
	});

	it('pays nothing for a round the raider won', async () => {
		const { onDone } = setup();
		await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ points: 0 }));
	});
});

// The chain spans the session, so every game has to show it. One the reader
// only learns about on the summary is not one they can play for.
describe('QuizOpeningRound — 콤보 표시', () => {
	it('shows the chain it was handed', () => {
		render(QuizOpeningRound, { item, index: 0, total: 3, streak: 4, onDone: vi.fn() });
		expect(screen.getByTestId('combo-readout')).toHaveTextContent('4 COMBO');
	});

	it('says nothing about a chain that has not started', () => {
		setup();
		expect(screen.queryByTestId('combo-readout')).toBeNull();
	});
});

describe('QuizOpeningRound — 맞고 틀림', () => {
	// The stamp lands on the board now rather than on a wall over 정답: the
	// answer is a ticker and nothing is hidden for a wall to open.
	it('stamps the board Wrong when the raider wins', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
		expect(screen.getByTestId('wrong-stamp')).toBeInTheDocument();
		expect(screen.queryByTestId('correct-stamp')).toBeNull();
	});

	it('stamps it Correct on an interception', async () => {
		setup();
		await type(OPENING);
		expect(screen.getByTestId('correct-stamp')).toBeInTheDocument();
		expect(screen.queryByTestId('wrong-stamp')).toBeNull();
	});

	// The box is gone by then, so what was typed in it has to be shown back or
	// the reader cannot see what they got wrong.
	it('shows back what was typed', async () => {
		setup();
		await type('그들에게 율법과');
		await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
		expect(screen.getByTestId('quiz-attempt')).toHaveTextContent('그들에게 율법과');
	});

	// Nothing written is nothing to show, and an empty labelled block claims
	// they wrote something blank.
	it('says nothing about an attempt that was never made', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
		expect(screen.queryByTestId('quiz-attempt-line')).toBeNull();
	});
});

describe('QuizOpeningRound — 판정', () => {
	// The only place the result is spoken, now that the card has gone.
	it('speaks an interception as 정답', async () => {
		setup();
		await type(OPENING);
		expect(screen.getByRole('status')).toHaveTextContent('정답입니다');
	});

	it('speaks a round the raider won as one to come back to', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
		expect(screen.getByRole('status')).toHaveTextContent('다시 볼 구절입니다');
	});
});

// The stage is a canvas and cannot be asserted on pixel by pixel, but the word
// it puts up when the bomb lands is DOM, and that is the part the reader is
// actually told the round by.
describe('QuizOpeningRound — 폭탄', () => {
	it('says Fail on the stage when the bomb lands', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
		expect(screen.getByTestId('stage-fail')).toHaveTextContent('Fail');
	});

	it('says nothing on the stage while the bomb is still falling', () => {
		setup();
		expect(screen.queryByTestId('stage-fail')).toBeNull();
	});

	it('says nothing on the stage when the bomb is shot down', async () => {
		setup();
		await type(OPENING);
		expect(screen.queryByTestId('stage-fail')).toBeNull();
	});
});

describe('QuizOpeningRound word count', () => {
	// The bar the reader has to clear is the game's difficulty, and it is now
	// theirs to set. Two words is a thin bar — plenty of verses open on the
	// same 그러므로 내가 — and five is most of a clause.
	it('grades against the count it was given', async () => {
		const { onDone } = setup({ words: 2 });
		await type('그들에게 율례와');
		await tick();
		await pressEnter();
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: true }));
	});

	it('does not pass two words when it was told four', async () => {
		const { onDone } = setup({ words: 4 });
		await type('그들에게 율례와');
		await tick();
		expect(onDone).not.toHaveBeenCalled();
	});

	it('reveals the count it asked for when the reader gives up', async () => {
		setup({ words: 5 });
		await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
		expect(screen.getByText('그들에게 율례와 법도를 가르쳐서 마땅히')).toBeInTheDocument();
	});
});

describe('QuizOpeningRound moving on', () => {
	// Sitting on a solved verse waiting to be told to continue is the reader
	// doing the app's bookkeeping. It goes by itself — after a beat, so the
	// hit lands and the stamp is seen rather than flashing past.
	it('goes to the next verse on its own once the opening is right', async () => {
		vi.useFakeTimers();
		try {
			const { onDone } = setup();
			await type(OPENING);
			await tick();
			expect(onDone).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1200);
			expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: true }));
		} finally {
			vi.useRealTimers();
		}
	});

	// 모르겠어요 reveals the opening, and a reader who has just been shown the
	// answer is reading it. Moving off that by itself would take it away.
	it('waits for the reader after 모르겠어요', async () => {
		vi.useFakeTimers();
		try {
			const { onDone } = setup();
			await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
			await vi.advanceTimersByTimeAsync(5000);
			expect(onDone).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});

// A rating that changes in the background is one the reader has to go and look
// up to trust. The round says so where it happened.
describe('QuizOpeningRound — 난이도 하락', () => {
	it('shows the step it just cost the verse', async () => {
		render(QuizOpeningRound, { item, index: 0, total: 3, rating: 3, onDone: vi.fn() });
		await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
		expect(screen.getByTestId('rating-drop')).toBeInTheDocument();
		expect(screen.getByTestId('rating-drop-to')).toHaveTextContent('2');
	});

	it('says nothing when the round was passed', async () => {
		render(QuizOpeningRound, { item, index: 0, total: 3, rating: 3, onDone: vi.fn() });
		await fireEvent.input(screen.getByRole('textbox'), { target: { value: OPENING } });
		expect(screen.queryByTestId('rating-drop')).toBeNull();
	});

	// Impossible is the bottom of the scale: there is nothing to show and
	// nothing to write.
	it('says nothing when the verse is already at the bottom', async () => {
		render(QuizOpeningRound, { item, index: 0, total: 3, rating: 0, onDone: vi.fn() });
		await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
		expect(screen.queryByTestId('rating-drop')).toBeNull();
	});

	// An unrated verse has no step to come down from, so it starts where the
	// scale says nothing either way.
	it('moves an unrated verse off 미평가', async () => {
		render(QuizOpeningRound, { item, index: 0, total: 3, rating: null, onDone: vi.fn() });
		await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
		expect(screen.getByTestId('rating-drop')).toHaveTextContent('미평가');
		expect(screen.getByTestId('rating-drop-to')).toHaveTextContent('2');
	});
});
