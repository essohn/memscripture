import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import VerseEditSheet from '../../src/lib/components/oyo/VerseEditSheet.svelte';

describe('VerseEditSheet', () => {
	it('renders empty fields in create mode', () => {
		render(VerseEditSheet, {
			props: { mode: 'create', onSubmit: () => {}, onClose: () => {} }
		});
		expect(screen.getByLabelText('인용')).toHaveValue('');
		expect(screen.getByLabelText('제목 (선택)')).toHaveValue('');
		expect(screen.getByLabelText('본문')).toHaveValue('');
	});

	it('prefills fields in edit mode', () => {
		render(VerseEditSheet, {
			props: {
				mode: 'edit',
				initial: { cite: '시편 23:1', title: '목자', w: '주는 나의 목자' },
				onSubmit: () => {},
				onClose: () => {}
			}
		});
		expect(screen.getByLabelText('인용')).toHaveValue('시편 23:1');
		expect(screen.getByLabelText('제목 (선택)')).toHaveValue('목자');
		expect(screen.getByLabelText('본문')).toHaveValue('주는 나의 목자');
	});

	it('save button is disabled until cite and body are filled', async () => {
		render(VerseEditSheet, {
			props: { mode: 'create', onSubmit: () => {}, onClose: () => {} }
		});
		const save = screen.getByRole('button', { name: '저장' });
		expect(save).toBeDisabled();

		await fireEvent.input(screen.getByLabelText('인용'), { target: { value: '요 3:16' } });
		expect(save).toBeDisabled();

		await fireEvent.input(screen.getByLabelText('본문'), { target: { value: '하나님이' } });
		expect(save).toBeEnabled();
	});

	it('save submits the trimmed payload and closes', async () => {
		const onSubmit = vi.fn();
		const onClose = vi.fn();
		render(VerseEditSheet, { props: { mode: 'create', onSubmit, onClose } });

		await fireEvent.input(screen.getByLabelText('인용'), { target: { value: '  요 3:16  ' } });
		await fireEvent.input(screen.getByLabelText('제목 (선택)'), { target: { value: '' } });
		await fireEvent.input(screen.getByLabelText('본문'), { target: { value: '하나님이 …' } });
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));

		expect(onSubmit).toHaveBeenCalledWith({ cite: '요 3:16', title: '', w: '하나님이 …' });
		expect(onClose).toHaveBeenCalled();
	});

	it('cancel closes without submitting', async () => {
		const onSubmit = vi.fn();
		const onClose = vi.fn();
		render(VerseEditSheet, { props: { mode: 'create', onSubmit, onClose } });
		await fireEvent.click(screen.getByRole('button', { name: '취소' }));
		expect(onSubmit).not.toHaveBeenCalled();
		expect(onClose).toHaveBeenCalled();
	});

	it('backdrop click closes without submitting', async () => {
		const onSubmit = vi.fn();
		const onClose = vi.fn();
		render(VerseEditSheet, { props: { mode: 'create', onSubmit, onClose } });
		const backdrop = document.querySelector('[role="presentation"]') as HTMLElement;
		await fireEvent.click(backdrop);
		expect(onSubmit).not.toHaveBeenCalled();
		expect(onClose).toHaveBeenCalled();
	});

	it('Escape key closes the sheet', async () => {
		const onClose = vi.fn();
		render(VerseEditSheet, { props: { mode: 'create', onSubmit: () => {}, onClose } });
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onClose).toHaveBeenCalled();
	});
});
