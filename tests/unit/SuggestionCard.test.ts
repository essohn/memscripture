import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import SuggestionCard from '../../src/lib/components/srs/SuggestionCard.svelte';
import type { StoredVerse } from '../../src/lib/db/local';

const verse: StoredVerse = {
	package_id: 'pkg',
	no: 1,
	i: 1,
	title: '중심되신 그리스도',
	cite: '고후 5:17',
	w: '그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라 이전 것은 지나갔으니 보라 새 것이 되었도다'
};

describe('SuggestionCard', () => {
	it('shows citation, title, and first-clause preview', () => {
		render(SuggestionCard, { props: { verse, oncommit: () => {}, onskip: () => {} } });
		expect(screen.getByText('고후 5:17')).toBeInTheDocument();
		expect(screen.getByText('중심되신 그리스도')).toBeInTheDocument();
		expect(screen.getByText(/그런즉 누구든지 그리스도 안에 있으면/)).toBeInTheDocument();
	});

	it('renders 암송 시작 and Skip buttons', () => {
		render(SuggestionCard, { props: { verse, oncommit: () => {}, onskip: () => {} } });
		expect(screen.getByRole('button', { name: '암송 시작' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
	});

	it('암송 시작 tap emits oncommit', async () => {
		const oncommit = vi.fn();
		render(SuggestionCard, { props: { verse, oncommit, onskip: () => {} } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		expect(oncommit).toHaveBeenCalledOnce();
	});

	it('Skip tap emits onskip', async () => {
		const onskip = vi.fn();
		render(SuggestionCard, { props: { verse, oncommit: () => {}, onskip } });
		await fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
		expect(onskip).toHaveBeenCalledOnce();
	});
});
