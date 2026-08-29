import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import QuizSpotRound from '../../src/lib/components/quiz/QuizSpotRound.svelte';
import type { QuizItem } from '../../src/lib/quiz/session';
import { comboLimitMs } from '../../src/lib/arcade/combo';

// 그들에게(0) 율례와(1) 법도를(2) 가르쳐서(3) …
const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';
const FLAWED = VERSE.replace('법도를', '법을');
// The reader's attempt simply dropped 법도를. Nothing on screen is wrong —
// what is wrong is not on screen.
const MISSING = VERSE.replace('법도를 ', '');

const item: QuizItem = {
	id: '900_krv:127',
	packageId: '900_krv',
	verseNo: 127,
	title: '양  육',
	cite: '출애굽기 18 : 20',
	w: VERSE
};

function setup(shown: string) {
	const onDone = vi.fn();
	const { container } = render(QuizSpotRound, { item, shown, index: 1, total: 4, onDone });
	return { onDone, container };
}

const wordAt = (container: HTMLElement, i: number) => container.querySelectorAll('.word')[i];

/** Answers the round and returns what onDone was handed. */
async function answer(onDone: ReturnType<typeof vi.fn>, name: '이상 있음' | '이상 없음') {
	await fireEvent.click(screen.getByRole('button', { name }));
	await fireEvent.click(screen.getByRole('button', { name: '다음' }));
	return onDone;
}

describe('QuizSpotRound', () => {
	it('shows the sentence it was given, not the verse', () => {
		const { container } = setup(FLAWED);
		expect(container.textContent).toContain('법을');
		expect(container.textContent).not.toContain('법도를');
	});

	// The round asks one question — is anything wrong — and the two buttons are
	// the whole answer. Pointing at the word was dropped: a reader who sees
	// that the sentence is off has answered it, and making them also name the
	// word turned a recognition check into a second, harder question.
	it('asks only whether something is wrong', () => {
		const { container } = setup(FLAWED);
		expect(screen.getByRole('button', { name: '이상 있음' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '이상 없음' })).toBeInTheDocument();
		expect(container.querySelectorAll('.word[role="button"]')).toHaveLength(0);
	});

	it('accepts 이상 있음 when a word is wrong', async () => {
		const { onDone } = setup(FLAWED);
		await answer(onDone, '이상 있음');
		expect(onDone).toHaveBeenCalledWith(
			expect.objectContaining({ id: '900_krv:127', passed: true, accuracy: 1, missed: [] })
		);
	});

	it('rejects 이상 없음 when a word is wrong', async () => {
		const { onDone } = setup(FLAWED);
		await answer(onDone, '이상 없음');
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: false, accuracy: 0 }));
	});

	// A verse with no recorded attempt is shown as it really is, and 이상 없음
	// is the answer. Early on this is most rounds, which is why the picker
	// says how many real questions a scope holds.
	it('accepts 이상 없음 when the verse is shown intact', async () => {
		const { onDone } = setup(VERSE);
		await answer(onDone, '이상 없음');
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: true }));
	});

	it('rejects 이상 있음 when the verse is shown intact', async () => {
		const { onDone } = setup(VERSE);
		await answer(onDone, '이상 있음');
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: false }));
	});

	// Grading is the verdict only, but the reader still has to be shown where
	// the sentence went wrong or the round teaches nothing.
	it('marks the wrong word once the answer is in', async () => {
		const { container } = setup(FLAWED);
		await fireEvent.click(screen.getByRole('button', { name: '이상 없음' }));
		expect(wordAt(container, 2)).toHaveClass('wrong');
	});

	it('reports once even if 다음 is tapped twice', async () => {
		const { onDone } = setup(FLAWED);
		await fireEvent.click(screen.getByRole('button', { name: '이상 있음' }));
		const next = screen.getByRole('button', { name: '다음' });
		await fireEvent.click(next);
		await fireEvent.click(next);
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	it('says which round this is', () => {
		setup(FLAWED);
		expect(screen.getByText('2 / 4')).toBeInTheDocument();
	});

	// 답을 고르면 채점만 되고, 라운드를 떠나는 것은 다음이다. 두 단계를 하나로
	// 합치면 라우트가 즉시 다음 구절로 넘어가 버려서, 어디가 틀렸는지 볼 틈이
	// 없어진다.
	it('does not report the result until 다음 is pressed', async () => {
		const { onDone } = setup(FLAWED);
		await fireEvent.click(screen.getByRole('button', { name: '이상 있음' }));
		expect(onDone).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	// Answering removes the button that was pressed, so the browser drops focus
	// to <body> — a keyboard reader would have to tab in from the top of the
	// page to reach the only control left.
	it('hands focus to 다음 once the answer is in', async () => {
		setup(FLAWED);
		await fireEvent.click(screen.getByRole('button', { name: '이상 있음' }));
		expect(document.activeElement).toBe(screen.getByRole('button', { name: '다음' }));
	});
});

// A dropped word has no "does not belong" to point at: every word on screen is
// a word of the verse. Asked only in that direction the round had no right
// answer, and 이상 없음 — the claim that nothing is wrong — was graded correct
// on a sentence the reader had got wrong.
describe('QuizSpotRound — 빠진 단어', () => {
	it('accepts 이상 있음 when the sentence dropped a word', async () => {
		const { onDone } = setup(MISSING);
		await answer(onDone, '이상 있음');
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: true, accuracy: 1 }));
	});

	// The defect itself.
	it('rejects 이상 없음 when the sentence dropped a word', async () => {
		const { onDone } = setup(MISSING);
		await answer(onDone, '이상 없음');
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: false, accuracy: 0 }));
	});

	// Marking the wrong word teaches nothing when there is no wrong word. The
	// reader has to be shown what the sentence should have said.
	it('shows what the sentence dropped, once the answer is in', async () => {
		setup(MISSING);
		expect(screen.queryByTestId('dropped-words')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: '이상 있음' }));
		expect(screen.getByTestId('dropped-words')).toHaveTextContent('법도를');
	});

	// Nothing to show: the flaw is on screen, marked where it stands.
	it('does not repeat the verse when the flaw is on screen', async () => {
		setup(FLAWED);
		await fireEvent.click(screen.getByRole('button', { name: '이상 있음' }));
		expect(screen.queryByTestId('dropped-words')).toBeNull();
	});
});

