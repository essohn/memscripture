import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import MemorizeCheckPanel from '../../src/lib/components/card/MemorizeCheckPanel.svelte';

const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';

function setup(onResult = vi.fn()) {
	render(MemorizeCheckPanel, { verse: VERSE, onResult });
	return onResult;
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
		const onResult = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onResult).toHaveBeenCalledTimes(1);
		expect(onResult.mock.calls[0][0].full).toBe(5);
		expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
	});

	// Spacing is not a recall failure, so this still counts as perfect.
	it('treats a spacing-only difference as perfect', async () => {
		const onResult = setup();
		await type(VERSE.replace('갈 길과', '갈길과'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onResult.mock.calls[0][0].full).toBe(5);
	});

	// The app may declare success on its own; it may not decide that a flawed
	// attempt was nonetheless easy.
	it('asks for confirmation when the attempt is flawed, writing nothing yet', async () => {
		const onResult = setup();
		await type(VERSE.replace('가르쳐서', '가르치고'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onResult).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
	});

	it('writes the proposal once confirmed', async () => {
		const onResult = setup();
		await type(VERSE.replace('가르쳐서', '가르치고'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		expect(onResult).toHaveBeenCalledTimes(1);
		expect(onResult.mock.calls[0][0].full).toBeLessThan(5);
	});

	it('writes nothing when the confirmation is cancelled', async () => {
		const onResult = setup();
		await type('전혀 다른 문장');
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '취소' }));
		expect(onResult).not.toHaveBeenCalled();
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
		const onResult = setup();
		await type('전혀 다른 문장');
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		expect(onResult.mock.calls[0][0].start).toBeNull();
	});
});
