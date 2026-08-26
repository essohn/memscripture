import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import VerseReviewList from '../../src/lib/components/oyo/VerseReviewList.svelte';

const ROWS = [
	{ cite: '요한복음 3 : 16', w: '하나님이 세상을 이처럼 사랑하사' },
	{ cite: '창세기 12 : 1', w: '여호와께서 아브람에게 이르시되' }
];

function base(overrides: Record<string, unknown> = {}) {
	return {
		rows: ROWS,
		titles: ['', ''],
		chosen: new Set([0, 1]),
		duplicates: new Set<number>(),
		...overrides
	};
}

describe('VerseReviewList', () => {
	it('renders a row per verse, with its citation and body', () => {
		render(VerseReviewList, { props: base() });
		expect(screen.getByText('요한복음 3 : 16')).toBeInTheDocument();
		expect(screen.getByText('하나님이 세상을 이처럼 사랑하사')).toBeInTheDocument();
		expect(screen.getByText('창세기 12 : 1')).toBeInTheDocument();
	});

	it('shows a checked state for every chosen row', () => {
		render(VerseReviewList, { props: base() });
		expect(screen.getByRole('button', { name: '요한복음 3 : 16 선택' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
	});

	it('toggles a row off when its check is tapped', async () => {
		render(VerseReviewList, { props: base() });
		const check = screen.getByRole('button', { name: '요한복음 3 : 16 선택' });
		await fireEvent.click(check);
		expect(check).toHaveAttribute('aria-pressed', 'false');
	});

	it('gives each row a title field', () => {
		render(VerseReviewList, { props: base() });
		expect(screen.getByLabelText('요한복음 3 : 16 제목')).toBeInTheDocument();
	});

	it('labels a row the reader already has', () => {
		render(VerseReviewList, { props: base({ duplicates: new Set([1]) }) });
		expect(screen.getByText('이미 있음')).toBeInTheDocument();
	});

	it('says a row is loading instead of showing an empty body', () => {
		render(
			VerseReviewList,
			{
				props: base({
					rows: [{ cite: '요한복음 3 : 16', w: '' }],
					titles: [''],
					chosen: new Set<number>(),
					statuses: ['loading']
				})
			}
		);
		expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
	});

	it('disables the check on a row that has no body', () => {
		render(VerseReviewList, {
			props: base({
				rows: [{ cite: '토비트 3 : 1', w: '' }],
				titles: [''],
				chosen: new Set<number>(),
				statuses: ['no-body']
			})
		});
		expect(screen.getByText('본문 없음 · 건너뜁니다')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '토비트 3 : 1 선택' })).toBeDisabled();
	});

	it('ignores a tap on a row that has no body', async () => {
		render(VerseReviewList, {
			props: base({
				rows: [{ cite: '토비트 3 : 1', w: '' }],
				titles: [''],
				chosen: new Set<number>(),
				statuses: ['no-body']
			})
		});
		const check = screen.getByRole('button', { name: '토비트 3 : 1 선택' });
		await fireEvent.click(check);
		expect(check).toHaveAttribute('aria-pressed', 'false');
	});
});
