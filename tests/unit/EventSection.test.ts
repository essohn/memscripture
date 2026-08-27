import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import EventSection from '../../src/lib/components/home/EventSection.svelte';
import type { EventCardVM } from '../../src/lib/db/events';
import { getEventStatsOpen, setEventStatsOpen } from '../../src/lib/db/viewOptions';

const card: EventCardVM = {
	eventId: 'e1',
	eventTitle: '11월 암송 데이',
	dueAt: '2026-08-31',
	dDay: 12,
	ranges: [
		{
			label: '시편 23편',
			done: 3,
			total: 5,
			href: '/library/60_krv?sel=1%2C2',
			packageId: '60_krv',
			verseNos: [1, 2]
		}
	],
	// All zero, so the stats block stays hidden and the cases below keep
	// measuring what they were written to measure.
	stats: { total: 5, perfect: 0, start: [0, 0, 0, 0, 0], full: [0, 0, 0, 0, 0] }
};

describe('EventSection', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
	});

	it('renders nothing when there are no events', () => {
		const { container } = render(EventSection, { props: { events: [] } });
		expect(container.querySelector('section')).toBeNull();
	});

	it('renders the event title, D-day, range label, and progress', () => {
		render(EventSection, { props: { events: [card] } });
		expect(screen.getByText('11월 암송 데이')).toBeInTheDocument();
		expect(screen.getByText('D-12')).toBeInTheDocument();
		expect(screen.getByText('시편 23편')).toBeInTheDocument();
		expect(screen.getByText('3/5 암송')).toBeInTheDocument();
	});

	const withStats = {
		...card,
		stats: { total: 5, perfect: 4, start: [1, 0, 0, 0, 0], full: [0, 0, 0, 0, 0] }
	};

	// The chart is 177px of home page for a number most opens do not need.
	it('keeps the stats folded away until asked', () => {
		render(EventSection, { props: { events: [withStats] } });
		expect(screen.queryByTestId('perfect-count')).toBeNull();
		expect(screen.getByRole('button', { name: /통계/ })).toHaveAttribute(
			'aria-expanded',
			'false'
		);
	});

	it('shows the stats once the toggle is pressed', async () => {
		render(EventSection, { props: { events: [withStats] } });
		await fireEvent.click(screen.getByRole('button', { name: /통계/ }));
		expect(screen.getByTestId('perfect-count')).toHaveTextContent('4');
		expect(screen.getByTestId('bar-start-1')).toBeInTheDocument();
	});

	it('reports the open state to assistive technology', async () => {
		render(EventSection, { props: { events: [withStats] } });
		const toggle = screen.getByRole('button', { name: /통계/ });
		await fireEvent.click(toggle);
		expect(toggle).toHaveAttribute('aria-expanded', 'true');
	});

	it('folds the stats away again', async () => {
		render(EventSection, { props: { events: [withStats] } });
		const toggle = screen.getByRole('button', { name: /통계/ });
		await fireEvent.click(toggle);
		await fireEvent.click(toggle);
		expect(screen.queryByTestId('perfect-count')).toBeNull();
	});

	// jsdom measures nothing, so the size this asserts is the class rather than
	// the pixels. 11px text with py-1 gave a 26px-tall target — legal under
	// WCAG AA but under the 44px a thumb actually wants, and inconsistent with
	// the 55x67 columns inside the chart it opens.
	it('gives the toggle a thumb-sized target', () => {
		render(EventSection, { props: { events: [withStats] } });
		expect(screen.getByRole('button', { name: /통계/ })).toHaveClass('min-h-[44px]');
	});

	// A toggle that expands onto nothing is worse than no toggle.
	it('offers no toggle for an event with nothing plotted yet', () => {
		render(EventSection, { props: { events: [card] } });
		expect(screen.queryByRole('button', { name: /통계/ })).toBeNull();
	});

	// The reader who opens it every morning should not have to press it again.
	it('reopens an event the reader left open', async () => {
		await setEventStatsOpen('e1', true);
		render(EventSection, { props: { events: [withStats] } });
		await waitFor(() => expect(screen.getByTestId('perfect-count')).toBeInTheDocument());
	});

	it('remembers that the reader opened it', async () => {
		render(EventSection, { props: { events: [withStats] } });
		await fireEvent.click(screen.getByRole('button', { name: /통계/ }));
		await waitFor(async () => expect(await getEventStatsOpen('e1')).toBe(true));
	});

	it('links each range card to its library href', () => {
		render(EventSection, { props: { events: [card] } });
		expect(screen.getByRole('link', { name: /시편 23편/ }).getAttribute('href')).toBe('/library/60_krv?sel=1%2C2');
	});

	it('shows D-DAY on the due date', () => {
		render(EventSection, { props: { events: [{ ...card, dDay: 0 }] } });
		expect(screen.getByText('D-DAY')).toBeInTheDocument();
	});
});
