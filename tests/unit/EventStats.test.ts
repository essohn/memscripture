import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import EventStats from '../../src/lib/components/home/EventStats.svelte';
import type { EventStats as Stats } from '../../src/lib/db/events';
import { DIFFICULTY_LEVELS, DIFFICULTY_SHORT } from '../../src/lib/db/verseRatings';

/** Mirrors the component's plot geometry; the bars are sized in px so the
 *  minimum-height floor below can be asserted directly. */
const PLOT_PX = 34;
const MIN_BAR_PX = 4;

const stats = (over: Partial<Stats> = {}): Stats => ({
	total: 10,
	perfect: 0,
	start: [0, 0, 0, 0, 0, 0],
	full: [0, 0, 0, 0, 0, 0],
	...over
});

/** The inline height a bar was given, in px. */
function barPx(series: 'start' | 'full', level: number): number {
	const el = screen.getByTestId(`bar-${series}-${level}`);
	return Number(/height:\s*([\d.]+)px/.exec(el.getAttribute('style') ?? '')?.[1] ?? NaN);
}

/** The box a bar is drawn in — the same box its count now sits in. */
function plotBox(series: 'start' | 'full', level: number): HTMLElement {
	return screen.getByTestId(`bar-${series}-${level}`).parentElement as HTMLElement;
}

/** The inline height that box was given, in px. */
function plotBoxPx(series: 'start' | 'full', level: number): number {
	const style = plotBox(series, level).getAttribute('style') ?? '';
	return Number(/height:\s*([\d.]+)px/.exec(style)?.[1] ?? NaN);
}

