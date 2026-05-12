import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import ReviewCard from '../../src/lib/components/srs/ReviewCard.svelte';
import type { StoredVerse } from '../../src/lib/db/local';

const verse: StoredVerse = {
	package_id: 'pkg',
	no: 1,
	i: 1,
	title: '중심되신 그리스도',
	cite: '고후 5:17',
	w: '그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라 이전 것은 지나갔으니 보라 새 것이 되었도다'
};

const baseProps = {
	verse,
	onCiteRated: () => {},
	onRecallRated: () => {}
};

describe('ReviewCard', () => {
	it('Stage 1: shows citation, hides title and body, shows Title 힌트 button', () => {
		render(ReviewCard, { props: baseProps });
		expect(screen.getByText('고후 5:17')).toBeInTheDocument();
		expect(screen.queryByText('중심되신 그리스도')).toBeNull();
		expect(screen.queryByText(/그런즉 누구든지/)).toBeNull();
		expect(screen.getByRole('button', { name: 'Title 힌트 보기' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /구절 보기/ })).toBeInTheDocument();
	});

	it('Stage 1: Title 힌트 button reveals title in place', async () => {
		render(ReviewCard, { props: baseProps });
		await fireEvent.click(screen.getByRole('button', { name: 'Title 힌트 보기' }));
		expect(screen.getByText('중심되신 그리스도')).toBeInTheDocument();
	});

	it('Stage 1 → Stage 2 on 구절 보기 tap; shows first clause + rating buttons', async () => {
		render(ReviewCard, { props: baseProps });
		await fireEvent.click(screen.getByRole('button', { name: /구절 보기/ }));
		// First clause (5 words: ceil(15/3)=5)
		expect(screen.getByText('그런즉 누구든지 그리스도 안에 있으면')).toBeInTheDocument();
		// Rating buttons present
		expect(screen.getByRole('button', { name: '다시' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '쉬움' })).toBeInTheDocument();
	});

	it('Stage 2 cite rating: emits onCiteRated with score and advances to Stage 3', async () => {
		const onCiteRated = vi.fn();
		render(ReviewCard, { props: { ...baseProps, onCiteRated } });
		await fireEvent.click(screen.getByRole('button', { name: /구절 보기/ }));
		await fireEvent.click(screen.getByRole('button', { name: '좋음' }));
		expect(onCiteRated).toHaveBeenCalledWith(3);
		// Stage 3: full text visible
		expect(screen.getByText(verse.w)).toBeInTheDocument();
		// Rating row still present for recall axis
		expect(screen.getByRole('button', { name: '쉬움' })).toBeInTheDocument();
	});

	it('Stage 3 recall rating: emits onRecallRated with score', async () => {
		const onRecallRated = vi.fn();
		render(ReviewCard, { props: { ...baseProps, onRecallRated } });
		// advance through Stage 1 → 2 → 3
		await fireEvent.click(screen.getByRole('button', { name: /구절 보기/ }));
		await fireEvent.click(screen.getByRole('button', { name: '좋음' })); // cite
		await fireEvent.click(screen.getByRole('button', { name: '쉬움' })); // recall
		expect(onRecallRated).toHaveBeenCalledWith(4);
	});
});
