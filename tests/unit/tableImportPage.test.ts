// First line, per the repo's convention: the page mounts Header, which reaches
// db/viewOptions and opens Dexie.
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TableImportPage from '../../src/routes/oyo/import/table/+page.svelte';
import { __clearChapterCacheForTest } from '../../src/lib/bible/fetch';

const created: { cite: string; title: string; w: string }[] = [];
const deleted: number[] = [];
let failAfter = Infinity;
let failDeleteAfter = Infinity;

vi.mock('../../src/lib/db/oyo', () => ({
	OYO_PACKAGE_ID: 'oyo',
	seedOyoPackageIfMissing: vi.fn(async () => {}),
	listOyoVerses: vi.fn(async () => []),
	createOyoVerse: vi.fn(async (input: { cite: string; title: string; w: string }) => {
		if (created.length >= failAfter) throw new Error('write failed');
		created.push(input);
		return { package_id: 'oyo', no: created.length, i: created.length, ...input };
	}),
	deleteOyoVerse: vi.fn(async (no: number) => {
		if (deleted.length >= failDeleteAfter) throw new Error('delete failed');
		deleted.push(no);
		return { package_id: 'oyo', no, i: no, cite: '', title: '', w: '' };
	})
}));

function stubFetch() {
	const spy = vi.fn(async () => {
		const verses = Array.from({ length: 40 }, (_, i) => ({ verse: i + 1, text: `절 ${i + 1}` }));
		return { ok: true, json: async () => verses } as unknown as Response;
	});
	vi.stubGlobal('fetch', spy);
	return spy;
}

/** Types a table into the paste box and reads it. */
async function paste(text: string) {
	await fireEvent.input(screen.getByLabelText('표 붙여넣기'), { target: { value: text } });
	await fireEvent.click(screen.getByRole('button', { name: '표 읽기' }));
}

