import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import EventStats from '../../src/lib/components/home/EventStats.svelte';
import type { EventStats as Stats } from '../../src/lib/db/events';

/** Mirrors the component's plot geometry; the bars are sized in px so the
 *  minimum-height floor below can be asserted directly. */
const PLOT_PX = 34;
const MIN_BAR_PX = 4;

const stats = (over: Partial<Stats> = {}): Stats => ({
	total: 10,
	perfect: 0,
	start: [0, 0, 0, 0, 0],
	full: [0, 0, 0, 0, 0],
	...over
});

/** The inline height a bar was given, in px. */
function barPx(series: 'start' | 'full', level: number): number {
	const el = screen.getByTestId(`bar-${series}-${level}`);
	return Number(/height:\s*([\d.]+)px/.exec(el.getAttribute('style') ?? '')?.[1] ?? NaN);
}

describe('EventStats', () => {
	// A bare 12 says nothing about whether the event is nearly done or barely
	// begun; 12 of 34 does.
	it('shows the flawless count against the verse total', () => {
		render(EventStats, { stats: stats({ total: 34, perfect: 12 }) });
		expect(screen.getByTestId('perfect-count')).toHaveTextContent('12');
		expect(screen.getByTestId('perfect-total')).toHaveTextContent('34');
	});

	// The five bars only account for verses that were rated. The rest are the
	// work still to do, and leaving them out lets a nearly-untouched event look
	// like a finished one whose ratings all landed on 3.
	it('counts the verses still unrated in each series', () => {
		render(EventStats, {
			stats: stats({ total: 10, start: [1, 1, 0, 2, 0], full: [0, 0, 1, 0, 0] })
		});
		expect(screen.getByTestId('unrated-start')).toHaveTextContent('6');
		expect(screen.getByTestId('unrated-full')).toHaveTextContent('9');
	});

	it('never shows a negative remainder', () => {
		render(EventStats, { stats: stats({ total: 1, start: [3, 0, 0, 0, 0] }) });
		expect(screen.getByTestId('unrated-start')).toHaveTextContent('0');
	});

	it('lays the two series side by side in one row', () => {
		render(EventStats, { stats: stats({ start: [1, 0, 0, 0, 0], full: [1, 0, 0, 0, 0] }) });
		const row = screen.getByTestId('series-row');
		expect(row).toContainElement(screen.getByTestId('bar-start-1'));
		expect(row).toContainElement(screen.getByTestId('bar-full-1'));
	});

	it('gives every level a slot in both series', () => {
		render(EventStats, { stats: stats({ start: [1, 1, 1, 1, 1], full: [1, 1, 1, 1, 1] }) });
		for (const level of [1, 2, 3, 4, 5]) {
			expect(screen.getByTestId(`bar-start-${level}`)).toBeInTheDocument();
			expect(screen.getByTestId(`bar-full-${level}`)).toBeInTheDocument();
		}
	});

	// Scaling each series to its own maximum would draw two bars of equal
	// height from counts of 2 and 4, which is the chart telling a lie about
	// the one comparison it exists to make.
	it('scales both series against the taller of the two', () => {
		render(EventStats, { stats: stats({ start: [2, 0, 0, 0, 0], full: [4, 0, 0, 0, 0] }) });
		expect(barPx('full', 1)).toBe(PLOT_PX);
		expect(barPx('start', 1)).toBe(PLOT_PX / 2);
	});

	it('draws no bar for a level nobody chose', () => {
		render(EventStats, { stats: stats({ start: [4, 0, 0, 0, 0] }) });
		expect(barPx('start', 2)).toBe(0);
	});

	// Against a tall ceiling a count of one is a fraction of a pixel, and a
	// hairline is indistinguishable from the empty slot next to it. The floor
	// costs a percent of accuracy and buys back the difference between one and
	// none, which is the only comparison that bar has to make.
	it('keeps a single verse visible against a tall ceiling', () => {
		render(EventStats, { stats: stats({ start: [1, 0, 0, 0, 100] }) });
		expect(barPx('start', 1)).toBe(MIN_BAR_PX);
		expect(barPx('start', 2)).toBe(0);
	});

	// jsdom runs no layout, so every height assertion above passes on a chart
	// that renders no bars at all: the column is `items-center`, which
	// shrink-wraps its children, so a plot box without w-full gives the bar a
	// zero-width parent to take 100% of. This shipped exactly that way once.
	it('keeps the plot box full width so the bar has something to fill', () => {
		render(EventStats, { stats: stats({ start: [3, 0, 0, 0, 0] }) });
		expect(screen.getByTestId('bar-start-1').parentElement).toHaveClass('w-full');
	});

	// The count is what the reader asked to see, so it is printed for every
	// level — including the empty ones, where a missing number would read as
	// missing data rather than as none.
	it('prints the count for every level', () => {
		render(EventStats, { stats: stats({ start: [3, 0, 0, 0, 0] }) });
		expect(screen.getByTestId('count-start-1')).toHaveTextContent('3');
		expect(screen.getByTestId('count-start-2')).toHaveTextContent('0');
	});

	// Five zeroes over an empty axis is a chart with nothing in it, taking the
	// height of one that has something. A line of text says the same thing.
	it('replaces an unrated series with a note instead of an empty axis', () => {
		render(EventStats, { stats: stats({ start: [1, 0, 0, 0, 0], full: [0, 0, 0, 0, 0] }) });
		expect(screen.getByTestId('bar-start-1')).toBeInTheDocument();
		expect(screen.queryByTestId('bar-full-1')).toBeNull();
		expect(screen.getByTestId('empty-full')).toBeInTheDocument();
	});

	// A freshly published event has nothing to plot, and an empty chart on the
	// home page is noise standing where the next event should be.
	it('renders nothing before anyone has rated or recited', () => {
		const { container } = render(EventStats, { stats: stats() });
		expect(container.textContent?.trim()).toBe('');
	});

	// One flawless verse is something to show even with no ratings yet.
	it('renders once a single verse has been recited flawlessly', () => {
		render(EventStats, { stats: stats({ perfect: 1 }) });
		expect(screen.getByTestId('perfect-count')).toHaveTextContent('1');
	});

	// Colour alone never carries the level: the scale is printed under the bars.
	it('labels each bar with its difficulty level', () => {
		render(EventStats, { stats: stats({ start: [1, 0, 0, 0, 0] }) });
		expect(screen.getByTestId('level-start-3')).toHaveTextContent('3');
	});

	it('names the level in each bar accessible label', () => {
		render(EventStats, { stats: stats({ start: [0, 0, 7, 0, 0] }) });
		expect(screen.getByTestId('bar-start-3')).toHaveAttribute(
			'aria-label',
			expect.stringContaining('Normal') as unknown as string
		);
	});
});
