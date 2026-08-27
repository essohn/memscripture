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
	// panel, and 다시 hands back a blank box for another try. Both screens now
	// spell that button the same way, because both do the same thing.
	it('hides the verse again when 다시 hands back a fresh check', async () => {
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
		await fireEvent.click(screen.getByRole('button', { name: '다시' }));
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

describe('밑줄: reader-placed underlines', () => {
	const MARKS = [{ i: 2, w: '법도를' }];

	it('underlines a marked word in read mode', () => {
		setup({ marks: MARKS });
		const body = screen.getByTestId('verse-body');
		expect(body.querySelector('.underlined')?.textContent).toBe('법도를');
	});

	// An OYO verse can be edited under a mark. Moving the underline onto a
	// different word would tell the reader to watch a spot they never missed.
	it('drops a mark whose word has been edited away', () => {
		setup({ marks: [{ i: 2, w: '옛날말' }] });
		expect(screen.getByTestId('verse-body').querySelector('.underlined')).toBeNull();
	});

	// Marking borrows the tap, which the curtain drag also wants, so it is a
	// mode rather than something always live.
	it('offers no 밑줄 control without a way to persist it', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '암송' }));
		expect(screen.queryByRole('button', { name: /밑줄/ })).toBeNull();
	});

	it('toggles a word through the callback while marking is on', async () => {
		const onToggleMark = vi.fn();
		setup({ onToggleMark });
		await fireEvent.click(screen.getByRole('button', { name: '암송' }));
		await fireEvent.click(screen.getByRole('button', { name: /밑줄/ }));
		await fireEvent.click(screen.getByText('법도를'));
		expect(onToggleMark).toHaveBeenCalledWith(2, '법도를');
	});

	// You cannot usefully mark a word you cannot read.
	it('opens the curtain when marking starts', async () => {
		setup({ onToggleMark: vi.fn() });
		await fireEvent.click(screen.getByRole('button', { name: '암송' }));
		await fireEvent.click(screen.getByRole('button', { name: /밑줄/ }));
		expect(screen.getByText(/자주 틀리는 단어를 눌러 밑줄/)).toBeInTheDocument();
		expect(document.querySelectorAll('.word.covered')).toHaveLength(0);
	});

	it('does not toggle while marking is off', async () => {
		const onToggleMark = vi.fn();
		setup({ onToggleMark });
		await fireEvent.click(screen.getByRole('button', { name: '암송' }));
		await fireEvent.click(screen.getByText('법도를'));
		expect(onToggleMark).not.toHaveBeenCalled();
	});
});

describe('읽어주기 reaches the synthesizer from the tap itself', () => {
	function stubSynthesis() {
		const spoken: string[] = [];
		const w = window as unknown as Record<string, unknown>;
		w.speechSynthesis = {
			speaking: false,
			pending: false,
			paused: false,
			getVoices: () => [],
			cancel: () => {},
			resume: () => {},
			speak: (u: { text: string }) => spoken.push(u.text)
		};
		w.SpeechSynthesisUtterance = class {
			text: string;
			lang = '';
			rate = 1;
			voice: unknown = null;
			onend: (() => void) | null = null;
			onerror: (() => void) | null = null;
			constructor(text: string) {
				this.text = text;
			}
		};
		return {
			spoken,
			restore() {
				delete w.speechSynthesis;
				delete w.SpeechSynthesisUtterance;
			}
		};
	}

	// iOS Safari only honours speak() when it is reached synchronously from the
	// gesture. Reading the options from IndexedDB first put an await in that
	// path, and iOS answered with silence and no error — while desktop Chrome,
	// which has no such rule, worked fine. Clicking without awaiting is what
	// makes this test able to catch it coming back.
	it('speaks without yielding to a microtask first', () => {
		const synth = stubSynthesis();
		try {
			setup();
			screen.getByRole('button', { name: /듣기/ }).click();
			expect(synth.spoken.length).toBeGreaterThan(0);
			expect(synth.spoken[0]).toContain('장');
		} finally {
			synth.restore();
		}
	});
})

describe('완벽 배지', () => {
	const badge = () => screen.queryByLabelText('완벽하게 암송한 구절');

	it('is absent on a verse never recited flawlessly', () => {
		setup();
		expect(badge()).toBeNull();
	});

	it('marks a verse that has been', () => {
		setup({ perfect: true });
		expect(badge()).toBeInTheDocument();
	});

	// It sits beside the title, which the header only renders in read mode,
	// so it appears as the card closes back — no reload needed. The
	// success view auto-closes a few seconds after the confetti, so in practice
	// the two land together.
	it('appears without a reload once the check closes', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '점검' }));
		await fireEvent.input(screen.getByLabelText('암송 구절 입력'), {
			target: { value: verse.w }
		});
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '닫기' }));
		expect(badge()).toBeInTheDocument();
	});

	// The reported gap: the card was told at load that this verse was flawless,
	// and kept saying so through a check that just proved otherwise.
	it('takes the badge back when a later check is flawed', async () => {
		setup({ perfect: true });
		expect(badge()).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: '점검' }));
		await fireEvent.input(screen.getByLabelText('암송 구절 입력'), {
			target: { value: '전혀 다른 문장' }
		});
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		await fireEvent.click(screen.getByRole('button', { name: '닫기' }));
		expect(badge()).toBeNull();
	});

	it('is not awarded for a flawed attempt', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '점검' }));
		await fireEvent.input(screen.getByLabelText('암송 구절 입력'), {
			target: { value: '전혀 다른 문장' }
		});
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		await fireEvent.click(screen.getByRole('button', { name: '닫기' }));
		expect(badge()).toBeNull();
	});
})

describe('성경에서 보기 링크', () => {
	it('links the verse to its chapter in the reader', () => {
		setup();
		const link = screen.getByLabelText(/성경에서 보기/);
		expect(link).toHaveAttribute(
			'href',
			'https://bible.lifescripture.org/r/krv/1/18#v-20'
		);
	});

	// Leaving mid-check would lose the attempt.
	it('opens in a new tab', () => {
		setup();
		expect(screen.getByLabelText(/성경에서 보기/)).toHaveAttribute('target', '_blank');
	});

	// A hand-written OYO citation may name no book the reader knows. No link is
	// better than one into the wrong book.
	it('is absent when the citation cannot be placed', () => {
		setup({ verse: { ...verse, cite: '내 메모 1 : 1' } });
		expect(screen.queryByLabelText(/성경에서 보기/)).toBeNull();
	});
})
