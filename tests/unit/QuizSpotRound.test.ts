import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import QuizSpotRound from '../../src/lib/components/quiz/QuizSpotRound.svelte';
import type { QuizItem } from '../../src/lib/quiz/session';

// 그들에게(0) 율례와(1) 법도를(2) 가르쳐서(3) …
const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';
const FLAWED = VERSE.replace('법도를', '법을');

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

describe('QuizSpotRound', () => {
	it('shows the sentence it was given, not the verse', () => {
		const { container } = setup(FLAWED);
		expect(container.textContent).toContain('법을');
		expect(container.textContent).not.toContain('법도를');
	});

	it('accepts a tap on the word that does not belong', async () => {
		const { onDone, container } = setup(FLAWED);
		await fireEvent.click(wordAt(container, 2));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(
			expect.objectContaining({ id: '900_krv:127', passed: true, accuracy: 1, missed: [] })
		);
	});

	it('rejects a tap on a word that is fine', async () => {
		const { onDone, container } = setup(FLAWED);
		await fireEvent.click(wordAt(container, 0));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: false, accuracy: 0 }));
	});

	// A verse with no recorded attempt is shown as it really is, and 이상 없음
	// is the answer. Early on this is most rounds, which is why the picker
	// says how many real questions a scope holds.
	it('accepts 이상 없음 when the verse is shown intact', async () => {
		const { onDone } = setup(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '이상 없음' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: true }));
	});

	it('rejects 이상 없음 when something is wrong', async () => {
		const { onDone } = setup(FLAWED);
		await fireEvent.click(screen.getByRole('button', { name: '이상 없음' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: false }));
	});

	it('marks the wrong word once the answer is in', async () => {
		const { container } = setup(FLAWED);
		await fireEvent.click(screen.getByRole('button', { name: '이상 없음' }));
		expect(wordAt(container, 2)).toHaveClass('wrong');
	});

	it('reports once even if 다음 is tapped twice', async () => {
		const { onDone, container } = setup(FLAWED);
		await fireEvent.click(wordAt(container, 2));
		const next = screen.getByRole('button', { name: '다음' });
		await fireEvent.click(next);
		await fireEvent.click(next);
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	// The reported defect: a reader arriving cold saw one button — 이상 없음 —
	// and no sign the words themselves were the other half of the answer, so
	// the only verdict they could express was "nothing is wrong". The words
	// carried role="button" and a hover tint, neither of which exists on a
	// touch screen. VerseCard's marking mode answers the same problem with a
	// hint line; this is that line.
	it('tells the reader the words are how they point at the mistake', () => {
		setup(FLAWED);
		expect(screen.getByText('틀린 단어를 누르세요')).toBeInTheDocument();
	});

	it('stops offering the hint once the answer is in', async () => {
		const { container } = setup(FLAWED);
		await fireEvent.click(wordAt(container, 2));
		expect(screen.queryByText('틀린 단어를 누르세요')).toBeNull();
	});

	it('says which round this is', () => {
		setup(FLAWED);
		expect(screen.getByText('2 / 4')).toBeInTheDocument();
	});

	// 답을 고르면 채점만 되고, 라운드를 떠나는 것은 다음이다. 두 단계를 하나로
	// 합치면 라우트가 즉시 다음 구절로 넘어가 버려서, 어디가 틀렸는지 볼 틈이
	// 없어진다.
	it('does not report the result until 다음 is pressed', async () => {
		const { onDone, container } = setup(FLAWED);
		await fireEvent.click(wordAt(container, 2));
		expect(onDone).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	// Answering strips role and tabindex from every word, so the element the
	// reader was standing on stops being focusable and the browser drops focus
	// to <body> — a keyboard reader would have to tab in from the top of the
	// page to reach the only control left.
	it('hands focus to 다음 once the words stop being targets', async () => {
		const { container } = setup(FLAWED);
		const word = wordAt(container, 2) as HTMLElement;
		word.focus();
		await fireEvent.click(word);
		expect(document.activeElement).toBe(screen.getByRole('button', { name: '다음' }));
	});
});
