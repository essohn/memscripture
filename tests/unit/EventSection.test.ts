import { render, screen } from '@testing-library/svelte';
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import EventSection from '../../src/lib/components/home/EventSection.svelte';
import type { EventCardVM } from '../../src/lib/db/events';

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

	it('shows the stats beneath the range cards', () => {
		render(EventSection, { props: { events: [withStats] } });
		expect(screen.getByTestId('perfect-count')).toHaveTextContent('4');
		expect(screen.getByTestId('bar-start-1')).toBeInTheDocument();
	});

	// They were behind a 통계 보기 line for a while. Always visible now, so
	// there is nothing to press and nothing to remember.
	it('offers no control to fold them away', () => {
		render(EventSection, { props: { events: [withStats] } });
		expect(screen.queryByRole('button', { name: /통계/ })).toBeNull();
	});

	// Still withheld when there is nothing plotted — an empty panel is not
	// worth the space whether or not a toggle guards it.
	it('shows nothing for an event with nothing plotted yet', () => {
		render(EventSection, { props: { events: [card] } });
		expect(screen.queryByTestId('perfect-count')).toBeNull();
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
