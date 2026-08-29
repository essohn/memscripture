import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import CheckDiagnosis from '../../src/lib/components/card/CheckDiagnosis.svelte';
import type { CheckRecord } from '../../src/lib/db/local';

const WORDS = ['하나님이', '세상을', '이처럼', '사랑하사', '독생자를', '주셨으니'];
const FULL = WORDS.join(' ');

const record = (over: Partial<CheckRecord> = {}): CheckRecord => ({
	id: 'a',
	verseKey: '900_krv:1',
	packageId: '900_krv',
	verseNo: 1,
	checkedAt: 1_000_000,
	start: 3,
	full: 3,
	accuracy: 1,
	elapsedMs: 30_000,
	typed: FULL,
	missed: [],
	...over
});

const mount = (records: CheckRecord[], words = WORDS) =>
	render(CheckDiagnosis, { props: { records, words } });

const tierOfWord = (word: string) =>
	screen.getAllByTestId('heat-word').find((el) => el.textContent === word)?.dataset.tier;

describe('CheckDiagnosis', () => {
	// One point is not a trend and one attempt is not a pattern.
	it('says nothing about a single check', () => {
		mount([record()]);
		expect(screen.queryByTestId('check-diagnosis')).not.toBeInTheDocument();
	});

	it('says nothing at all with no checks', () => {
		mount([]);
		expect(screen.queryByTestId('check-diagnosis')).not.toBeInTheDocument();
	});

	it('reports what the verse has cost', () => {
		mount([
			record({ id: 'a', hints: 2, elapsedMs: 120_000 }),
			record({ id: 'b', hints: 5, elapsedMs: 300_000 })
		]);
		expect(screen.getByTestId('diagnosis-effort')).toHaveTextContent('최근 2회 · 힌트 7 · 7분');
	});

	// A "힌트 0" is a row of type spent saying nothing happened — the sheet's
	// own rows already omit it.
	it('omits the hint segment when no hint was spent', () => {
		mount([record({ id: 'a', elapsedMs: 20_000 }), record({ id: 'b', elapsedMs: 10_000 })]);
		expect(screen.getByTestId('diagnosis-effort')).toHaveTextContent('최근 2회 · 30초');
		expect(screen.getByTestId('diagnosis-effort')).not.toHaveTextContent('힌트');
	});

	it('tints a word by how often it was actually got wrong', () => {
		mount([
			record({ id: 'a', missed: [3] }),
			record({ id: 'b', missed: [3] }),
			record({ id: 'c', missed: [4] })
		]);
		expect(tierOfWord('사랑하사')).toBe('often'); // reached 3, missed 2 → exactly 2/3
		expect(tierOfWord('독생자를')).toBe('sometimes'); // reached 3, missed 1 → exactly 1/3
		expect(tierOfWord('하나님이')).toBe('none'); // reached 3, missed 0
	});

	// The paragraph is readable text, not an image: a screen reader should read
	// a verse as a verse. The tinted words are named once, afterwards.
	it('names the tinted words in a sentence rather than annotating each one', () => {
		mount([record({ id: 'a', missed: [3] }), record({ id: 'b', missed: [3] })]);
		expect(screen.getByTestId('diagnosis-heatmap')).not.toHaveAttribute('role', 'img');
		expect(screen.getByText('자주 틀린 곳: 사랑하사.')).toBeInTheDocument();
	});

	it('drops the heat map when nothing measured word positions', () => {
		mount([record({ id: 'a', missed: undefined }), record({ id: 'b', missed: undefined })]);
		expect(screen.getByTestId('check-diagnosis')).toBeInTheDocument();
		expect(screen.queryByTestId('diagnosis-heatmap')).not.toBeInTheDocument();
	});

	// Rising means easier, because the scale runs 0=Impossible..5=xEasy.
	it('reads a rising rating as the verse getting easier', () => {
		mount([
			record({ id: 'a', full: 5 }),
			record({ id: 'b', full: 4 }),
			record({ id: 'c', full: 3 }),
			record({ id: 'd', full: 2 })
		]);
		expect(screen.getByTestId('trend-full')).toHaveTextContent('쉬워지는 중');
	});

	it('draws no arrow when there is not enough rating to call a direction', () => {
		mount([record({ id: 'a', full: null }), record({ id: 'b', full: null })]);
		expect(screen.queryByTestId('trend-full')).not.toBeInTheDocument();
	});

	// A diagram, unlike the verse: named once, its pips hidden.
	it('names each difficulty sequence in one label', () => {
		mount([record({ id: 'a', full: 4 }), record({ id: 'b', full: null })]);
		expect(screen.getByLabelText('전체 난이도 변화: 없음, 4')).toBeInTheDocument();
	});

	it('names the accuracy sequence in one label', () => {
		mount([record({ id: 'a', accuracy: 0.87 }), record({ id: 'b', accuracy: 0.71 })]);
		expect(screen.getByLabelText('정확도 변화: 71%, 87%')).toBeInTheDocument();
	});
});