describe('EventStats', () => {
	it('spells out what each difficulty measures', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 1, 0, 0, 0, 0] }) });
		expect(screen.getByText('암송 시작 난이도')).toBeInTheDocument();
		expect(screen.getByText('전체 일치 난이도')).toBeInTheDocument();
	});

	// One line, one size: the 19px number beside 11px labels made the headline
	// read as two separate facts rather than one sentence.
	it('prints both headline counts at the same size', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ total: 149, perfect: 137 }) });
		expect(screen.getByTestId('perfect-count')).toHaveClass('text-[12px]');
		expect(screen.getByTestId('imperfect-count')).toHaveClass('text-[12px]');
		expect(screen.getByTestId('perfect-total')).toHaveClass('text-[12px]');
	});

	// Content and order, not exact spacing: the gaps between these pieces come
	// from CSS, so pinning the whitespace would fail on a padding change while
	// still passing if the comma or a whole term went missing.
	it('reads as one sentence', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ total: 149, perfect: 137 }) });
		expect(screen.getByTestId('headline').textContent?.replace(/\s+/g, ' ').trim()).toMatch(
			/^완벽\s*137\s*,\s*미완벽\s*12\s*\/\s*149\s*구절$/
		);
	});

	it('calls the flawless count 완벽', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ total: 34, perfect: 12 }) });
		expect(screen.getByText('완벽')).toBeInTheDocument();
		expect(screen.queryByText('폭죽')).toBeNull();
	});

	// The remainder follows the same rule as 미평가 below it — total minus the
	// ones that qualify — so every number in the panel reads the same way.
	it('shows the remainder alongside the flawless count', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ total: 149, perfect: 12 }) });
		expect(screen.getByTestId('imperfect-count')).toHaveTextContent('137');
	});

	it('links the flawless count to its list', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ total: 149, perfect: 12 }) });
		expect(screen.getByTestId('perfect-count').closest('a')?.getAttribute('href')).toBe(
			'/stats/verses?event=e1&dim=perfect&level=yes'
		);
	});

	it('links the remainder to its own list', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ total: 149, perfect: 12 }) });
		expect(screen.getByTestId('imperfect-count').closest('a')?.getAttribute('href')).toBe(
			'/stats/verses?event=e1&dim=perfect&level=no'
		);
	});

	// Measured in the browser at 12x31 and 47x17 when the anchors wrapped only
	// the digits — under WCAG AA's 24px floor, let alone the 44px a thumb
	// wants, and inconsistent with the 55x67 columns below them.
	it('gives both headline links a thumb-sized target', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ total: 149, perfect: 12 }) });
		expect(screen.getByTestId('perfect-count').closest('a')).toHaveClass('min-h-[44px]');
		expect(screen.getByTestId('imperfect-count').closest('a')).toHaveClass('min-h-[44px]');
	});

	// The label belongs to the link: "완벽" is the word naming what it opens,
	// and a lone digit is not something anyone aims at.
	it('puts the label inside the flawless link', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ total: 149, perfect: 12 }) });
		expect(screen.getByTestId('perfect-count').closest('a')).toHaveTextContent('완벽');
	});

	it('leaves a flawless count of zero unlinked', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ total: 5, perfect: 0, start: [0, 1, 0, 0, 0, 0] }) });
		expect(screen.getByTestId('perfect-count').closest('a')).toBeNull();
	});

	// Everything recited flawlessly: there is no remainder to go and look at.
	it('leaves a remainder of zero unlinked', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ total: 5, perfect: 5 }) });
		expect(screen.getByTestId('imperfect-count').closest('a')).toBeNull();
	});

	// A bare 12 says nothing about whether the event is nearly done or barely
	// begun; 12 of 34 does.
	it('shows the flawless count against the verse total', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ total: 34, perfect: 12 }) });
		expect(screen.getByTestId('perfect-count')).toHaveTextContent('12');
		expect(screen.getByTestId('perfect-total')).toHaveTextContent('34');
	});

	// The five bars only account for verses that were rated. The rest are the
	// work still to do, and leaving them out lets a nearly-untouched event look
	// like a finished one whose ratings all landed on 3.
	it('counts the verses still unrated in each series', () => {
		render(EventStats, {
			eventId: 'e1',
			stats: stats({ total: 10, start: [0, 1, 1, 0, 2, 0], full: [0, 0, 0, 1, 0, 0] })
		});
		expect(screen.getByTestId('unrated-start')).toHaveTextContent('6');
		expect(screen.getByTestId('unrated-full')).toHaveTextContent('9');
	});

	it('never shows a negative remainder', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ total: 1, start: [0, 3, 0, 0, 0, 0] }) });
		expect(screen.getByTestId('unrated-start')).toHaveTextContent('0');
	});

	it('lays the two series side by side in one row', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 1, 0, 0, 0, 0], full: [0, 1, 0, 0, 0, 0] }) });
		const row = screen.getByTestId('series-row');
		expect(row).toContainElement(screen.getByTestId('bar-start-1'));
		expect(row).toContainElement(screen.getByTestId('bar-full-1'));
	});

	it('gives every level a slot in both series', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 1, 1, 1, 1, 1], full: [0, 1, 1, 1, 1, 1] }) });
		for (const level of [1, 2, 3, 4, 5]) {
			expect(screen.getByTestId(`bar-start-${level}`)).toBeInTheDocument();
			expect(screen.getByTestId(`bar-full-${level}`)).toBeInTheDocument();
		}
	});

	// Scaling each series to its own maximum would draw two bars of equal
	// height from counts of 2 and 4, which is the chart telling a lie about
	// the one comparison it exists to make.
	it('scales both series against the taller of the two', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 2, 0, 0, 0, 0], full: [0, 4, 0, 0, 0, 0] }) });
		expect(barPx('full', 1)).toBe(PLOT_PX);
		expect(barPx('start', 1)).toBe(PLOT_PX / 2);
	});

	it('draws no bar for a level nobody chose', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 4, 0, 0, 0, 0] }) });
		expect(barPx('start', 2)).toBe(0);
	});

	// Against a tall ceiling a count of one is a fraction of a pixel, and a
	// hairline is indistinguishable from the empty slot next to it. The floor
	// costs a percent of accuracy and buys back the difference between one and
	// none, which is the only comparison that bar has to make.
	it('keeps a single verse visible against a tall ceiling', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 1, 0, 0, 0, 100] }) });
		expect(barPx('start', 1)).toBe(MIN_BAR_PX);
		expect(barPx('start', 2)).toBe(0);
	});

	// jsdom runs no layout, so every height assertion above passes on a chart
	// that renders no bars at all: the column is `items-center`, which
	// shrink-wraps its children, so a plot box without w-full gives the bar a
	// zero-width parent to take 100% of. This shipped exactly that way once.
	it('keeps the plot box full width so the bar has something to fill', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 3, 0, 0, 0, 0] }) });
		expect(screen.getByTestId('bar-start-1').parentElement).toHaveClass('w-full');
	});

	// The count is what the reader asked to see, so it is printed for every
	// level — including the empty ones, where a missing number would read as
	// missing data rather than as none.
	it('prints the count for every level', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 3, 0, 0, 0, 0] }) });
		expect(screen.getByTestId('count-start-1')).toHaveTextContent('3');
		expect(screen.getByTestId('count-start-2')).toHaveTextContent('0');
	});

	// Printed above the plot box, every count landed on one shared line no
	// matter how tall its bar was — a row of numbers floating over a chart
	// they looked unrelated to. Inside the box, each one rides its own bar.
	it('sits each count on its own bar rather than on a shared line', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 1, 0, 0, 0, 9] }) });
		expect(plotBox('start', 1)).toContainElement(screen.getByTestId('count-start-1'));
		expect(plotBox('start', 5)).toContainElement(screen.getByTestId('count-start-5'));
		expect(plotBox('start', 1)).not.toContainElement(screen.getByTestId('count-start-5'));
	});

	// The number is stacked above the bar and the stack is bottom-aligned, so
	// the count only rises with the bar if it precedes it in the DOM.
	it('stacks the count above its bar, off the baseline', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 3, 0, 0, 0, 0] }) });
		const box = plotBox('start', 1);
		expect(box.className).toContain('flex-col');
		expect(box.className).toContain('justify-end');
		const order = screen
			.getByTestId('count-start-1')
			.compareDocumentPosition(screen.getByTestId('bar-start-1'));
		expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	// A full-height bar with its number on top needs more room than the plot
	// alone, or the tallest column's count gets clipped by the box.
	it('reserves room above a full-height bar for its count', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 0, 0, 0, 0, 7] }) });
		expect(barPx('start', 5)).toBe(PLOT_PX);
		expect(plotBoxPx('start', 5)).toBeGreaterThan(PLOT_PX);
	});

	// Five zeroes over an empty axis is a chart with nothing in it, taking the
	// height of one that has something. A line of text says the same thing.
	it('replaces an unrated series with a note instead of an empty axis', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 1, 0, 0, 0, 0], full: [0, 0, 0, 0, 0, 0] }) });
		expect(screen.getByTestId('bar-start-1')).toBeInTheDocument();
		expect(screen.queryByTestId('bar-full-1')).toBeNull();
		expect(screen.getByTestId('empty-full')).toBeInTheDocument();
	});

	// A freshly published event has nothing to plot, and an empty chart on the
	// home page is noise standing where the next event should be.
	it('renders nothing before anyone has rated or recited', () => {
		const { container } = render(EventStats, { eventId: 'e1', stats: stats() });
		expect(container.textContent?.trim()).toBe('');
	});

	// One flawless verse is something to show even with no ratings yet.
	it('renders once a single verse has been recited flawlessly', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ perfect: 1 }) });
		expect(screen.getByTestId('perfect-count')).toHaveTextContent('1');
	});

	// Colour alone never carries the level: the scale is printed under the bars.
	it('labels each bar with its difficulty level', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 1, 0, 0, 0, 0] }) });
		expect(screen.getByTestId('level-start-3')).toHaveTextContent('Norm');
	});

	// A 0-5 axis under a row of counts is two sets of small numbers meaning
	// different things, and the reader has to be told which is which. Words
	// cannot be mistaken for a count.
	it('names every level in words, never in a bare number', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 1, 0, 0, 0, 0] }) });
		for (const level of DIFFICULTY_LEVELS) {
			const el = screen.getByTestId(`level-start-${level}`);
			expect(el).toHaveTextContent(DIFFICULTY_SHORT[level]);
			expect(el.textContent?.trim()).not.toBe(String(level));
		}
	});

	it('names the level in each bar accessible label', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 0, 0, 7, 0, 0] }) });
		expect(screen.getByTestId('bar-start-3')).toHaveAttribute(
			'aria-label',
			expect.stringContaining('Normal') as unknown as string
		);
	});
});

