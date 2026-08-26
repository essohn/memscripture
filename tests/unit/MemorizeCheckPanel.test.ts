import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import MemorizeCheckPanel from '../../src/lib/components/card/MemorizeCheckPanel.svelte';

const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';

function setup(extra: Record<string, unknown> = {}) {
	const onPickStart = vi.fn();
	const onPickFull = vi.fn();
	const onClose = vi.fn();
	const onGraded = vi.fn();
	render(MemorizeCheckPanel, {
		verse: VERSE,
		onPickStart,
		onPickFull,
		onClose,
		onGraded,
		...extra
	});
	return { onPickStart, onPickFull, onClose, onGraded };
}

async function type(text: string) {
	const box = screen.getByRole('textbox');
	await fireEvent.input(box, { target: { value: text } });
	return box;
}

describe('MemorizeCheckPanel', () => {
	it('disables submit until something is typed', async () => {
		setup();
		expect(screen.getByRole('button', { name: '제출' })).toBeDisabled();
		await type('그');
		expect(screen.getByRole('button', { name: '제출' })).toBeEnabled();
	});

	// A perfect recitation should not need a dialog.
	it('saves straight away on a perfect attempt', async () => {
		const { onPickStart, onPickFull, onClose, onGraded } = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onPickFull).toHaveBeenCalledTimes(1);
		expect(onPickFull).toHaveBeenCalledWith(5);
		expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
	});

	// The panel already works out which words went wrong in order to paint
	// them; this is that same answer, kept instead of discarded.
	it('reports the missed word positions', async () => {
		const { onGraded } = setup();
		await type(VERSE.replace('법도를', '법을'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		expect(onGraded).toHaveBeenCalledWith(expect.objectContaining({ missed: [2] }));
	});

	// A flawless attempt skips the dialog, and its empty list is evidence: it
	// is what pushes an older miss out of the suggestion window.
	it('reports an empty list for a flawless attempt', async () => {
		const { onGraded } = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onGraded).toHaveBeenCalledWith(expect.objectContaining({ missed: [] }));
	});

	// The original bug: a perfect attempt saved silently and left the panel
	// exactly as it was, so the reader who recited it best got no reply at all.
	// Asserting the callback fired is not enough — nothing proved the screen
	// changed, which is why three reviews passed it.
	it('reports success on screen and retires the input', async () => {
		setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(screen.getByTestId('memorize-success')).toBeInTheDocument();
		expect(screen.queryByRole('textbox')).toBeNull();
		expect(screen.queryByRole('button', { name: '제출' })).toBeNull();
	});

	it('names the levels it saved', async () => {
		setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		// 5 is xEasy; the start level depends on real elapsed time, so only the
		// full level is pinned here.
		expect(screen.getByTestId('memorize-success').textContent).toContain('xEasy');
	});

	it('can start over from the success screen', async () => {
		setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '다시' }));
		expect(screen.getByRole('textbox')).toHaveValue('');
		expect(screen.queryByTestId('memorize-success')).toBeNull();
	});

	// Spacing is not a recall failure, so this still counts as perfect.
	it('treats a spacing-only difference as perfect', async () => {
		const { onPickStart, onPickFull, onClose, onGraded } = setup();
		await type(VERSE.replace('갈 길과', '갈길과'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onPickFull).toHaveBeenCalledWith(5);
	});

	// The app may declare success on its own; it may not decide that a flawed
	// attempt was nonetheless easy.
	it('asks for confirmation when the attempt is flawed, writing nothing yet', async () => {
		const { onPickStart, onPickFull, onClose, onGraded } = setup();
		await type(VERSE.replace('가르쳐서', '가르치고'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onPickFull).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
	});

	it('writes the proposal once confirmed', async () => {
		const { onPickStart, onPickFull, onClose, onGraded } = setup();
		await type(VERSE.replace('가르쳐서', '가르치고'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		expect(onPickFull).toHaveBeenCalledTimes(1);
		expect(onPickFull.mock.calls[0][0]).toBeLessThan(5);
	});

	it('writes nothing when the confirmation is cancelled', async () => {
		const { onPickStart, onPickFull, onClose, onGraded } = setup();
		await type('전혀 다른 문장');
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '취소' }));
		expect(onPickFull).not.toHaveBeenCalled();
	});

	// 취소 clears the attempt so the next one starts clean. Keeping the text
	// was tried first and read as "the panel is stuck": the reader wants
	// another go, not an edit of the try they just rejected. Keeping the clock
	// was worse — a resubmit after reading the marked answer would have been
	// timed from the original open.
	it('clears the attempt on 취소 so a fresh check can start', async () => {
		setup();
		await type(VERSE.replace('가르쳐서', '가르치고'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '취소' }));
		expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
		expect(screen.getByRole('button', { name: '제출' })).toBeDisabled();
	});

	it('re-arms the timer on 취소', async () => {
		setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		// A perfect attempt goes to the success screen, so drive the flawed path.
		await fireEvent.click(screen.getByRole('button', { name: '다시' }));
		await type(VERSE.replace('가르쳐서', '가르치고'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '취소' }));
		// The opening readout only appears once the opening has been typed; a
		// cleared attempt has not, so it must be gone.
		expect(screen.queryByText(/도입부/)).toBeNull();
	});

	// Showing only the verse answered "what does it say", never "what did I
	// write" — so the reader could not see how they had gone wrong. Both are
	// needed: their words with the mistakes marked, and the verse to compare.
	it('shows the attempt with the reader own mistakes marked', async () => {
		setup();
		await type(VERSE.replace('가르쳐서', '가르치고'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		const attempt = screen.getByTestId('attempt-words');
		expect(attempt.textContent).toContain('가르치고');
		const wrong = attempt.querySelectorAll('[data-ok="false"]');
		expect(wrong).toHaveLength(1);
		expect(wrong[0].textContent).toBe('가르치고');
	});

	it('shows the verse alongside, marking what was missed', async () => {
		setup();
		await type(VERSE.replace('가르쳐서', '가르치고'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		const wrong = screen.getByTestId('mismatched-words').querySelectorAll('[data-ok="false"]');
		expect(wrong).toHaveLength(1);
		expect(wrong[0].textContent).toBe('가르쳐서');
	});

	it('keeps the attempt readable when whole words were invented', async () => {
		setup();
		await type('완전히 다른 문장을 적었습니다');
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(screen.getByTestId('attempt-words').textContent).toContain('완전히');
	});

	// The opening was never produced, so there is nothing to time.
	it('proposes no start rating when the opening was never typed', async () => {
		const { onPickStart, onPickFull, onClose, onGraded } = setup();
		await type('전혀 다른 문장');
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		expect(onPickStart).not.toHaveBeenCalled();
	});
});

describe('Enter to submit', () => {
	async function pressEnter(over: Record<string, unknown> = {}) {
		await fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ...over });
	}

	it('submits on Enter', async () => {
		const { onPickStart, onPickFull, onClose, onGraded } = setup();
		await type(VERSE);
		await pressEnter();
		expect(onPickFull).toHaveBeenCalledTimes(1);
	});

	// Korean input confirms a syllable with Enter. Submitting on that keystroke
	// would fire while the reader was still finishing a word.
	it('ignores Enter that is confirming an IME composition', async () => {
		const { onPickStart, onPickFull, onClose, onGraded } = setup();
		await type(VERSE);
		await pressEnter({ isComposing: true });
		expect(onPickFull).not.toHaveBeenCalled();
	});

	it('leaves Shift+Enter to insert a newline', async () => {
		const { onPickStart, onPickFull, onClose, onGraded } = setup();
		await type(VERSE);
		await pressEnter({ shiftKey: true });
		expect(onPickFull).not.toHaveBeenCalled();
	});

	it('does nothing on Enter while the box is empty', async () => {
		const { onPickStart, onPickFull, onClose, onGraded } = setup();
		await pressEnter();
		expect(onPickFull).not.toHaveBeenCalled();
	});
});