beforeEach(() => {
	created.length = 0;
	deleted.length = 0;
	failAfter = Infinity;
	failDeleteAfter = Infinity;
	__clearChapterCacheForTest();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('table import screen', () => {
	it('shows the confirm step after reading a pasted table', async () => {
		stubFetch();
		render(TableImportPage);
		await paste('장절\t제목\n요 3:16\t영생');
		expect(await screen.findByText('이렇게 읽었습니다. 맞나요?')).toBeInTheDocument();
		expect(screen.getByLabelText('장절 열')).toBeInTheDocument();
	});

	it('makes no request while the reader is still choosing columns', async () => {
		const spy = stubFetch();
		render(TableImportPage);
		await paste('장절\t제목\n요 3:16\t영생');
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		await fireEvent.change(screen.getByLabelText('본문 열'), { target: { value: '1' } });
		await fireEvent.change(screen.getByLabelText('제목 열'), { target: { value: '' } });
		expect(spy).not.toHaveBeenCalled();
	});

	it('repaints the summary when a column is repicked', async () => {
		stubFetch();
		render(TableImportPage);
		await paste(
			'요 3:16\t하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니\n창 12:1\t여호와께서 아브람에게 이르시되 너는 너의 본토를 떠나'
		);
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		// The long second column was read as the body, so nothing needs fetching.
		expect(screen.getByText('구절 2개')).toBeInTheDocument();
		// Say it is not the body, and both rows now need one.
		await fireEvent.change(screen.getByLabelText('본문 열'), { target: { value: '' } });
		expect(
			await screen.findByText('구절 2개 · 본문 없는 2개는 성경에서 가져옵니다')
		).toBeInTheDocument();
	});

	it('disables 계속 when the mapping yields no rows', async () => {
		stubFetch();
		render(TableImportPage);
		await paste('요 3:16\t\n창 12:1\t');
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		await fireEvent.change(screen.getByLabelText('장절 열'), { target: { value: '1' } });
		await waitFor(() =>
			expect(screen.getByRole('button', { name: '맞아요, 계속' })).toBeDisabled()
		);
		expect(screen.getByText('이 설정으로는 가져올 구절이 없습니다')).toBeInTheDocument();
	});

	it('starts fetching bodies only once the columns are confirmed', async () => {
		const spy = stubFetch();
		render(TableImportPage);
		await paste('장절\n요 3:16');
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		expect(spy).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: '맞아요, 계속' }));
		await waitFor(() => expect(spy).toHaveBeenCalled());
		expect(await screen.findByText('절 16')).toBeInTheDocument();
	});

	it('refuses an .xlsx with a message that names the way out', async () => {
		stubFetch();
		render(TableImportPage);
		const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'verses.xlsx');
		await fireEvent.change(screen.getByLabelText('CSV 파일 선택'), { target: { files: [file] } });
		expect(
			await screen.findByText(/엑셀 파일은 아직 직접 읽지 못합니다/)
		).toBeInTheDocument();
	});

	it('goes back from review to the confirm step', async () => {
		stubFetch();
		render(TableImportPage);
		await paste('장절\t본문\n요 3:16\t하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니');
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		await fireEvent.click(screen.getByRole('button', { name: '맞아요, 계속' }));
		await screen.findByRole('button', { name: /나의 구절에 담기/ });
		await fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
		expect(await screen.findByText('이렇게 읽었습니다. 맞나요?')).toBeInTheDocument();
	});

	it('saves the chosen rows and says how many landed', async () => {
		stubFetch();
		render(TableImportPage);
		await paste('장절\t제목\t본문\n요 3:16\t영생\t하나님이 세상을 이처럼 사랑하사 독생자를');
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		await fireEvent.click(screen.getByRole('button', { name: '맞아요, 계속' }));
		await fireEvent.click(await screen.findByRole('button', { name: /나의 구절에 담기/ }));
		expect(await screen.findByText('1개 구절을 나의 구절에 담았습니다')).toBeInTheDocument();
		expect(created).toEqual([
			{ cite: '요한복음 3 : 16', title: '영생', w: '하나님이 세상을 이처럼 사랑하사 독생자를' }
		]);
	});

	it('says when it kept only the first 200 rows', async () => {
		stubFetch();
		render(TableImportPage);
		const rows = Array.from({ length: 205 }, (_, i) => `요 3:${(i % 30) + 1}\t본문 ${i}`);
		await paste(`장절\t본문\n${rows.join('\n')}`);
		expect(await screen.findByText(/앞 200개만 가져옵니다/)).toBeInTheDocument();
	});

	it('does not rewrite verses that already landed when a save is retried', async () => {
		stubFetch();
		render(TableImportPage);
		await paste('장절\t제목\t본문\n요 3:16\t영생\t본문 하나\n창 12:1\t부르심\t본문 둘\n시 23:1\t목자\t본문 셋');
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		await fireEvent.click(screen.getByRole('button', { name: '맞아요, 계속' }));
		// The third write fails; the first two are already in the database.
		failAfter = 2;
		await fireEvent.click(await screen.findByRole('button', { name: /나의 구절에 담기/ }));
		await screen.findByText('구절을 저장하지 못했습니다. 다시 시도해주세요.');
		expect(created).toHaveLength(2);
		// The reader does what the message says. Only the row that never landed
		// may be written.
		failAfter = Infinity;
		await fireEvent.click(screen.getByRole('button', { name: /나의 구절에 담기/ }));
		await screen.findByText('1개 구절을 나의 구절에 담았습니다');
		expect(created).toHaveLength(3);
		expect(created.map((c) => c.cite)).toEqual([
			'요한복음 3 : 16',
			'창세기 12 : 1',
			'시편 23 : 1'
		]);
	});

	it('puts a row 다시 시도 rescued back in the save set', async () => {
		let failing = true;
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				if (failing) return { ok: false, status: 500 } as unknown as Response;
				const verses = Array.from({ length: 40 }, (_, i) => ({
					verse: i + 1,
					text: `절 ${i + 1}`
				}));
				return { ok: true, json: async () => verses } as unknown as Response;
			})
		);
		render(TableImportPage);
		await paste('장절\n요 3:16');
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		await fireEvent.click(screen.getByRole('button', { name: '맞아요, 계속' }));
		// The fetch failed, so the row left the save set and the button is dead.
		expect(await screen.findByText('본문 없음 · 건너뜁니다')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /나의 구절에 담기 \(0\)/ })).toBeDisabled();
		// The network comes back and the reader retries.
		failing = false;
		await fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
		await waitFor(() =>
			expect(screen.getByRole('button', { name: /나의 구절에 담기 \(1\)/ })).toBeEnabled()
		);
	});

	it('되돌리기 removes exactly the verses this import created', async () => {
		stubFetch();
		render(TableImportPage);
		await paste('장절\t제목\t본문\n요 3:16\t영생\t본문 하나\n창 12:1\t부르심\t본문 둘');
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		await fireEvent.click(screen.getByRole('button', { name: '맞아요, 계속' }));
		await fireEvent.click(await screen.findByRole('button', { name: /나의 구절에 담기/ }));
		await screen.findByText('2개 구절을 나의 구절에 담았습니다');

		await fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
		await fireEvent.click(await screen.findByRole('button', { name: '지우기' }));

		expect(await screen.findByText('2개를 되돌렸습니다')).toBeInTheDocument();
		expect(deleted).toEqual([1, 2]);
	});

	it('reports how many it really took back when a delete fails partway', async () => {
		stubFetch();
		render(TableImportPage);
		await paste('장절\t제목\t본문\n요 3:16\t영생\t본문 하나\n창 12:1\t부르심\t본문 둘\n시 23:1\t목자\t본문 셋');
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		await fireEvent.click(screen.getByRole('button', { name: '맞아요, 계속' }));
		await fireEvent.click(await screen.findByRole('button', { name: /나의 구절에 담기/ }));
		await screen.findByText('3개 구절을 나의 구절에 담았습니다');

		// The third delete throws; two verses are already gone.
		failDeleteAfter = 2;
		await fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
		await fireEvent.click(await screen.findByRole('button', { name: '지우기' }));

		expect(await screen.findByText('2개를 되돌렸습니다')).toBeInTheDocument();
		expect(
			screen.getByText('1개는 지우지 못했습니다. 나의 구절에서 확인해주세요.')
		).toBeInTheDocument();
	});

	it('keeps the verses when the reader cancels the confirm', async () => {
		stubFetch();
		render(TableImportPage);
		await paste('장절\t제목\t본문\n요 3:16\t영생\t본문 하나');
		await screen.findByText('이렇게 읽었습니다. 맞나요?');
		await fireEvent.click(screen.getByRole('button', { name: '맞아요, 계속' }));
		await fireEvent.click(await screen.findByRole('button', { name: /나의 구절에 담기/ }));
		await screen.findByText('1개 구절을 나의 구절에 담았습니다');

		await fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
		await fireEvent.click(await screen.findByRole('button', { name: '취소' }));

		expect(deleted).toEqual([]);
		expect(screen.getByText('1개 구절을 나의 구절에 담았습니다')).toBeInTheDocument();
	});
});