describe('EventStats links', () => {
	/** The anchor a level's column sits in, if it is a link at all. */
	function columnLink(series: 'start' | 'full', level: number): HTMLAnchorElement | null {
		return screen.getByTestId(`count-${series}-${level}`).closest('a');
	}

	it('links a populated level to the verses behind it', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 0, 3, 0, 0, 0] }) });
		expect(columnLink('start', 2)?.getAttribute('href')).toBe(
			'/stats/verses?event=e1&dim=start&level=2'
		);
	});

	// A link to an empty list is a dead end; the slot still shows its 0.
	it('leaves a level nobody chose unlinked', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 3, 0, 0, 0, 0] }) });
		expect(columnLink('start', 2)).toBeNull();
		expect(screen.getByTestId('count-start-2')).toHaveTextContent('0');
	});

	// A 4px bar is not a tap target. The whole column — count, plot and level
	// label — is what the finger gets.
	it('makes the whole column the tap target, not just the bar', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ start: [0, 3, 0, 0, 0, 0] }) });
		const link = columnLink('start', 1);
		expect(link).toContainElement(screen.getByTestId('bar-start-1'));
		expect(link).toContainElement(screen.getByTestId('level-start-1'));
	});

	it('links the unrated remainder to its own list', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ total: 10, start: [0, 1, 0, 0, 0, 0] }) });
		expect(screen.getByTestId('unrated-start').closest('a')?.getAttribute('href')).toBe(
			'/stats/verses?event=e1&dim=start&level=none'
		);
	});

	it('leaves a remainder of zero unlinked', () => {
		render(EventStats, { eventId: 'e1', stats: stats({ total: 1, start: [0, 1, 0, 0, 0, 0] }) });
		expect(screen.getByTestId('unrated-start').closest('a')).toBeNull();
	});
});

describe('EventStats level 0', () => {
	it('gives Impossible a column of its own', () => {
		render(EventStats, {
			eventId: 'e1',
			stats: { total: 9, perfect: 0, start: [4, 0, 0, 0, 0, 0], full: [0, 0, 0, 0, 0, 0] }
		});
		expect(screen.getByTestId('count-start-0')).toHaveTextContent('4');
		expect(screen.getByTestId('level-start-0')).toHaveTextContent('Imp');
		expect(screen.getByTestId('bar-start-0')).toHaveAttribute(
			'aria-label',
			expect.stringContaining('Impossible') as unknown as string
		);
	});

	// Black on the dark theme's card is barely 1.4:1 against its own
	// background, so the bar's shape has to come from an outline.
	it('outlines the black bar so it survives the dark theme', () => {
		render(EventStats, {
			eventId: 'e1',
			stats: { total: 9, perfect: 0, start: [4, 0, 0, 0, 0, 0], full: [0, 0, 0, 0, 0, 0] }
		});
		expect(screen.getByTestId('bar-start-0').className).toContain('border');
		expect(screen.getByTestId('bar-start-1').className).not.toContain('border');
	});
});