describe('adjusting the result after success', () => {
	// The success screen was read-only, so a reader who disagreed with a
	// proposal had no way to change it without redoing the whole attempt.
	it('offers both difficulty pickers', async () => {
		setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(screen.getByLabelText(/첫 시작 난이도/)).toBeInTheDocument();
		expect(screen.getByLabelText(/전체 암송 난이도/)).toBeInTheDocument();
	});

	it('persists an adjustment made from the success screen', async () => {
		const { onPickStart, onPickFull, onClose, onGraded } = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByLabelText(/전체 암송 난이도/));
		// The popover lists each level as a radio item named "<level> <label>".
		await fireEvent.click(screen.getByRole('menuitemradio', { name: '2 Hard' }));
		expect(onPickFull).toHaveBeenLastCalledWith(2);
	});
});

describe('finishing the check', () => {
	// Once a result is recorded the curtain has no job left — the reader wants
	// to compare what they typed against the verse, not keep it hidden.
	it('asks the card to reveal the verse when a result lands', async () => {
		const { onGraded } = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onGraded).toHaveBeenCalledTimes(1);
	});

	it('reveals after a confirmed imperfect attempt too', async () => {
		const { onGraded } = setup();
		await type(VERSE.replace('가르쳐서', '가르치고'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onGraded).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		expect(onGraded).toHaveBeenCalledTimes(1);
	});

	it('closes back to the ordinary card', async () => {
		const { onClose } = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '닫기' }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('keeps 다시 alongside 닫기 for another go', async () => {
		setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(screen.getByRole('button', { name: '다시' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
	});
});

describe('the clock starts with the typing, not the panel', () => {
	// Now that any card tap opens the panel, a stray tap while scrolling would
	// otherwise start timing a check the reader has not begun — and 첫 시작
	// 난이도 would already be ruined by the time they noticed.
	it('does not run before the first keystroke', async () => {
		setup();
		await new Promise((r) => setTimeout(r, 60));
		expect(screen.getByTestId('elapsed').textContent).toContain('0:00');
	});

	it('runs once typing begins', async () => {
		setup();
		await type('그');
		expect(screen.getByTestId('elapsed')).toBeInTheDocument();
	});
});


describe('힌트', () => {
	// The reader stuck mid-verse needs a nudge, not the answer. One character
	// per press, and the button says how much is still hidden.
	it('reveals one character of the word the reader stopped at', async () => {
		setup();
		await type('그들에게 율례와 법도를');
		await fireEvent.click(screen.getByRole('button', { name: '힌트' }));
		expect(screen.getByTestId('hint')).toHaveTextContent('가□□□');
	});

	it('opens one more character on each press', async () => {
		setup();
		await type('그들에게 율례와 법도를');
		const hint = screen.getByRole('button', { name: '힌트' });
		await fireEvent.click(hint);
		await fireEvent.click(hint);
		expect(screen.getByTestId('hint')).toHaveTextContent('가르□□');
	});

	it('starts at the opening when nothing has been typed', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '힌트' }));
		expect(screen.getByTestId('hint')).toHaveTextContent('그□□□');
	});

	// Otherwise the credit spent on the previous word would carry over and hand
	// the reader most of the next one unasked — and, word after word, feed them
	// the whole verse without another press.
	it('starts the next word over, and only when asked again', async () => {
		setup();
		await type('그들에게 율례와 법도를');
		const hint = screen.getByRole('button', { name: '힌트' });
		await fireEvent.click(hint);
		await fireEvent.click(hint);
		await fireEvent.click(hint);
		await type('그들에게 율례와 법도를 가르쳐서');
		expect(screen.queryByTestId('hint')).toBeNull();
		await fireEvent.click(hint);
		expect(screen.getByTestId('hint')).toHaveTextContent('마□□');
	});

	it('says nothing once the whole verse has been typed', async () => {
		setup();
		await type(VERSE);
		expect(screen.getByRole('button', { name: '힌트' })).toBeDisabled();
	});
});

