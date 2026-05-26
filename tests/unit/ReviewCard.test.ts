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
	it('Stage 1: shows citation, hides title and body, shows Title 힌트 + cite rating', () => {
		render(ReviewCard, { props: baseProps });
		expect(screen.getByText('고후 5:17')).toBeInTheDocument();
		expect(screen.queryByText('중심되신 그리스도')).toBeNull();
		expect(screen.queryByText(/그런즉 누구든지/)).toBeNull();
		expect(screen.getByRole('button', { name: 'Title 힌트 보기' })).toBeInTheDocument();
		expect(screen.getByText('시작 부분을 떠올리는데 느꼈던 난이도')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '떠오르지 않음' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '빨리 떠오름' })).toBeInTheDocument();
	});

	it('Stage 1: Title 힌트 button reveals title in place', async () => {
		render(ReviewCard, { props: baseProps });
		await fireEvent.click(screen.getByRole('button', { name: 'Title 힌트 보기' }));
		expect(screen.getByText('중심되신 그리스도')).toBeInTheDocument();
	});

	it('Stage 1 → Stage 2 on cite rating: emits onCiteRated and reveals full verse', async () => {
		const onCiteRated = vi.fn();
		render(ReviewCard, { props: { ...baseProps, onCiteRated } });
		await fireEvent.click(screen.getByRole('button', { name: '적절히 떠오름' }));
		expect(onCiteRated).toHaveBeenCalledWith(3);
		expect(screen.getByText(verse.w)).toBeInTheDocument();
		expect(screen.getByText('암송 구절 전체가 일치했던 정도')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '완벽히 일치함' })).toBeInTheDocument();
	});

	it('Stage 2 recall rating: emits onRecallRated with score', async () => {
		const onRecallRated = vi.fn();
		render(ReviewCard, { props: { ...baseProps, onRecallRated } });
		await fireEvent.click(screen.getByRole('button', { name: '적절히 떠오름' })); // cite
		await fireEvent.click(screen.getByRole('button', { name: '완벽히 일치함' })); // recall
		expect(onRecallRated).toHaveBeenCalledWith(4);
	});
});
