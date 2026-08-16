import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import VerseCard from '../../src/lib/components/card/VerseCard.svelte';

const verse = {
	i: 127,
	no: 127,
	package_id: '900_krv',
	title: '양  육',
	cite: '출애굽기 18 : 20',
	w: '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고'
};

function setup(over: Record<string, unknown> = {}) {
	const props = {
		verse,
		packageName: '900구절',
		packageId: '900_krv',
		tags: [],
		onPickStartDifficulty: vi.fn(),
		onPickFullDifficulty: vi.fn(),
		...over
	};
	render(VerseCard, props);
	return props;
}

const CURTAIN = /드래그해서 단어 열기|모두 열렸습니다/;

// The two modes answer different questions — "walk me through it" and "do I
// know it" — and each gets the whole card rather than sharing it.
describe('암송: the curtain', () => {
	it('is what the 암송 button opens', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '암송' }));
		expect(screen.getByText(CURTAIN)).toBeInTheDocument();
	});

	// Typing the verse while dragging it into view is not a check of anything.
	it('has no typing panel under it', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '암송' }));
		expect(screen.queryByLabelText('암송 구절 입력')).toBeNull();
	});
});

describe('점검: the typing panel', () => {
	it('shows no panel in read mode', () => {
		setup();
		expect(screen.queryByLabelText('암송 구절 입력')).toBeNull();
	});

	it('is what the 점검 button opens', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '점검' }));
		expect(screen.getByLabelText('암송 구절 입력')).toBeInTheDocument();
	});

	it('has no curtain to drag', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '점검' }));
		expect(screen.queryByText(CURTAIN)).toBeNull();
	});

	// The verse must not be legible while it is being typed from memory — and
	// not merely invisible: transparent text still occupies its lines, which
	// left the panel pushed down the card by a blank gap the height of the verse.
	it('removes the verse body outright while the check runs', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '점검' }));
		expect(screen.queryByTestId('verse-body')).toBeNull();
	});

	// The reader should be typing, not hunting for the box.
	it('focuses the input as soon as the check opens', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '점검' }));
		expect(document.activeElement).toBe(screen.getByLabelText('암송 구절 입력'));
	});

	it('reveals the verse once a result is saved', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '점검' }));
		await fireEvent.input(screen.getByLabelText('암송 구절 입력'), {
			target: { value: verse.w }
		});
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(screen.getByTestId('verse-body')).toBeInTheDocument();
	});

	// Saving reveals the verse, which is right — the check is over. But 다시
	// starts a fresh attempt, and leaving the answer on screen makes the next
	// attempt a copying exercise.
	it('hides the verse again when 다시 starts a fresh check', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '점검' }));
		await fireEvent.input(screen.getByLabelText('암송 구절 입력'), {
			target: { value: verse.w }
		});
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(screen.getByTestId('verse-body')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: '다시' }));
		expect(screen.queryByTestId('verse-body')).toBeNull();
	});

	// Same hazard by the other route: 포기 puts the verse on screen inside the
	// panel, and 취소 hands back a blank box for another try.
	it('hides the verse again when 취소 hands back a fresh check', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '점검' }));
		await fireEvent.input(screen.getByLabelText('암송 구절 입력'), {
			target: { value: verse.w }
		});
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '다시' }));
		await fireEvent.input(screen.getByLabelText('암송 구절 입력'), {
			target: { value: '전혀 다른 문장' }
		});
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '취소' }));
		expect(screen.queryByTestId('verse-body')).toBeNull();
	});

	// The whole point of the panel is to feed the ratings the card already
	// persists, without any page needing new wiring.
	it('routes a perfect attempt into both rating callbacks', async () => {
		const props = setup();
		await fireEvent.click(screen.getByRole('button', { name: '점검' }));
		await fireEvent.input(screen.getByLabelText('암송 구절 입력'), {
			target: { value: verse.w }
		});
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(props.onPickFullDifficulty).toHaveBeenCalledWith(5);
		expect(props.onPickStartDifficulty).toHaveBeenCalled();
	});

	// OYO verses are user-authored, so a body of pure punctuation is reachable
	// (unlike the shipped corpus). verse.w.trim().length > 0 would pass for
	// "***", but normalizeForGrading("***") is "" and accuracyOf treats two
	// empty strings as a perfect match — auto-saving 5 xEasy for nothing typed.
	it('offers no check for a verse that normalizes to nothing', async () => {
		setup({ verse: { ...verse, w: '***' } });
		expect(screen.queryByRole('button', { name: '점검' })).toBeNull();
	});
});

describe('card tap', () => {
	// Checking is available on every card everywhere; selection lives on one
	// screen. The biggest tap target should serve the more frequent action.
	it('opens the check when the card body is tapped', async () => {
		setup();
		await fireEvent.click(screen.getByTestId('verse-row'));
		expect(screen.getByLabelText('암송 구절 입력')).toBeInTheDocument();
	});

	// The card hosts a bookmark ribbon, difficulty badges and tags. A tap on
	// any of those must reach that control, not open the check behind it.
	it('ignores taps that land on an inner control', async () => {
		setup();
		await fireEvent.click(screen.getByLabelText(/첫 시작 난이도/));
		expect(screen.queryByLabelText('암송 구절 입력')).toBeNull();
	});

	// While selecting, the tap belongs to selection — and the mode is visible
	// on screen, so which one is active is never a guess.
	it('selects instead of checking while selection mode is on', async () => {
		const onToggleSelect = vi.fn();
		setup({ selecting: true, onToggleSelect });
		await fireEvent.click(screen.getByTestId('verse-row'));
		expect(onToggleSelect).toHaveBeenCalledTimes(1);
		expect(screen.queryByLabelText('암송 구절 입력')).toBeNull();
	});

	it('does not select when selection mode is off', async () => {
		const onToggleSelect = vi.fn();
		setup({ selecting: false, onToggleSelect });
		await fireEvent.click(screen.getByTestId('verse-row'));
		expect(onToggleSelect).not.toHaveBeenCalled();
	});

	// The verse detail page renders one card filling the screen; a tap
	// anywhere would open the check while merely scrolling.
	it('leaves the card inert when tap-to-check is disabled', async () => {
		setup({ tapToCheck: false });
		await fireEvent.click(screen.getByTestId('verse-row'));
		expect(screen.queryByLabelText('암송 구절 입력')).toBeNull();
	});
});