describe('포기', () => {
	it('shows the verse and asks for both ratings', async () => {
		setup();
		await type('그들에게 율례와');
		await fireEvent.click(screen.getByRole('button', { name: '포기' }));
		expect(screen.getByTestId('mismatched-words')).toHaveTextContent('가르쳐서');
		expect(screen.getByLabelText(/첫 시작 난이도 \(설정 안 됨\)/)).toBeInTheDocument();
		expect(screen.getByLabelText(/전체 암송 난이도 \(설정 안 됨\)/)).toBeInTheDocument();
	});

	// The app can say a verse was recited perfectly. It cannot say what giving
	// up on it was worth — a reader who blanked on one word and one who knew
	// none of it both press this button.
	it('proposes no rating of its own', async () => {
		const { onPickFull } = setup();
		await type('그들에게 율례와');
		await fireEvent.click(screen.getByRole('button', { name: '포기' }));
		expect(onPickFull).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
	});

	it('saves the level the reader picks', async () => {
		const { onPickFull, onGraded } = setup();
		await type('그들에게 율례와');
		await fireEvent.click(screen.getByRole('button', { name: '포기' }));
		await fireEvent.click(screen.getByLabelText(/전체 암송 난이도 \(설정 안 됨\)/));
		await fireEvent.click(screen.getByRole('menuitemradio', { name: /^1 / }));
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		expect(onPickFull).toHaveBeenCalledWith(1);
		expect(onGraded).toHaveBeenCalled();
	});

	it('is available before anything is typed', () => {
		setup();
		expect(screen.getByRole('button', { name: '포기' })).toBeEnabled();
	});
});

