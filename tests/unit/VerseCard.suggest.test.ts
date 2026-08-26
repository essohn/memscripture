import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import VerseCard from '../../src/lib/components/card/VerseCard.svelte';
import { db } from '../../src/lib/db/local';
import { recordCheck } from '../../src/lib/db/checkHistory';

// Word indices: 0 그들에게 · 1 율례와 · 2 법도를 · 3 가르쳐서 · 4 마땅히 · 5 갈
//               6 길과 · 7 할 · 8 일을 · 9 그들에게 · 10 보이고
const verse = {
	i: 127,
	no: 127,
	package_id: '900_krv',
	title: '양  육',
	cite: '출애굽기 18 : 20',
	w: '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고'
};

const check = (missed: number[]) =>
	({ start: 3, full: 3, accuracy: 0.9, elapsedMs: 20_000, missed }) as never;

beforeEach(async () => {
	await db.delete();
	await db.open();
});

function setup(over: Record<string, unknown> = {}) {
	const props = {
		verse,
		packageName: '900구절',
		packageId: '900_krv',
		tags: [],
		marks: [] as { i: number; w: string }[],
		onToggleMark: vi.fn(),
		onPickStartDifficulty: vi.fn(),
		onPickFullDifficulty: vi.fn(),
		...over
	};
	const { container, rerender } = render(VerseCard, props);
	return { container, rerender, props };
}

/** The curtain's words. Read mode renders bare spans with no `.word` class,
 *  so this only ever matches the rehearsal paragraph. */
const wordAt = (container: HTMLElement, i: number) => container.querySelectorAll('.word')[i];

async function openMarking() {
	await fireEvent.click(screen.getByRole('button', { name: '암송' }));
	await fireEvent.click(screen.getByRole('button', { name: '밑줄' }));
}

describe('밑줄: suggestions read off the check history', () => {
	// Two misses propose a word; one is a typo, not a weak spot. Asserting both
	// in one test means the negative cannot pass merely because the history
	// had not loaded yet.
	it('dots what was missed twice and leaves a single slip alone', async () => {
		await recordCheck('900_krv', 127, check([2, 5]), 1000);
		await recordCheck('900_krv', 127, check([2]), 2000);
		const { container } = setup();
		await openMarking();
		await waitFor(() => expect(wordAt(container, 2)).toHaveClass('suggested'));
		expect(wordAt(container, 5)).not.toHaveClass('suggested');
	});

	// A suggestion that has been taken is not still a suggestion.
	it('stops dotting a word once it is really underlined', async () => {
		await recordCheck('900_krv', 127, check([2, 5]), 1000);
		await recordCheck('900_krv', 127, check([2, 5]), 2000);
		const { container } = setup({ marks: [{ i: 2, w: '법도를' }] });
		await openMarking();
		await waitFor(() => expect(wordAt(container, 5)).toHaveClass('suggested'));
		expect(wordAt(container, 2)).toHaveClass('underlined');
		expect(wordAt(container, 2)).not.toHaveClass('suggested');
	});

	// Outside marking mode a dot has nothing to tap: it would be a remark
	// competing with the reader's own underlines while they recite.
	it('shows nothing until 밑줄 is pressed', async () => {
		await recordCheck('900_krv', 127, check([2]), 1000);
		await recordCheck('900_krv', 127, check([2]), 2000);
		const { container } = setup();
		await fireEvent.click(screen.getByRole('button', { name: '암송' }));
		expect(container.querySelector('.suggested')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: '밑줄' }));
		await waitFor(() => expect(wordAt(container, 2)).toHaveClass('suggested'));
	});

	it('says so in the hint line when it has something to propose', async () => {
		await recordCheck('900_krv', 127, check([2]), 1000);
		await recordCheck('900_krv', 127, check([2]), 2000);
		setup();
		await openMarking();
		await waitFor(() =>
			expect(
				screen.getByText('자주 틀린 곳을 점선으로 표시했습니다 · 눌러서 밑줄')
			).toBeInTheDocument()
		);
	});

	it('keeps the original hint line when it has nothing to propose', async () => {
		setup();
		await openMarking();
		expect(screen.getByText('자주 틀리는 단어를 눌러 밑줄')).toBeInTheDocument();
	});

	// Taking the last proposal leaves nothing dotted, so the line pointing at
	// dots has to stop pointing. The package list rewrites `marks` after a tap,
	// which is what the rerender stands in for. The waitFor before it is what
	// proves the history had loaded — without it the assertions below would
	// hold on an empty suggestion set and prove nothing.
	it('drops the suggestion hint once every proposal has been taken', async () => {
		await recordCheck('900_krv', 127, check([2]), 1000);
		await recordCheck('900_krv', 127, check([2]), 2000);
		const { container, rerender, props } = setup();
		await openMarking();
		await waitFor(() => expect(wordAt(container, 2)).toHaveClass('suggested'));

		await fireEvent.click(wordAt(container, 2));
		await rerender({ ...props, marks: [{ i: 2, w: '법도를' }] });

		expect(container.querySelector('.suggested')).toBeNull();
		expect(screen.getByText('자주 틀리는 단어를 눌러 밑줄')).toBeInTheDocument();
	});
});
