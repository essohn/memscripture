import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from '../../src/routes/stats/verses/+page.svelte';
import type { StatsVersesLoadData } from '../../src/routes/stats/verses/+page';

const verse = { i: 1, no: 1, package_id: '5_krv', title: '제목', cite: '요한복음 1 : 1', w: '태초에 말씀이 계시니라' };

function data(over: Partial<StatsVersesLoadData> = {}): StatsVersesLoadData {
	return {
		eventTitle: '2026 여름 암송 DAY',
		dim: 'start',
		level: 2,
		perfect: false,
		rows: [{ verse, packageId: '5_krv', packageName: '샘플', bookmark: null, marks: [], perfect: false, tags: [] }],
		...over
	} as StatsVersesLoadData;
}

describe('stats verse list', () => {
	// This list is reached from the home chart; the library list is reached by
	// picking a package. Same verses, same card — the reader should not have to
	// notice which door they came through.
	it('gives the card its bookmark control, like the library list does', () => {
		render(Page, { data: data() });
		expect(screen.getByRole('button', { name: /북마크/ })).toBeInTheDocument();
	});

	it('shows the flawless badge when the verse has earned one', () => {
		render(Page, {
			data: data({
				rows: [{ verse, packageId: '5_krv', packageName: '샘플', bookmark: null, marks: [], perfect: true, tags: [] }]
			}) as StatsVersesLoadData
		});
		expect(screen.getByLabelText('완벽하게 암송한 구절')).toBeInTheDocument();
	});
});

describe('stats verse list playback', () => {
	beforeEach(() => {
		// The buttons only exist where speech does.
		vi.stubGlobal('speechSynthesis', {
			speaking: false,
			pending: false,
			paused: false,
			getVoices: () => [],
			speak() {},
			cancel() {},
			resume() {}
		});
		vi.stubGlobal(
			'SpeechSynthesisUtterance',
			class {
				text: string;
				constructor(text: string) {
					this.text = text;
				}
			}
		);
	});
	afterEach(() => vi.unstubAllGlobals());

	/*
	 * This list is already the answer to a question — 시작 난이도 xHard, 전체
	 * 일치 Hard — and the useful next move on a set of verses you have just
	 * called hard is to hear them. The same pair as the 암송 DAY card, because
	 * a narrowed list is a list.
	 */
	it('offers 전체 듣기 and 따라 읽기 for the list it is showing', () => {
		render(Page, { data: data() });
		expect(screen.getByLabelText(/전체 듣기/)).toBeInTheDocument();
		expect(screen.getByLabelText(/따라 읽기/)).toBeInTheDocument();
	});

	it('offers nothing to play when the list is empty', () => {
		render(Page, { data: data({ rows: [] }) });
		expect(screen.queryByLabelText(/전체 듣기/)).toBeNull();
	});
});