describe('the input comes first', () => {
	it('focuses the box on open so 점검 goes straight to typing', () => {
		setup();
		expect(document.activeElement).toBe(screen.getByRole('textbox'));
	});

	// The box is the only thing here to act on, so nothing sits above it.
	it('puts the box ahead of the clock in the document', () => {
		setup();
		const box = screen.getByRole('textbox');
		const clock = screen.getByTestId('elapsed');
		expect(box.compareDocumentPosition(clock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('refocuses after 취소 hands back a fresh attempt', async () => {
		setup();
		await type('그들에게 율례와');
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '취소' }));
		expect(document.activeElement).toBe(screen.getByRole('textbox'));
	});
});


describe('confetti fires only for a flawless recitation', () => {
	// What the panel owns is the decision to fire; whether pixels move is the
	// canvas's business and jsdom has no 2d context to run it in, so that part
	// is verified in a real browser instead.
	const asked = () => document.querySelector('[data-testid="confetti"]')?.getAttribute('data-fire');

	it('appears when the attempt is perfect', async () => {
		setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(asked()).toBe('true');
	});

	// A flawed attempt is confirmed by hand, and the reader can set 5 there
	// themselves. Celebrating a rating they awarded themselves would be
	// congratulating the wrong thing.
	it('does not appear when a flawed attempt is rated 5 by hand', async () => {
		setup();
		await type(VERSE.replace('가르쳐서', '가르치고'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByLabelText(/전체 암송 난이도/));
		await fireEvent.click(screen.getByRole('menuitemradio', { name: /^5 / }));
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		expect(screen.getByTestId('memorize-success')).toBeInTheDocument();
		expect(asked()).toBe('false');
	});

	it('is armed again for the next attempt', async () => {
		setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '다시' }));
		expect(asked()).toBe('false');
	});
})