// Whatever the round put on screen — a marked-up diff, three words, or a
// sentence that is wrong on purpose — none of them is the verse. Every round
// ends by showing it plainly, passed or failed, because a mark tells you where
// you slipped and not what to learn.
describe('QuizSpotRound — the verse itself', () => {
	// What this round shows is wrong on purpose, so the verse has to arrive
	// separately or the reader leaves having read only the flawed sentence.
	it('shows the intact verse after the answer, not the flawed sentence', async () => {
		setup(FLAWED);
		await fireEvent.click(screen.getByRole('button', { name: '이상 있음' }));
		expect(screen.getByTestId('quiz-answer')).toHaveTextContent(VERSE);
	});

	it('shows it after a wrong answer too', async () => {
		setup(FLAWED);
		await fireEvent.click(screen.getByRole('button', { name: '이상 없음' }));
		expect(screen.getByTestId('quiz-answer')).toHaveTextContent(VERSE);
	});

	it('does not give it away before the answer is in', () => {
		setup(FLAWED);
		// The rail is always in the layout so the round's height never changes;
		// what must not be there yet is the line in it.
		expect(screen.queryByTestId('quiz-answer-line')).toBeNull();
	});
});

// Deciding quickly is the skill this game tests: a reader who has to stare at
// their own wording for half a minute has not recognised it. The clock gates
// the chain and never the verdict.
describe('QuizSpotRound — 콤보', () => {
	it('runs a clock the reader can see', () => {
		setup(FLAWED);
		expect(screen.getByTestId('combo-bar')).toBeInTheDocument();
	});

	it('reports an answer inside the clock as in time', async () => {
		const { onDone } = setup(FLAWED);
		await answer(onDone, '이상 있음');
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ inTime: true }));
	});

	it('reports an answer after the clock as late', async () => {
		vi.useFakeTimers();
		try {
			const { onDone } = setup(FLAWED);
			await vi.advanceTimersByTimeAsync(comboLimitMs(VERSE.length) + 500);
			await answer(onDone, '이상 있음');
			expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ inTime: false }));
		} finally {
			vi.useRealTimers();
		}
	});

	// The whole promise of the timer: it may cost the chain, never the mark.
	it('still grades a late answer on whether it was right', async () => {
		vi.useFakeTimers();
		try {
			const { onDone } = setup(FLAWED);
			await vi.advanceTimersByTimeAsync(comboLimitMs(VERSE.length) + 500);
			await answer(onDone, '이상 있음');
			expect(onDone).toHaveBeenCalledWith(
				expect.objectContaining({ passed: true, accuracy: 1 })
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it('shows the chain it was handed', () => {
		const onDone = vi.fn();
		render(QuizSpotRound, { item, shown: FLAWED, index: 1, total: 4, onDone, streak: 3 });
		expect(screen.getByTestId('combo-readout')).toHaveTextContent('3 COMBO');
	});

	it('says nothing about a chain that has not started', () => {
		setup(FLAWED);
		expect(screen.queryByTestId('combo-readout')).toBeNull();
	});
});

describe('QuizSpotRound — 판정', () => {
	// This game has no board of its own, so the sentence is the board and the
	// stamp lands on it. The words are the only place the result is spoken.
	it('speaks a right call as 정답, and stamps the sentence', async () => {
		setup(FLAWED);
		await fireEvent.click(screen.getByRole('button', { name: '이상 있음' }));
		expect(screen.getByRole('status')).toHaveTextContent('정답입니다');
		expect(screen.getByTestId('correct-stamp')).toBeInTheDocument();
	});

	it('speaks a wrong call as one to come back to', async () => {
		setup(FLAWED);
		await fireEvent.click(screen.getByRole('button', { name: '이상 없음' }));
		expect(screen.getByRole('status')).toHaveTextContent('다시 볼 구절입니다');
		expect(screen.getByTestId('wrong-stamp')).toBeInTheDocument();
	});
});

describe('QuizSpotRound — 엔터로 다음', () => {
	it('advances once the verdict is up', async () => {
		const { onDone } = setup(FLAWED);
		await fireEvent.click(screen.getByRole('button', { name: '이상 있음' }));
		await fireEvent.keyDown(window, { key: 'Enter' });
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	// Enter must not stand in for a call the reader has not made.
	it('does nothing before the round is answered', async () => {
		const { onDone } = setup(FLAWED);
		await fireEvent.keyDown(window, { key: 'Enter' });
		expect(onDone).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: '이상 있음' })).toBeInTheDocument();
	});

	it('ignores the Enter that commits a syllable', async () => {
		const { onDone } = setup(FLAWED);
		await fireEvent.click(screen.getByRole('button', { name: '이상 있음' }));
		await fireEvent.keyDown(window, { key: 'Enter', isComposing: true });
		expect(onDone).not.toHaveBeenCalled();
	});
});
