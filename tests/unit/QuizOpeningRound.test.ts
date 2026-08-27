import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import QuizOpeningRound from '../../src/lib/components/quiz/QuizOpeningRound.svelte';
import type { QuizItem } from '../../src/lib/quiz/session';

// 그들에게(0) 율례와(1) — two words is the opening.
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
	render(QuizOpeningRound, { item, index: 0, total: 3, onDone });
	return { onDone };
}

async function type(text: string) {
	await fireEvent.input(screen.getByRole('textbox'), { target: { value: text } });
}

describe('QuizOpeningRound', () => {
	it('shows the cue and hides the verse', () => {
		setup();
		expect(screen.getByText('출애굽기 18 : 20')).toBeInTheDocument();
		expect(screen.queryByText(VERSE)).toBeNull();
	});

	// No 제출 button: the point of this game is getting going, and hunting
	// for a button after two words erases it.
	it('has no submit button', () => {
		setup();
		expect(screen.queryByRole('button', { name: '제출' })).toBeNull();
	});

	it('passes the moment the opening is produced', async () => {
		setup();
		await type('그들에게 율례와');
		expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
	});

	it('is not satisfied by one word', async () => {
		setup();
		await type('그들에게');
		expect(screen.queryByRole('button', { name: '다음' })).toBeNull();
	});

	// Korean spacing is a spelling problem, not a recall failure — the shared
	// normalization decides, not the space bar.
	it('is not decided by spacing', async () => {
		setup();
		await type('그들에게율례와');
		expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
	});

	it('reports a pass only when 다음 is pressed', async () => {
		const { onDone } = setup();
		await type('그들에게 율례와');
		expect(onDone).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(
			expect.objectContaining({ id: '900_krv:127', passed: true, accuracy: 1, missed: [] })
		);
	});

	it('reveals the opening and fails on 모르겠어요', async () => {
		const { onDone } = setup();
		await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
		expect(screen.getByText('그들에게 율례와')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(
			expect.objectContaining({ passed: false, accuracy: 0 })
		);
	});

	// The route advances its index off onDone, so a second report would skip
	// the next verse entirely.
	it('reports once even if 다음 is tapped twice', async () => {
		const { onDone } = setup();
		await type('그들에게 율례와');
		const next = screen.getByRole('button', { name: '다음' });
		await fireEvent.click(next);
		await fireEvent.click(next);
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	it('says which round this is', () => {
		setup();
		expect(screen.getByText('1 / 3')).toBeInTheDocument();
	});
});
