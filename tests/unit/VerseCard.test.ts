import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import VerseCard from '../../src/lib/components/card/VerseCard.svelte';
import type { StoredVerse } from '../../src/lib/db/local';

// 4-chunk verse: ["a다", "b라", "c고", "d라"]
const verse: StoredVerse = {
	package_id: 'p',
	no: 1,
	i: 1,
	title: '제목',
	cite: '잠언 3:5-6',
	w: 'a다 b라 c고 d라'
};

const shortVerse: StoredVerse = {
	...verse,
	w: '짧은 한 문장'
};

describe('VerseCard memorize mode', () => {
	it('starts in read mode showing full body and 암송 시작 button', () => {
		render(VerseCard, { props: { verse } });
		expect(screen.getByText('a다 b라 c고 d라')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '암송 시작' })).toBeInTheDocument();
	});

	it('암송 시작 hides the body and shows the cue', async () => {
		render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		expect(screen.queryByText('a다 b라 c고 d라')).toBeNull();
		expect(screen.getByText(/구절을 떠올려보세요/)).toBeInTheDocument();
	});

	it('tapping the cue reveals chunks one by one', async () => {
		render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));

		await fireEvent.click(screen.getByRole('button', { name: /구절을 떠올려보세요/ }));
		expect(screen.getByText('a다')).toBeInTheDocument();
		expect(screen.queryByText('b라')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: /다음 부분 보기/ }));
		expect(screen.getByText('b라')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: /다음 부분 보기/ }));
		expect(screen.getByText('c고')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: /다음 부분 보기/ }));
		expect(screen.getByText('d라')).toBeInTheDocument();

		// All revealed: no more cue
		expect(screen.queryByRole('button', { name: /다음 부분 보기/ })).toBeNull();
	});

	it('전체 보기 reveals all chunks at once and removes itself', async () => {
		render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		await fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));

		expect(screen.getByText('a다')).toBeInTheDocument();
		expect(screen.getByText('b라')).toBeInTheDocument();
		expect(screen.getByText('c고')).toBeInTheDocument();
		expect(screen.getByText('d라')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: '전체 보기' })).toBeNull();
		expect(screen.queryByRole('button', { name: /구절을 떠올려보세요/ })).toBeNull();
	});

	it('처음부터 다시 resets revealed count and brings the cue back', async () => {
		render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		await fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
		await fireEvent.click(screen.getByRole('button', { name: '처음부터 다시' }));

		expect(screen.queryByText('a다')).toBeNull();
		expect(screen.getByText(/구절을 떠올려보세요/)).toBeInTheDocument();
	});

	it('암송 종료 returns to read mode with full body visible', async () => {
		render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		await fireEvent.click(screen.getByRole('button', { name: '암송 종료' }));

		expect(screen.getByText('a다 b라 c고 d라')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '암송 시작' })).toBeInTheDocument();
	});

	it('single-chunk verse skips cue: enters memorize mode with text already revealed', async () => {
		render(VerseCard, { props: { verse: shortVerse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));

		// Body shown as a single chunk paragraph
		expect(screen.getByText('짧은 한 문장')).toBeInTheDocument();
		// No cue button
		expect(screen.queryByRole('button', { name: /구절을 떠올려보세요/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /다음 부분 보기/ })).toBeNull();
		// 전체 보기 hidden because all already revealed
		expect(screen.queryByRole('button', { name: '전체 보기' })).toBeNull();
		// Other controls still present
		expect(screen.getByRole('button', { name: '처음부터 다시' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '암송 종료' })).toBeInTheDocument();
	});
});
