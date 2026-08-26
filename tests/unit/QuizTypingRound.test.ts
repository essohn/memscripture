import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import QuizTypingRound from '../../src/lib/components/quiz/QuizTypingRound.svelte';
import type { QuizItem } from '../../src/lib/quiz/session';

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
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: true }));
	});

	it('fails a one-word slip and reports where it was', async () => {
		const { onDone } = setup();
		await type(VERSE.replace('법도를', '법을'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
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
});
