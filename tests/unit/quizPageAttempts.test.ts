// First line, per the repo's convention: this page reaches db/checkHistory
// and the header's verseVisibility/fontScale state, which open Dexie.
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import QuizPage from '../../src/routes/quiz/+page.svelte';
import { db } from '../../src/lib/db/local';
import { listChecks } from '../../src/lib/db/checkHistory';
import type { Target } from '../../src/lib/quiz/scope';
import type { QuizItem } from '../../src/lib/quiz/session';

const target: Target = { kind: 'package', id: 'a_krv', label: 'A구절' };

function item(packageId: string, verseNo: number, w: string): QuizItem {
	return {
		id: `${packageId}:${verseNo}`,
		packageId,
		verseNo,
		title: `제목 ${verseNo}`,
		cite: `창세기 1 : ${verseNo}`,
		w
	};
}

const verse = item('a_krv', 1, '또 증거는 이것이니 하나님이 우리에게 영생을 주신 것이라');

// vi.hoisted: the mock factory below runs before this file's own top-level
// code, so the fn it references has to exist before that point too.
const { loadAttemptsMock } = vi.hoisted(() => ({ loadAttemptsMock: vi.fn() }));

vi.mock('../../src/lib/quiz/scope', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../src/lib/quiz/scope')>()),
	listTargets: vi.fn(async () => [target]),
	resolveTarget: vi.fn(async () => ({ items: [verse], ratings: new Map() })),
	loadAttempts: loadAttemptsMock
}));

beforeEach(async () => {
	loadAttemptsMock.mockReset();
	await db.delete();
	await db.open();
});

/** Drives the picker to a running 틀린 곳 찾기 round over the one-verse scope
 *  above: waits for the auto-picked target's items to resolve (the 시작
 *  button is disabled until then), chooses the game, then starts. */
async function startSpotRun() {
	render(QuizPage);
	await waitFor(() => expect(screen.getByRole('button', { name: '시작' })).not.toBeDisabled());
	await fireEvent.click(screen.getByRole('button', { name: '틀린 곳 찾기' }));
	await fireEvent.click(screen.getByRole('button', { name: '시작' }));
}

