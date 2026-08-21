import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import DifficultyBadge from '../../src/lib/components/card/DifficultyBadge.svelte';

async function openMenu(value: 1 | 2 | 3 | 4 | 5 | null, onpick = vi.fn()) {
	render(DifficultyBadge, { value, label: '전체 암송 난이도', onpick });
	await fireEvent.click(screen.getByRole('button', { name: /난이도/ }));
	return onpick;
}

describe('DifficultyBadge', () => {
	it('reports the level that was picked', async () => {
		const onpick = await openMenu(null);
		await fireEvent.click(screen.getByRole('menuitemradio', { name: /4/ }));
		expect(onpick).toHaveBeenCalledWith(4);
	});

	// It used to clear the rating instead, borrowed from the bookmark ribbon.
	// A ribbon has no other way to come off; this menu has 지우기 right below
	// it. Confirming a rating is the likelier intent by far, and erasing it is
	// a trap the reader only finds by falling into it.
	it('leaves the level set when the one already set is picked again', async () => {
		const onpick = await openMenu(3);
		await fireEvent.click(screen.getByRole('menuitemradio', { name: /3/ }));
		expect(onpick).toHaveBeenCalledWith(3);
		expect(onpick).not.toHaveBeenCalledWith(null);
	});

	it('marks the current level as the checked one', async () => {
		await openMenu(3);
		expect(screen.getByRole('menuitemradio', { name: /3/ })).toHaveAttribute(
			'aria-checked',
			'true'
		);
	});

	// Clearing stays possible — it just has to be asked for.
	it('clears only through 지우기', async () => {
		const onpick = await openMenu(3);
		await fireEvent.click(screen.getByRole('menuitem', { name: '지우기' }));
		expect(onpick).toHaveBeenCalledWith(null);
	});

	it('offers no 지우기 when there is nothing to clear', async () => {
		await openMenu(null);
		expect(screen.queryByRole('menuitem', { name: '지우기' })).toBeNull();
	});
});
