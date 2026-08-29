import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import QuizTypingRound from '../../src/lib/components/quiz/QuizTypingRound.svelte';
import type { QuizItem } from '../../src/lib/quiz/session';
import { PERFECT_POINTS } from '../../src/lib/arcade/combo';
import { defuseLimitMs } from '../../src/lib/arcade/defuse';

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

	// The reader's own word, not the verse's. 입력한 내용 is the one block that
	// is supposed to be their hand, and marking 법도를 there would be marking a
	// word they never wrote — 정답 sits directly above it and says what the
	// verse actually reads.
	it('marks the word that went wrong before moving on', async () => {
		setup();
		await type(VERSE.replace('법도를', '법을'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		const wrong = screen.getByTestId('quiz-attempt-line').querySelector('.wrong');
		expect(wrong?.textContent?.trim()).toBe('법을');
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
		// The rail is always in the layout so the round's height never changes;
		// what must not be there yet is the line in it.
		expect(screen.queryByTestId('quiz-answer-line')).toBeNull();
	});
});

describe('QuizTypingRound — 점수', () => {
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

	// The stamp used to land on a wall over 정답, whose job was to hide that
	// answer until the round was over. 정답 is a ticker now and nothing is
	// hidden, so the stamp moved onto the board — where the reader is already
	// looking, and where the bomb has just gone off or been made safe.
	it('stamps the board Wrong on a miss', async () => {
		await answerWith('아무말');
		expect(screen.getByTestId('wrong-stamp')).toBeInTheDocument();
		expect(screen.queryByTestId('correct-stamp')).toBeNull();
	});

	it('stamps it Correct on a flawless one', async () => {
		await answerWith(VERSE);
		expect(screen.getByTestId('correct-stamp')).toHaveTextContent('Correct!');
		expect(screen.queryByTestId('wrong-stamp')).toBeNull();
	});

	it('stamps only the one that happened', async () => {
		await answerWith('아무말');
		expect(screen.queryByTestId('correct-stamp')).toBeNull();
	});

	// Two paragraphs of verse with only one of them named leaves the reader
	// working out which is theirs.
	it('names the reader own words', async () => {
		await answerWith('그들에게 율례와');
		expect(screen.getByText('입력한 내용')).toBeInTheDocument();
		// Exactly, not merely containing: the block was rendering the verse's
		// own words — every word of the verse, marked — which contains any
		// prefix of it and so passed a substring check while showing the reader
		// text they never wrote.
		expect(screen.getByTestId('quiz-attempt-line').textContent?.trim()).toBe('그들에게 율례와');
	});

	// The reported defect. markMismatchedWords only asks whether each *verse*
	// word turns up in the attempt, so a word the reader added is not something
	// it can mark — while accuracyOf, which is a character diff, takes it off
	// the score. The round failed with nothing on screen marked wrong, and the
	// reader was left holding a verse they could see was right.
	it('marks a word the verse cannot account for', async () => {
		const { onDone } = await answerWith(VERSE + ' 아멘');
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: false }));

		const wrong = screen.getByTestId('quiz-attempt-line').querySelectorAll('.wrong');
		expect([...wrong].map((w) => w.textContent)).toEqual(['아멘']);
	});

	// 야고보서 1:18 opens 그가 그 조물, and a doubled 그 is the easiest slip
	// there is to make in it — and was the hardest to see, because nothing
	// about it was marked.
	it('marks a word the reader typed twice', async () => {
		await answerWith(VERSE.replace('그들에게 율례와', '그들에게 그들에게 율례와'));
		const wrong = screen.getByTestId('quiz-attempt-line').querySelectorAll('.wrong');
		expect(wrong.length).toBeGreaterThan(0);
	});
});

// The verdict was a line of small text at the foot of the card, the same size
// as the labels above it, and it is the one thing the reader looks for.
describe('QuizTypingRound — 판정', () => {
	// The card that said 정답! is gone — the board and the stamp say it, and a
	// rectangle above the button was one more thing between the reader and it.
	// The words remain for anyone who has neither: this is now the only place
	// the result is spoken.
	it('speaks the verdict for a reader who cannot see the board', async () => {
		setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(screen.getByRole('status')).toHaveTextContent('정답입니다');
	});

	it('speaks a miss as one', async () => {
		setup();
		await type('아무말');
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(screen.getByRole('status')).toHaveTextContent('다시 볼 구절입니다');
	});
});

// The round asks for a whole verse, so its bomb sits and counts rather than
// falling: a falling one would have to fall for two minutes.
describe('QuizTypingRound — 시한폭탄', () => {
	it('puts a bomb on the desk', () => {
		setup();
		expect(screen.getByTestId('defuse-stage')).toBeInTheDocument();
	});

	it('defuses it on a flawless recitation', async () => {
		setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(screen.getByTestId('defuse-stage')).toHaveAttribute('data-outcome', 'defused');
		expect(screen.queryByTestId('stage-fail')).toBeNull();
	});

	it('blows it on a flawed one', async () => {
		setup();
		await type('아무말');
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(screen.getByTestId('defuse-stage')).toHaveAttribute('data-outcome', 'blown');
		expect(screen.getByTestId('stage-fail')).toHaveTextContent('Fail');
	});

	// Running out submits what is there rather than inventing a verdict: the
	// grade is then the real grade of what the reader actually wrote, and the
	// check history never has to learn that a clock can mark a verse wrong.
	it('submits what is written when the clock runs out', async () => {
		vi.useFakeTimers();
		try {
			const { onDone } = setup();
			await type('그들에게 율례와');
			await vi.advanceTimersByTimeAsync(defuseLimitMs(VERSE.length) + 300);
			expect(screen.getByTestId('defuse-stage')).toHaveAttribute('data-outcome', 'blown');
			await fireEvent.click(screen.getByRole('button', { name: '다음' }));
			expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: false }));
			// What they had is still theirs, and still on screen.
			expect(screen.getByTestId('quiz-attempt-line').textContent?.trim()).toBe('그들에게 율례와');
		} finally {
			vi.useRealTimers();
		}
	});

	// A reader who finished has nothing left to lose to the clock.
	it('stops the clock once the answer is in', async () => {
		vi.useFakeTimers();
		try {
			const { onDone } = setup();
			await type(VERSE);
			await fireEvent.click(screen.getByRole('button', { name: '제출' }));
			await vi.advanceTimersByTimeAsync(defuseLimitMs(VERSE.length) * 2);
			expect(screen.getByTestId('defuse-stage')).toHaveAttribute('data-outcome', 'defused');
			await fireEvent.click(screen.getByRole('button', { name: '다음' }));
			expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: true }));
		} finally {
			vi.useRealTimers();
		}
	});
});
