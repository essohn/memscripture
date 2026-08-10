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

function setup(over = {}) {
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

describe('VerseCard memorize check', () => {
	it('shows no panel in read mode', () => {
		setup();
		expect(screen.queryByLabelText('암송 구절 입력')).toBeNull();
	});

	it('shows the panel once memorize mode starts', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '암송' }));
		expect(screen.getByLabelText('암송 구절 입력')).toBeInTheDocument();
	});

	// The whole point of the panel is to feed the ratings the card already
	// persists, without any page needing new wiring.
	it('routes a perfect attempt into both rating callbacks', async () => {
		const props = setup();
		await fireEvent.click(screen.getByRole('button', { name: '암송' }));
		await fireEvent.input(screen.getByLabelText('암송 구절 입력'), {
			target: { value: verse.w }
		});
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(props.onPickFullDifficulty).toHaveBeenCalledWith(5);
		expect(props.onPickStartDifficulty).toHaveBeenCalled();
	});

	it('leaves the curtain working', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '암송' }));
		expect(screen.getByText(/드래그해서 단어 열기|모두 열렸습니다/)).toBeInTheDocument();
	});

	// OYO verses are user-authored, so a body of pure punctuation is reachable
	// (unlike the shipped corpus). verse.w.trim().length > 0 would pass for
	// "***", but normalizeForGrading("***") is "" and accuracyOf treats two
	// empty strings as a perfect match — auto-saving 5 xEasy for nothing typed.
	it('hides the panel for a verse that normalizes to nothing', async () => {
		setup({ verse: { ...verse, w: '***' } });
		await fireEvent.click(screen.getByRole('button', { name: '암송' }));
		expect(screen.queryByLabelText('암송 구절 입력')).toBeNull();
	});
});
