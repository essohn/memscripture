// First line, per the repo's convention: the page mounts Header, which reaches
// db/viewOptions and opens Dexie.
import 'fake-indexeddb/auto';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

/**
 * iOS gives every home-screen web app its own storage container, so an import
 * link followed anywhere else saves into a database the installed copy cannot
 * read. These tests cover the two halves of the way around it: the screen says
 * so and hands over the link, and it accepts that link back as a paste.
 */
describe('the way across storage containers', () => {
	const realUserAgent = Object.getOwnPropertyDescriptor(
		Object.getPrototypeOf(navigator),
		'userAgent'
	);

	function pretendIPhoneBrowser() {
		Object.defineProperty(navigator, 'userAgent', {
			configurable: true,
			value:
				'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
		});
		Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
	}

	afterEach(() => {
		delete (navigator as unknown as Record<string, unknown>).userAgent;
		delete (navigator as unknown as Record<string, unknown>).maxTouchPoints;
		if (realUserAgent) {
			Object.defineProperty(Object.getPrototypeOf(navigator), 'userAgent', realUserAgent);
		}
	});

	it('warns an iPhone reader that a save here will not reach their installed app', async () => {
		pretendIPhoneBrowser();
		arriveWith([{ cite: '요 3:16', w: '하나님이 세상을 이처럼 사랑하사' }]);
		render(DeeplinkImportPage);
		expect(await screen.findByText('홈 화면 앱에는 담기지 않습니다')).toBeInTheDocument();
	});

	// The banner is a warning, not a gate: the app cannot see whether a
	// home-screen copy exists, and a reader without one is saving in the right
	// place already.
	it('still lets the iPhone reader save', async () => {
		pretendIPhoneBrowser();
		arriveWith([{ cite: '요 3:16', w: '하나님이 세상을 이처럼 사랑하사' }]);
		render(DeeplinkImportPage);
		await fireEvent.click(await screen.findByRole('button', { name: /나의 구절에 담기/ }));
		expect(await screen.findByText('1개 구절을 나의 구절에 담았습니다')).toBeInTheDocument();
		expect(created).toHaveLength(1);
	});

	it('says nothing on a platform whose tabs and installed app share storage', async () => {
		arriveWith([{ cite: '요 3:16', w: '하나님이 세상을 이처럼 사랑하사' }]);
		render(DeeplinkImportPage);
		expect(await screen.findByText('구절 1개')).toBeInTheDocument();
		expect(screen.queryByText('홈 화면 앱에는 담기지 않습니다')).toBeNull();
	});

	it('hands the reader the link that carried the verses', async () => {
		pretendIPhoneBrowser();
		const written: string[] = [];
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: async (t: string) => void written.push(t) }
		});
		arriveWith([{ cite: '요 3:16', w: '하나님이 세상을 이처럼 사랑하사' }]);
		render(DeeplinkImportPage);
		await fireEvent.click(await screen.findByRole('button', { name: '링크 복사' }));
		expect(await screen.findByRole('button', { name: '복사됨' })).toBeInTheDocument();
		expect(written).toHaveLength(1);
		expect(written[0]).toContain('#v=');
	});

	it('offers a paste box instead of an error when the address carries no payload', async () => {
		render(DeeplinkImportPage);
		expect(await screen.findByRole('button', { name: /링크에서 가져오기/ })).toBeInTheDocument();
	});

	it('imports the whole link the reader pasted', async () => {
		const link = buildImportLink('https://mem.lifescripture.org', {
			source: 'bible.lifescripture.org',
			verses: [{ cite: '창 12:1', w: '여호와께서 아브람에게 이르시되', title: null }]
		});
		render(DeeplinkImportPage);
		const box = await screen.findByPlaceholderText(/oyo\/import/);
		await fireEvent.input(box, { target: { value: link } });
		await fireEvent.click(screen.getByRole('button', { name: /링크에서 가져오기/ }));
		expect(await screen.findByText('구절 1개')).toBeInTheDocument();
		expect(screen.getByText('창세기 12 : 1')).toBeInTheDocument();
	});

	it('explains a paste that is not an import link', async () => {
		render(DeeplinkImportPage);
		const box = await screen.findByPlaceholderText(/oyo\/import/);
		await fireEvent.input(box, { target: { value: 'https://bible.lifescripture.org/bible/krv/john/3' } });
		await fireEvent.click(screen.getByRole('button', { name: /링크에서 가져오기/ }));
		expect(await screen.findByText(/가져오기 링크가 아닙니다/)).toBeInTheDocument();
	});
});
