import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import ColumnMapper from '../../src/lib/components/oyo/ColumnMapper.svelte';

function base(overrides: Record<string, unknown> = {}) {
	return {
		labels: ['장절', '제목', '본문'],
		mapping: { cite: 0, title: 1, w: 2 },
		hasHeader: true,
		onchange: () => {},
		...overrides
	};
}

describe('ColumnMapper', () => {
	it('labels each option with its spreadsheet column letter', () => {
		render(ColumnMapper, { props: base() });
		expect(screen.getAllByRole('option', { name: 'A · 장절' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('option', { name: 'C · 본문' }).length).toBeGreaterThan(0);
	});

	it('falls back to the bare letter for a column with no label', () => {
		render(ColumnMapper, { props: base({ labels: ['', ''], mapping: { cite: 0, title: null, w: 1 } }) });
		expect(screen.getAllByRole('option', { name: 'B' }).length).toBeGreaterThan(0);
	});

	it('offers 없음 for 제목 and 본문', () => {
		render(ColumnMapper, { props: base() });
		expect(screen.getAllByRole('option', { name: '없음' })).toHaveLength(2);
	});

	it('emits the whole mapping when a column is repicked', async () => {
		const onchange = vi.fn();
		render(ColumnMapper, { props: base({ onchange }) });
		await fireEvent.change(screen.getByLabelText('본문 열'), { target: { value: '1' } });
		expect(onchange).toHaveBeenCalledWith({
			mapping: { cite: 0, title: 1, w: 1 },
			hasHeader: true
		});
	});

	it('emits null when a column is set to 없음', async () => {
		const onchange = vi.fn();
		render(ColumnMapper, { props: base({ onchange }) });
		await fireEvent.change(screen.getByLabelText('제목 열'), { target: { value: '' } });
		expect(onchange).toHaveBeenCalledWith({
			mapping: { cite: 0, title: null, w: 2 },
			hasHeader: true
		});
	});

	it('emits hasHeader when the header checkbox is toggled', async () => {
		const onchange = vi.fn();
		render(ColumnMapper, { props: base({ onchange }) });
		await fireEvent.click(screen.getByLabelText('첫 행은 제목 줄'));
		expect(onchange).toHaveBeenCalledWith({
			mapping: { cite: 0, title: 1, w: 2 },
			hasHeader: false
		});
	});
});
