// First line, per the repo's convention: this page reaches db/checkHistory
// and the header's verseVisibility/fontScale state, which open Dexie.
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import QuizPage from '../../src/routes/quiz/+page.svelte';
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

beforeEach(() => {
	loadAttemptsMock.mockReset();
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
	// The bug this pins: `queue = picked` assigns a plain array into `$state`,
	// which hands back a reactive proxy. A guard that compares the array
	// captured before the read (`forRun`) against `queue` read back afterward
	// is comparing a plain array to a proxy — never `===` — so it fired on
	// every run and the resolved read was silently dropped. The round always
	// fell back to showing the verse intact, even with a real attempt on file.
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

	// The counter guard exists for this: a run that starts while an earlier
	// run's read is still in flight must not have that earlier read land on
	// top of it once it finally resolves — a plain "always apply the read"
	// fix would pass the test above but reintroduce this.
	//
	// The second start() has to come from a *fresh* pick — closing and
	// reopening the picker rather than 다시 하기 — because 다시 하기 calls
	// start() with the page's own `queue` read back, which is already the
	// proxy `$state` produced the first time. Passing that back in doesn't
	// get re-proxied, so an identity check would happen to pass in that one
	// path and this test would pass against the very bug it's meant to pin.
	// A fresh pick hands start() a plain array from QuizScopePicker's
	// `buildQueue()` again, the same as the real first run and the real bug.
	it('discards a load that resolves after a later, freshly-picked run has already started', async () => {
		// Call #1 is QuizScopePicker's own loadAttempts, fired when the chip
		// below is clicked — irrelevant here, it just needs to resolve.
		loadAttemptsMock.mockResolvedValueOnce(new Map());

		// Call #2 is the page's start() for the first run — held pending.
		let resolveFirst: ((m: Map<string, string>) => void) | undefined;
		loadAttemptsMock.mockImplementationOnce(
			() =>
				new Promise<Map<string, string>>((resolve) => {
					resolveFirst = resolve;
				})
		);

		await startSpotRun();

		// The first run's read is still pending — the round shows the intact
		// verse, which is the right answer for a verse with no known attempt.
		expect(screen.getByText('영생을')).toBeInTheDocument();

		// Finish the one-verse round, close out to the picker (a fresh
		// QuizScopePicker instance), and start a second, independent run.
		await fireEvent.click(screen.getByRole('button', { name: '이상 없음' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		await waitFor(() => expect(screen.getByRole('button', { name: '끝내기' })).toBeInTheDocument());
		await fireEvent.click(screen.getByRole('button', { name: '끝내기' }));

		// Call #3: the reopened picker's own loadAttempts.
		loadAttemptsMock.mockResolvedValueOnce(new Map());
		// Call #4: the page's start() for the second run.
		loadAttemptsMock.mockResolvedValueOnce(
			new Map([['a_krv:1', '또 증거는 이것이니 하나님이 우리에게 영생은 주신 것이라']])
		);
		await waitFor(() => expect(screen.getByRole('button', { name: '시작' })).not.toBeDisabled());
		await fireEvent.click(screen.getByRole('button', { name: '틀린 곳 찾기' }));
		await fireEvent.click(screen.getByRole('button', { name: '시작' }));

		// The second run's read resolves and applies.
		await waitFor(() => expect(screen.getByText('영생은')).toBeInTheDocument());

		// The first run's read finally resolves. Its (fake, obviously stale)
		// data must not overwrite what the second, current run already applied.
		resolveFirst?.(new Map([['a_krv:1', '오래된 stale 문장']]));
		await new Promise((r) => setTimeout(r, 0));
		expect(screen.getByText('영생은')).toBeInTheDocument();
		expect(screen.queryByText('오래된')).toBeNull();
	});
});
