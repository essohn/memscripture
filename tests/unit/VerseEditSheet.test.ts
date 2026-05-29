import { render, screen, fireEvent } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VerseEditSheet from '../../src/lib/components/oyo/VerseEditSheet.svelte';
import {
	__clearChapterCacheForTest,
	__setChapterCacheForTest
} from '../../src/lib/bible/fetch';

describe('VerseEditSheet', () => {
	beforeEach(() => {
		__clearChapterCacheForTest();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('renders empty fields in create mode', () => {
		render(VerseEditSheet, {
			props: { mode: 'create', onSubmit: () => {}, onClose: () => {} }
		});
		expect(screen.getByLabelText('장절')).toHaveValue('');
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
		expect(screen.getByLabelText('장절')).toHaveValue('시편 23:1');
		expect(screen.getByLabelText('제목 (선택)')).toHaveValue('목자');
		expect(screen.getByLabelText('본문')).toHaveValue('주는 나의 목자');
	});

	it('save button is disabled until cite and body are filled', async () => {
		render(VerseEditSheet, {
			props: { mode: 'create', onSubmit: () => {}, onClose: () => {} }
		});
		const save = screen.getByRole('button', { name: '저장' });
		expect(save).toBeDisabled();

		await fireEvent.input(screen.getByLabelText('장절'), { target: { value: '요 3:16' } });
		expect(save).toBeDisabled();

		await fireEvent.input(screen.getByLabelText('본문'), { target: { value: '하나님이' } });
		expect(save).toBeEnabled();
	});

	it('save submits the trimmed payload and closes', async () => {
		const onSubmit = vi.fn();
		const onClose = vi.fn();
		render(VerseEditSheet, { props: { mode: 'create', onSubmit, onClose } });

		await fireEvent.input(screen.getByLabelText('장절'), { target: { value: '  요 3:16  ' } });
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

	it('on blur, normalizes the 장절 to the standard form and autofills 본문', async () => {
		__setChapterCacheForTest(43, 3, [
			{ verse: 14, text: '본문 14' },
			{ verse: 15, text: '본문 15' },
			{ verse: 16, text: '하나님이 세상을 이처럼 사랑하사' }
		]);
		render(VerseEditSheet, {
			props: { mode: 'create', onSubmit: () => {}, onClose: () => {} }
		});
		const cite = screen.getByLabelText('장절') as HTMLInputElement;
		const body = screen.getByLabelText('본문') as HTMLTextAreaElement;

		await fireEvent.input(cite, { target: { value: '요3:16' } });
		await fireEvent.blur(cite);
		// Let the awaited fetch promise resolve
		await Promise.resolve();
		await Promise.resolve();

		expect(cite).toHaveValue('요한복음 3 : 16');
		expect(body).toHaveValue('하나님이 세상을 이처럼 사랑하사');
	});

	it('on blur, leaves cite untouched and does not autofill when the book is unknown', async () => {
		render(VerseEditSheet, {
			props: { mode: 'create', onSubmit: () => {}, onClose: () => {} }
		});
		const cite = screen.getByLabelText('장절') as HTMLInputElement;
		const body = screen.getByLabelText('본문') as HTMLTextAreaElement;

		await fireEvent.input(cite, { target: { value: '알수없음 3:16' } });
		await fireEvent.blur(cite);

		expect(cite).toHaveValue('알수없음 3:16');
		expect(body).toHaveValue('');
	});

	it('on blur, normalizes but does NOT overwrite a non-empty 본문', async () => {
		__setChapterCacheForTest(43, 3, [
			{ verse: 16, text: 'KRV 자동 채움' }
		]);
		render(VerseEditSheet, {
			props: { mode: 'create', onSubmit: () => {}, onClose: () => {} }
		});
		const cite = screen.getByLabelText('장절') as HTMLInputElement;
		const body = screen.getByLabelText('본문') as HTMLTextAreaElement;

		await fireEvent.input(body, { target: { value: '사용자가 직접 적은 내용' } });
		await fireEvent.input(cite, { target: { value: '요3:16' } });
		await fireEvent.blur(cite);
		await Promise.resolve();
		await Promise.resolve();

		expect(cite).toHaveValue('요한복음 3 : 16');
		expect(body).toHaveValue('사용자가 직접 적은 내용');
	});

	it('on blur, re-fetches and overwrites the body when the cite changes after an earlier autofill', async () => {
		__setChapterCacheForTest(43, 3, [{ verse: 16, text: '요한복음 본문' }]);
		__setChapterCacheForTest(19, 23, [{ verse: 1, text: '시편 본문' }]);
		render(VerseEditSheet, {
			props: { mode: 'create', onSubmit: () => {}, onClose: () => {} }
		});
		const cite = screen.getByLabelText('장절') as HTMLInputElement;
		const body = screen.getByLabelText('본문') as HTMLTextAreaElement;

		// First autofill — body picks up 요한복음
		await fireEvent.input(cite, { target: { value: '요3:16' } });
		await fireEvent.blur(cite);
		await Promise.resolve();
		await Promise.resolve();
		expect(body).toHaveValue('요한복음 본문');

		// Edit cite — body should follow the new reference
		await fireEvent.input(cite, { target: { value: '시23:1' } });
		await fireEvent.blur(cite);
		await Promise.resolve();
		await Promise.resolve();
		expect(cite).toHaveValue('시편 23 : 1');
		expect(body).toHaveValue('시편 본문');
	});

	it('on re-blur with the same normalized cite, does not re-fetch', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => [{ verse: 16, text: '단 한 번' }]
		});
		vi.stubGlobal('fetch', fetchMock);

		render(VerseEditSheet, {
			props: { mode: 'create', onSubmit: () => {}, onClose: () => {} }
		});
		const cite = screen.getByLabelText('장절') as HTMLInputElement;

		await fireEvent.input(cite, { target: { value: '요3:16' } });
		await fireEvent.blur(cite);
		await Promise.resolve();
		await Promise.resolve();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		// Re-blur with the same value — already normalized, no new fetch.
		await fireEvent.blur(cite);
		await Promise.resolve();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
