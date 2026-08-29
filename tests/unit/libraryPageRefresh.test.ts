import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';

vi.mock('../../src/lib/db/verses', () => ({ listPackages: vi.fn(async () => []) }));
vi.mock('../../src/lib/db/recent', () => ({ getRecentPackageIds: vi.fn(async () => []) }));
vi.mock('../../src/lib/db/packageOrder', () => ({ setPackageOrder: vi.fn(async () => {}) }));

import { listPackages } from '../../src/lib/db/verses';
import { dataGeneration } from '../../src/lib/state/dataGeneration.svelte';
import LibraryPage from '../../src/routes/library/+page.svelte';

beforeEach(() => {
	vi.mocked(listPackages).mockClear();
});

describe('library page and an arriving sync', () => {
	// The screen reads the package list once, on mount. A sync landing another
	// device's records rewrites the table underneath and used to leave this
	// list showing what it had already read — reported as "동기화했는데 아무
	//것도 안 넘어왔다". Watching the generation is what makes it look again.
	it('re-reads the packages when a sync rewrites the tables', async () => {
		render(LibraryPage);
		await waitFor(() => expect(listPackages).toHaveBeenCalledTimes(1));

		dataGeneration.bump();

		await waitFor(() => expect(listPackages).toHaveBeenCalledTimes(2));
	});

	// Nothing else may move it: an effect that re-ran on unrelated state would
	// hit IndexedDB on every render.
	it('does not re-read when nothing rewrote anything', async () => {
		render(LibraryPage);
		await waitFor(() => expect(listPackages).toHaveBeenCalledTimes(1));

		await new Promise((r) => setTimeout(r, 50));

		expect(listPackages).toHaveBeenCalledTimes(1);
	});
});
