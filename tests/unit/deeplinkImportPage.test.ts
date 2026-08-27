// First line, per the repo's convention: the page mounts Header, which reaches
// db/viewOptions and opens Dexie.
import 'fake-indexeddb/auto';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DeeplinkImportPage from '../../src/routes/oyo/import/+page.svelte';
import { buildImportLink } from '../../src/lib/oyo/importLink';

const created: { cite: string; title: string; w: string }[] = [];
const deleted: number[] = [];

vi.mock('../../src/lib/db/oyo', () => ({
	OYO_PACKAGE_ID: 'oyo',
	seedOyoPackageIfMissing: vi.fn(async () => {}),
	listOyoVerses: vi.fn(async () => []),
	createOyoVerse: vi.fn(async (input: { cite: string; title: string; w: string }) => {
		created.push(input);
		return { package_id: 'oyo', no: created.length, i: created.length, ...input };
	}),
	deleteOyoVerse: vi.fn(async (no: number) => {
		deleted.push(no);
		return { package_id: 'oyo', no, i: no, cite: '', title: '', w: '' };
	})
}));

/** Puts a real import link's fragment on the location, the way the reader
 *  arrives — built through buildImportLink so the test rides the same encoding
 *  the protocol documents rather than a hand-rolled copy of it. */
function arriveWith(verses: { cite: string; w: string; title?: string }[]) {
	const link = buildImportLink('https://mem.lifescripture.org', {
		source: 'bible.lifescripture.org',
		verses: verses.map((v) => ({ cite: v.cite, w: v.w, title: v.title ?? null }))
	});
	location.hash = link.slice(link.indexOf('#'));
}

beforeEach(() => {
	created.length = 0;
	deleted.length = 0;
	location.hash = '';
});

describe('deeplink import screen', () => {
	it('reviews the verses the link carried', async () => {
		arriveWith([
			{ cite: '요 3:16', w: '하나님이 세상을 이처럼 사랑하사', title: '영생' },
			{ cite: '창 12:1', w: '여호와께서 아브람에게 이르시되' }
		]);
		render(DeeplinkImportPage);
		expect(await screen.findByText('구절 2개')).toBeInTheDocument();
		expect(screen.getByText('요한복음 3 : 16')).toBeInTheDocument();
		expect(screen.getByText('bible.lifescripture.org에서 보냈습니다')).toBeInTheDocument();
	});

	it('saves the chosen verses', async () => {
		arriveWith([{ cite: '요 3:16', w: '하나님이 세상을 이처럼 사랑하사', title: '영생' }]);
		render(DeeplinkImportPage);
		await fireEvent.click(await screen.findByRole('button', { name: /나의 구절에 담기/ }));
		expect(await screen.findByText('1개 구절을 나의 구절에 담았습니다')).toBeInTheDocument();
		expect(created).toEqual([
			{ cite: '요한복음 3 : 16', title: '영생', w: '하나님이 세상을 이처럼 사랑하사' }
		]);
	});

	it('되돌리기 removes exactly the verses this import created', async () => {
		arriveWith([
			{ cite: '요 3:16', w: '하나님이 세상을 이처럼 사랑하사' },
			{ cite: '창 12:1', w: '여호와께서 아브람에게 이르시되' }
		]);
		render(DeeplinkImportPage);
		await fireEvent.click(await screen.findByRole('button', { name: /나의 구절에 담기/ }));
		await screen.findByText('2개 구절을 나의 구절에 담았습니다');

		await fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
		await fireEvent.click(await screen.findByRole('button', { name: '지우기' }));

		expect(await screen.findByText('2개를 되돌렸습니다')).toBeInTheDocument();
		expect(deleted).toEqual([1, 2]);
	});

	it('keeps the verses when the reader cancels the confirm', async () => {
		arriveWith([{ cite: '요 3:16', w: '하나님이 세상을 이처럼 사랑하사' }]);
		render(DeeplinkImportPage);
		await fireEvent.click(await screen.findByRole('button', { name: /나의 구절에 담기/ }));
		await screen.findByText('1개 구절을 나의 구절에 담았습니다');

		await fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
		await fireEvent.click(await screen.findByRole('button', { name: '취소' }));

		expect(deleted).toEqual([]);
		expect(screen.getByText('1개 구절을 나의 구절에 담았습니다')).toBeInTheDocument();
	});
});
