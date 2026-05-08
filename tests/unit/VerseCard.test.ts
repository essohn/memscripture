import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import VerseCard from '../../src/lib/components/card/VerseCard.svelte';
import type { StoredVerse } from '../../src/lib/db/local';

const verse: StoredVerse = {
	package_id: 'p',
	no: 1,
	i: 1,
	title: '제목',
	cite: '잠언 3:5-6',
	w: '너는 마음을 다하여 여호와를 의뢰하고 네 명철을 의지하지 말라 너는 범사에 그를 인정하라 그리하면 네 길을 지도하시리라'
};

const shortVerse: StoredVerse = {
	...verse,
	w: '말씀'
};

function getCoveredCount(container: HTMLElement): number {
	return container.querySelectorAll('.word.covered').length;
}

function getRevealedWordTexts(container: HTMLElement): string[] {
	return Array.from(
		container.querySelectorAll<HTMLElement>('.word:not(.covered) .word-text')
	).map((el) => el.textContent ?? '');
}

describe('VerseCard swipe curtain memorize mode', () => {
	it('starts in read mode showing full body and 암송 시작 button', () => {
		render(VerseCard, { props: { verse } });
		expect(screen.getByText(verse.w)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '암송 시작' })).toBeInTheDocument();
	});

	it('암송 시작 covers every word with a striped overlay', async () => {
		const { container } = render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));

		// 17 words in the canonical 잠언 3:5-6 verse text
		expect(container.querySelectorAll('.word')).toHaveLength(17);
		expect(getCoveredCount(container)).toBe(17);
	});

	it('전체 보기 reveals all words at once', async () => {
		const { container } = render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		await fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));

		expect(getCoveredCount(container)).toBe(0);
		// 전체 보기 button is hidden once everything is revealed
		expect(screen.queryByRole('button', { name: '전체 보기' })).toBeNull();
	});

	it('처음부터 다시 re-covers all words', async () => {
		const { container } = render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		await fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
		await fireEvent.click(screen.getByRole('button', { name: '처음부터 다시' }));

		expect(getCoveredCount(container)).toBe(17);
	});

	it('암송 종료 returns to read mode with full body visible', async () => {
		render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		await fireEvent.click(screen.getByRole('button', { name: '암송 종료' }));

		expect(screen.getByText(verse.w)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '암송 시작' })).toBeInTheDocument();
	});

	it('renders revealed words in document order via 전체 보기', async () => {
		const { container } = render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		await fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));

		expect(getRevealedWordTexts(container)).toEqual([
			'너는',
			'마음을',
			'다하여',
			'여호와를',
			'의뢰하고',
			'네',
			'명철을',
			'의지하지',
			'말라',
			'너는',
			'범사에',
			'그를',
			'인정하라',
			'그리하면',
			'네',
			'길을',
			'지도하시리라'
		]);
	});

	it('single-word verse: 암송 시작 immediately uncovers the word', async () => {
		const { container } = render(VerseCard, { props: { verse: shortVerse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));

		expect(container.querySelectorAll('.word')).toHaveLength(1);
		expect(getCoveredCount(container)).toBe(0);
		// 전체 보기 button hidden because allRevealed is true
		expect(screen.queryByRole('button', { name: '전체 보기' })).toBeNull();
		// Other controls present
		expect(screen.getByRole('button', { name: '처음부터 다시' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '암송 종료' })).toBeInTheDocument();
	});
});