describe('the success view closes itself', () => {
	const countdown = () => screen.queryByTestId('auto-close')?.textContent?.trim();

	async function succeed() {
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
	}

	it('counts down from five beside 닫기', async () => {
		setup();
		await succeed();
		expect(countdown()).toBe('5');
	});

	it('closes when it reaches zero', async () => {
		vi.useFakeTimers();
		try {
			const { onClose } = setup();
			await type(VERSE);
			await fireEvent.click(screen.getByRole('button', { name: '제출' }));
			expect(onClose).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(5000);
			expect(onClose).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	// The success view carries editable difficulty badges. Closing while
	// someone is choosing a level would take the screen out from under them.
	it('stops on a touch inside the panel', async () => {
		vi.useFakeTimers();
		try {
			const { onClose } = setup();
			await type(VERSE);
			await fireEvent.click(screen.getByRole('button', { name: '제출' }));
			await fireEvent.pointerDown(screen.getByTestId('memorize-success'));
			await vi.advanceTimersByTimeAsync(8000);
			expect(onClose).not.toHaveBeenCalled();
			expect(countdown()).toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});

	it('stops when a level is adjusted', async () => {
		vi.useFakeTimers();
		try {
			const { onClose } = setup();
			await type(VERSE);
			await fireEvent.click(screen.getByRole('button', { name: '제출' }));
			await fireEvent.click(screen.getByLabelText(/전체 암송 난이도/));
			await fireEvent.click(screen.getByRole('menuitemradio', { name: /^3 / }));
			await vi.advanceTimersByTimeAsync(8000);
			expect(onClose).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	// 다시 leaves the success view for a fresh attempt; nothing should close it.
	it('does not close after 다시 returns to the input', async () => {
		vi.useFakeTimers();
		try {
			const { onClose } = setup();
			await type(VERSE);
			await fireEvent.click(screen.getByRole('button', { name: '제출' }));
			await fireEvent.click(screen.getByRole('button', { name: '다시' }));
			await vi.advanceTimersByTimeAsync(8000);
			expect(onClose).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
})

describe('grading in context', () => {
	// One good morning is not mastery: a verse the reader has been rating 1
	// steps up rather than jumping to the top of the scale.
	it('climbs one step from the level the verse already had', async () => {
		const { onPickFull } = setup({ currentFull: 1 });
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onPickFull).toHaveBeenCalledWith(2);
	});

	// Hearing the verse a moment earlier makes this recognition, not recall.
	it('holds a flawless attempt back when the verse was heard first', async () => {
		const { onPickFull } = setup({ heardAloud: true });
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onPickFull).toHaveBeenCalledWith(2);
	});

	it('does the same when a hint was taken', async () => {
		const { onPickFull } = setup();
		await type('그들에게');
		await fireEvent.click(screen.getByRole('button', { name: '힌트' }));
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onPickFull).toHaveBeenCalledWith(2);
	});
});

describe('keep or apply', () => {
	async function perfectFrom(previous: number) {
		const handles = setup({ currentFull: previous });
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		return handles;
	}

	// The graded value is already applied; this says so and offers the way back.
	it('offers both, with the graded one in effect', async () => {
		await perfectFrom(2);
		expect(screen.getByRole('button', { name: /반영/ })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('button', { name: /유지/ })).toHaveAttribute('aria-pressed', 'false');
	});

	it('writes the previous level back when 유지 is pressed', async () => {
		const { onPickFull } = await perfectFrom(2);
		await fireEvent.click(screen.getByRole('button', { name: /유지/ }));
		expect(onPickFull).toHaveBeenLastCalledWith(2);
	});

	// Either can be pressed again, so nothing is lost to a wrong first tap.
	it('goes back to the graded level when 반영 is pressed again', async () => {
		const { onPickFull } = await perfectFrom(2);
		await fireEvent.click(screen.getByRole('button', { name: /유지/ }));
		await fireEvent.click(screen.getByRole('button', { name: /반영/ }));
		expect(onPickFull).toHaveBeenLastCalledWith(3);
	});

	// Nothing to choose between when the check agreed with what was there.
	it('stays out of the way when the rating did not move', async () => {
		await perfectFrom(5);
		expect(screen.queryByRole('button', { name: /유지/ })).toBeNull();
	});

	it('stays out of the way when the verse had no rating', async () => {
		const handles = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		void handles;
		expect(screen.queryByRole('button', { name: /유지/ })).toBeNull();
	});
});
