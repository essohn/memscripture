import { describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import QuizOpeningRound from '../../src/lib/components/quiz/QuizOpeningRound.svelte';
import type { QuizItem } from '../../src/lib/quiz/session';

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

function setup() {
	const onDone = vi.fn();
	render(QuizOpeningRound, { item, index: 0, total: 3, onDone });
	return { onDone };
}

const box = () => screen.getByRole('textbox');

async function type(text: string) {
	await fireEvent.input(box(), { target: { value: text } });
}

/** Enter as the keyboard delivers it once a syllable is already committed. */
async function pressEnter(init: Partial<KeyboardEventInit> = {}) {
	await fireEvent.keyDown(box(), { key: 'Enter', ...init });
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

	// `done` re-derived per keystroke would let backspacing past the opening
	// un-grade a pass already earned: 통과 and 다음 gone, 모르겠어요 back, and
	// pressing it would record a failure for a verse just demonstrably
	// started.
	it('keeps the pass once the opening is produced, even after a later deletion', async () => {
		setup();
		await type(OPENING);
		expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();

		await type('그들에게 율례와 법도');

		expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
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
		expect(screen.queryByTestId('quiz-answer')).toBeNull();
	});
});