describe('quiz/+page.svelte — 틀린 곳 찾기 attempts', () => {
	// The round used to mount immediately on 시작 and have `shown` swapped
	// underneath it once the attempts read resolved. Now `queue` is not set
	// until the read settles, so the round mounts once, already holding the
	// right text.
	it('shows the recorded attempt once the read resolves, not the intact verse', async () => {
		// mockResolvedValue (not "once"): QuizScopePicker reads loadAttempts
		// itself too, for its "N구절 중 M개…" count, so this run causes two
		// calls — the picker's own, then the page's start().
		loadAttemptsMock.mockResolvedValue(
			new Map([['a_krv:1', '또 증거는 이것이니 하나님이 우리에게 영생은 주신 것이라']])
		);

		await startSpotRun();

		await waitFor(() => expect(screen.getByText('영생은')).toBeInTheDocument());
		expect(screen.queryByText('영생을')).toBeNull();
	});

	// The narrower bug the review flagged: `shown` is a prop, read once at
	// mount, not re-derived per round. Setting `queue` before the read
	// resolved let a round mount against the intact verse and then have its
	// text swapped out from under an answer already in progress. Holding
	// `queue` back until the read settles removes the window entirely — while
	// it is in flight, the reader is still looking at the picker, not a round
	// showing text that might change under them.
	it('does not show a round until the attempts read settles', async () => {
		loadAttemptsMock.mockResolvedValueOnce(new Map()); // the picker's own count read

		let resolveRun: ((m: Map<string, string>) => void) | undefined;
		loadAttemptsMock.mockImplementationOnce(
			() =>
				new Promise<Map<string, string>>((resolve) => {
					resolveRun = resolve;
				})
		);

		render(QuizPage);
		await waitFor(() => expect(screen.getByRole('button', { name: '시작' })).not.toBeDisabled());
		await fireEvent.click(screen.getByRole('button', { name: '틀린 곳 찾기' }));
		await fireEvent.click(screen.getByRole('button', { name: '시작' }));

		// Still pending: no round has mounted, so neither the intact verse nor
		// any other text is on screen — the reader is still on the picker.
		expect(screen.queryByText('영생을')).toBeNull();
		expect(screen.queryByRole('button', { name: '이상 없음' })).toBeNull();
		expect(screen.getByRole('button', { name: '시작' })).toBeInTheDocument();

		resolveRun?.(
			new Map([['a_krv:1', '또 증거는 이것이니 하나님이 우리에게 영생은 주신 것이라']])
		);
		await waitFor(() => expect(screen.getByText('영생은')).toBeInTheDocument());
	});

	// The run-token guard still matters even though rounds no longer mount
	// early: an impatient re-tap of 시작 while the first read is in flight
	// fires a second start() with a fresh runVersion, and the first read's
	// eventual (stale) result must not land on top of what the second,
	// current run already applied.
	it('discards a load that resolves after a later start already applied', async () => {
		loadAttemptsMock.mockResolvedValueOnce(new Map()); // the picker's own count read

		let resolveFirst: ((m: Map<string, string>) => void) | undefined;
		loadAttemptsMock.mockImplementationOnce(
			() =>
				new Promise<Map<string, string>>((resolve) => {
					resolveFirst = resolve;
				})
		); // first start(), held pending

		loadAttemptsMock.mockResolvedValueOnce(
			new Map([['a_krv:1', '또 증거는 이것이니 하나님이 우리에게 영생은 주신 것이라']])
		); // second start(), the re-tap

		render(QuizPage);
		await waitFor(() => expect(screen.getByRole('button', { name: '시작' })).not.toBeDisabled());
		await fireEvent.click(screen.getByRole('button', { name: '틀린 곳 찾기' }));
		const startButton = screen.getByRole('button', { name: '시작' });
		await fireEvent.click(startButton);
		await fireEvent.click(startButton);

		// The second, current run's read resolves and applies.
		await waitFor(() => expect(screen.getByText('영생은')).toBeInTheDocument());

		// The first run's read finally resolves. Its (fake, obviously stale)
		// data must not overwrite what the second, current run already applied.
		resolveFirst?.(new Map([['a_krv:1', '오래된 stale 문장']]));
		await new Promise((r) => setTimeout(r, 0));
		expect(screen.getByText('영생은')).toBeInTheDocument();
		expect(screen.queryByText('오래된')).toBeNull();
	});

	// A rejected read is not swallowed into a run that silently grades the
	// reader on questions never asked. The run still happens — the picker
	// already promised a scope of this size — but it is reported the same
	// way a storage failure is: through the summary's existing `unsaved`
	// counter, not a second reporting idiom.
	it('tells the reader on the summary when the attempts read fails', async () => {
		loadAttemptsMock.mockResolvedValueOnce(new Map()); // the picker's own count read
		loadAttemptsMock.mockRejectedValueOnce(new Error('read failed')); // the page's start()

		await startSpotRun();

		await waitFor(() => expect(screen.getByText('영생을')).toBeInTheDocument());
		await fireEvent.click(screen.getByRole('button', { name: '이상 없음' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));

		await waitFor(() =>
			expect(screen.getByText('1개 라운드는 기록하지 못했습니다')).toBeInTheDocument()
		);
	});
});

// The plan calls this "the one that proves the source widening did what it
// claims" — each game must record its own value, not a shared 'quiz'.
describe('quiz/+page.svelte — source recording', () => {
	it('records source "quiz" for a completed typing round', async () => {
		render(QuizPage);
		await waitFor(() => expect(screen.getByRole('button', { name: '시작' })).not.toBeDisabled());
		await fireEvent.click(screen.getByRole('button', { name: '시작' }));

		await fireEvent.input(screen.getByRole('textbox', { name: '암송 구절 입력' }), {
			target: { value: verse.w }
		});
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));

		await waitFor(async () => {
			const rows = await listChecks('a_krv', 1);
			expect(rows[0]?.source).toBe('quiz');
		});
	});

	it('records source "quiz-opening" for a completed opening round', async () => {
		render(QuizPage);
		await waitFor(() => expect(screen.getByRole('button', { name: '시작' })).not.toBeDisabled());
		await fireEvent.click(screen.getByRole('button', { name: '첫 단어' }));
		await fireEvent.click(screen.getByRole('button', { name: '시작' }));

		await fireEvent.input(screen.getByRole('textbox', { name: '구절 첫머리 입력' }), {
			target: { value: '또 증거는' }
		});
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));

		await waitFor(async () => {
			const rows = await listChecks('a_krv', 1);
			expect(rows[0]?.source).toBe('quiz-opening');
		});
	});

	it('records source "quiz-spot" for a completed spot round', async () => {
		loadAttemptsMock.mockResolvedValue(new Map());

		await startSpotRun();
		await waitFor(() =>
			expect(screen.getByRole('button', { name: '이상 없음' })).toBeInTheDocument()
		);
		await fireEvent.click(screen.getByRole('button', { name: '이상 없음' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));

		await waitFor(async () => {
			const rows = await listChecks('a_krv', 1);
			expect(rows[0]?.source).toBe('quiz-spot');
		});
	});
});
