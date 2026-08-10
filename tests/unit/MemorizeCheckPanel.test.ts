import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import MemorizeCheckPanel from '../../src/lib/components/card/MemorizeCheckPanel.svelte';

const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';

function setup() {
	const onPickStart = vi.fn();
	const onPickFull = vi.fn();
	render(MemorizeCheckPanel, { verse: VERSE, onPickStart, onPickFull });
	return { onPickStart, onPickFull };
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
		const { onPickStart, onPickFull } = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onPickFull).toHaveBeenCalledTimes(1);
		expect(onPickFull).toHaveBeenCalledWith(5);
		expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
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
		const { onPickStart, onPickFull } = setup();
		await type(VERSE.replace('갈 길과', '갈길과'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onPickFull).toHaveBeenCalledWith(5);
	});

	// The app may declare success on its own; it may not decide that a flawed
	// attempt was nonetheless easy.
	it('asks for confirmation when the attempt is flawed, writing nothing yet', async () => {
		const { onPickStart, onPickFull } = setup();
		await type(VERSE.replace('가르쳐서', '가르치고'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onPickFull).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
	});

	it('writes the proposal once confirmed', async () => {
		const { onPickStart, onPickFull } = setup();
		await type(VERSE.replace('가르쳐서', '가르치고'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		expect(onPickFull).toHaveBeenCalledTimes(1);
		expect(onPickFull.mock.calls[0][0]).toBeLessThan(5);
	});

	it('writes nothing when the confirmation is cancelled', async () => {
		const { onPickStart, onPickFull } = setup();
		await type('전혀 다른 문장');
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '취소' }));
		expect(onPickFull).not.toHaveBeenCalled();
	});

	// 취소 discards the write, not the reader's progress — deliberately, so
	// fixing one wrong word doesn't mean retyping the whole verse. See the
	// `cancel()` comment in MemorizeCheckPanel.svelte.
	it('keeps the typed text after 취소 so the reader can fix it, not retype it', async () => {
		setup();
		const flawed = VERSE.replace('가르쳐서', '가르치고');
		await type(flawed);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '취소' }));
		expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(flawed);
	});

	it('marks the words that were wrong', async () => {
		setup();
		await type(VERSE.replace('가르쳐서', '가르치고'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		const wrong = screen.getByTestId('mismatched-words').querySelectorAll('[data-ok="false"]');
		expect(wrong).toHaveLength(1);
		expect(wrong[0].textContent).toBe('가르쳐서');
	});

	// The opening was never produced, so there is nothing to time.
	it('proposes no start rating when the opening was never typed', async () => {
		const { onPickStart, onPickFull } = setup();
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
		const { onPickStart, onPickFull } = setup();
		await type(VERSE);
		await pressEnter();
		expect(onPickFull).toHaveBeenCalledTimes(1);
	});

	// Korean input confirms a syllable with Enter. Submitting on that keystroke
	// would fire while the reader was still finishing a word.
	it('ignores Enter that is confirming an IME composition', async () => {
		const { onPickStart, onPickFull } = setup();
		await type(VERSE);
		await pressEnter({ isComposing: true });
		expect(onPickFull).not.toHaveBeenCalled();
	});

	it('leaves Shift+Enter to insert a newline', async () => {
		const { onPickStart, onPickFull } = setup();
		await type(VERSE);
		await pressEnter({ shiftKey: true });
		expect(onPickFull).not.toHaveBeenCalled();
	});

	it('does nothing on Enter while the box is empty', async () => {
		const { onPickStart, onPickFull } = setup();
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
		const { onPickStart, onPickFull } = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByLabelText(/전체 암송 난이도/));
		// The popover lists each level as a radio item named "<level> <label>".
		await fireEvent.click(screen.getByRole('menuitemradio', { name: '2 Hard' }));
		expect(onPickFull).toHaveBeenLastCalledWith(2);
	});
});

