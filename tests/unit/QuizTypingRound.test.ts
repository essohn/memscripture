import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import QuizTypingRound from '../../src/lib/components/quiz/QuizTypingRound.svelte';
import type { QuizItem } from '../../src/lib/quiz/session';
import { PERFECT_POINTS } from '../../src/lib/arcade/combo';

// Word indices: 0 그들에게 · 1 율례와 · 2 법도를 · 3 가르쳐서 · 4 마땅히 · 5 갈
//               6 길과 · 7 할 · 8 일을 · 9 그들에게 · 10 보이고
const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';

const item: QuizItem = {
	id: '900_krv:127',
	packageId: '900_krv',
	verseNo: 127,
	title: '양  육',
	cite: '출애굽기 18 : 20',
	w: VERSE
};

function setup() {
	const onDone = vi.fn();
	render(QuizTypingRound, { item, index: 0, total: 3, onDone });
	return { onDone };
}

async function type(text: string) {
	await fireEvent.input(screen.getByRole('textbox'), { target: { value: text } });
}

describe('QuizTypingRound', () => {
	// The cue is the title and the citation. Showing the body would be showing
	// the answer.
	it('shows the cue and hides the verse', () => {
		setup();
		expect(screen.getByText('출애굽기 18 : 20')).toBeInTheDocument();
		expect(screen.queryByText(VERSE)).toBeNull();
	});

	it('passes an exact attempt', async () => {
		const { onDone } = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(
			expect.objectContaining({ id: '900_krv:127', passed: true, missed: [] })
		);
	});

	// Spacing is a spelling problem, not a recall failure — the card's check
	// already grades it that way and the quiz must not disagree.
	it('passes an attempt that differs only in spacing', async () => {
		const { onDone } = setup();
		await type(VERSE.replace(/ /g, ''));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: true }));
	});

	it('fails a one-word slip and reports where it was', async () => {
		const { onDone } = setup();
		await type(VERSE.replace('법도를', '법을'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(
			expect.objectContaining({ passed: false, missed: [2] })
		);
	});

	it('marks the word that went wrong before moving on', async () => {
		setup();
		await type(VERSE.replace('법도를', '법을'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		const wrong = document.querySelector('.wrong');
		expect(wrong?.textContent?.trim()).toBe('법도를');
	});

	it('will not submit an empty attempt', async () => {
		setup();
		expect(screen.getByRole('button', { name: '제출' })).toBeDisabled();
	});

	it('says which round this is', () => {
		setup();
		expect(screen.getByText('1 / 3')).toBeInTheDocument();
	});

	// 제출 shows the verdict; 다음 leaves the round. Collapsing the two would
	// unmount the round the instant it is graded, and the reader would never
	// see which word they missed.
	it('does not report the result until 다음 is pressed', async () => {
		const { onDone } = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onDone).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	// The route advances its index off onDone, so a second report would skip
	// the next verse outright — and nothing downstream would notice.
	it('reports once even if 다음 is tapped twice', async () => {
		const { onDone } = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		const next = screen.getByRole('button', { name: '다음' });
		await fireEvent.click(next);
		await fireEvent.click(next);
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	// The quiz's typing round is a 점검 without the rating, so its near
	// misses become 틀린 곳 찾기 questions the same way.
	it('reports the sentence it graded', async () => {
		const { onDone } = setup();
		const attempt = VERSE.replace('법도를', '법을');
		await type(attempt);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ typed: attempt }));
	});
});

// Whatever the round put on screen — a marked-up diff, three words, or a
// sentence that is wrong on purpose — none of them is the verse. Every round
// ends by showing it plainly, passed or failed, because a mark tells you where
// you slipped and not what to learn.
describe('QuizTypingRound — the verse itself', () => {
	it('shows the whole verse after a wrong answer', async () => {
		setup();
		await fireEvent.input(screen.getByRole('textbox', { name: '암송 구절 입력' }), {
			target: { value: '전혀 다른 문장' }
		});
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(screen.getByTestId('quiz-answer')).toHaveTextContent(VERSE);
	});

	it('shows it after a right answer too', async () => {
		setup();
		await fireEvent.input(screen.getByRole('textbox', { name: '암송 구절 입력' }), {
			target: { value: VERSE }
		});
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(screen.getByTestId('quiz-answer')).toHaveTextContent(VERSE);
	});

	it('does not give it away before the answer is in', () => {
		setup();
		expect(screen.queryByTestId('quiz-answer')).toBeNull();
	});
});

describe('QuizTypingRound — 점수', () => {
	it('puts a wall over the answer', async () => {
		setup();
		await type('틀린 답');
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(screen.getByTestId('answer-wall')).toBeInTheDocument();
	});

	// Reciting a whole verse without a slip is the hardest thing the quiz asks,
	// so it is the biggest thing it pays.
	it('pays for a flawless recitation', async () => {
		const { onDone } = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(
			expect.objectContaining({ passed: true, points: PERFECT_POINTS, inTime: true })
		);
	});

	it('pays nothing for a flawed one', async () => {
		const { onDone } = setup();
		await type('그들에게 율례와');
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: false, points: 0 }));
	});
});

// A right answer and a wrong one used to move the same way: both broke the
// wall into flying masonry, which is a reward, and a reader glancing back
// could not tell from the screen which had happened.
describe('QuizTypingRound — 맞고 틀림', () => {
	async function answerWith(text: string) {
		const handles = setup();
		await type(text);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		return handles;
	}

	it('holds the wall and stamps it on a miss', async () => {
		await answerWith('아무말');
		expect(screen.getByTestId('answer-wall')).toHaveAttribute('data-outcome', 'fail');
		expect(screen.getByTestId('wrong-stamp')).toBeInTheDocument();
	});

	it('breaks the wall, unstamped, on a flawless one', async () => {
		await answerWith(VERSE);
		expect(screen.getByTestId('answer-wall')).toHaveAttribute('data-outcome', 'pass');
		expect(screen.queryByTestId('wrong-stamp')).toBeNull();
	});

	// Two paragraphs of verse with only one of them named leaves the reader
	// working out which is theirs.
	it('names the reader own words', async () => {
		await answerWith('그들에게 율례와');
		expect(screen.getByText('입력한 내용')).toBeInTheDocument();
		expect(screen.getByTestId('quiz-attempt')).toHaveTextContent('그들에게 율례와');
	});
});

// The verdict was a line of small text at the foot of the card, the same size
// as the labels above it, and it is the one thing the reader looks for.
describe('QuizTypingRound — 판정', () => {
	it('calls a flawless answer 정답 in a card of its own', async () => {
		setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		const verdict = screen.getByTestId('quiz-verdict');
		expect(verdict).toHaveTextContent('정답!');
		expect(verdict.className).toContain('text-center');
	});

	it('sends a flawed one back to the list', async () => {
		setup();
		await type('아무말');
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(screen.getByTestId('quiz-verdict')).toHaveTextContent('다시 볼 구절');
	});
});
