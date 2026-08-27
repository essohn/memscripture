import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import VerseCard from '../../src/lib/components/card/VerseCard.svelte';
import { db } from '../../src/lib/db/local';
import { listChecks, recordCheck } from '../../src/lib/db/checkHistory';
import { tick } from 'svelte';

const verse = {
	i: 127,
	no: 127,
	package_id: '900_krv',
	title: '양  육',
	cite: '출애굽기 18 : 20',
	w: '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고'
};

const DAY = 86_400_000;
/** Anchored to the real clock rather than a faked one: Dexie and
 *  fake-indexeddb both settle through timers, and freezing those deadlocks the
 *  database. Offsets from the live now are just as deterministic here — three
 *  days ago is "3일 전" whenever the suite runs. */
const daysAgo = (n: number) => Date.now() - n * DAY;

beforeEach(async () => {
	await db.delete();
	await db.open();
});

function setup(over: Record<string, unknown> = {}) {
	return render(VerseCard, {
		verse,
		packageName: '900구절',
		packageId: '900_krv',
		tags: [],
		marks: [] as { i: number; w: string }[],
		onToggleMark: vi.fn(),
		onPickStartDifficulty: vi.fn(),
		onPickFullDifficulty: vi.fn(),
		...over
	});
}

const trigger = () => screen.queryByTestId('last-checked');

describe('VerseCard last-checked line', () => {
	// The header already carries two badges, 암송 and 점검, and on a 320px
	// phone the title is down to a third of the row. A verse with no history
	// has nothing to say here, so it must not spend the space saying it.
	it('says nothing about a verse never checked', () => {
		setup({ lastCheckedAt: null });
		expect(trigger()).not.toBeInTheDocument();
	});

	it('says how long ago the verse was last checked', () => {
		setup({ lastCheckedAt: daysAgo(3) });
		expect(trigger()).toHaveTextContent('3일 전');
	});

	it('names the act in its accessible label, not just the interval', () => {
		setup({ lastCheckedAt: daysAgo(3) });
		expect(screen.getByRole('button', { name: '최근 점검 3일 전, 점검 기록 보기' })).toBeInTheDocument();
	});

	// The line belongs to the read-mode header. During a check the panel shows
	// its own history, and a second way in would open a sheet over the attempt.
	it('is gone once a check is underway', async () => {
		setup({ lastCheckedAt: daysAgo(3) });
		await fireEvent.click(screen.getByRole('button', { name: '점검' }));
		expect(trigger()).not.toBeInTheDocument();
	});

	it('opens the history sheet when tapped', async () => {
		await recordCheck('900_krv', 127, { start: 3, full: 4, accuracy: 0.9, elapsedMs: 20_000, typed: '그들에게 율례와' }, daysAgo(3));
		setup({ lastCheckedAt: daysAgo(3) });

		await fireEvent.click(trigger()!);

		await waitFor(() => expect(screen.getByRole('dialog', { name: /점검 기록/ })).toBeInTheDocument());
		expect(screen.getByText('그들에게 율례와')).toBeInTheDocument();
	});

	// The sheet is built around a difficulty a quiz round does not carry, and
	// listLastCheckedAt already refuses to date the line by one. Opening on a
	// verse whose only rows are quiz rounds would show an empty sheet.
	it('does not open on a verse whose only rows are quiz rounds', async () => {
		await recordCheck(
			'900_krv',
			127,
			{ start: null, full: null, accuracy: 0.9, elapsedMs: 20_000, source: 'quiz' },
			daysAgo(3)
		);
		setup({ lastCheckedAt: daysAgo(3) });

		await fireEvent.click(trigger()!);
		// Not a sleep: the card queued its read before this one, and IndexedDB
		// serves a connection's requests in order, so ours coming back proves
		// its did too. A bare assertion here would pass on the frame before
		// the sheet had any chance to open.
		await listChecks('900_krv', 127);
		await tick();

		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('closes the sheet again', async () => {
		await recordCheck('900_krv', 127, { start: 3, full: 4, accuracy: 0.9, elapsedMs: 20_000 }, daysAgo(3));
		setup({ lastCheckedAt: daysAgo(3) });

		await fireEvent.click(trigger()!);
		await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

		await fireEvent.click(screen.getByRole('button', { name: '닫기' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
	});

	// The card's own tap handler starts a check. A tap meant for this line
	// must not do both — read the history and lose the card behind a panel.
	it('does not start a check when the line is tapped', async () => {
		await recordCheck('900_krv', 127, { start: 3, full: 4, accuracy: 0.9, elapsedMs: 20_000 }, daysAgo(3));
		setup({ lastCheckedAt: daysAgo(3), tapToCheck: true });

		await fireEvent.click(trigger()!);

		await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
		expect(screen.queryByPlaceholderText('외운 구절을 입력하세요')).not.toBeInTheDocument();
	});
});
