import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import EventSection from '../../src/lib/components/home/EventSection.svelte';
import type { EventCardVM } from '../../src/lib/db/events';

const card: EventCardVM = {
	eventId: 'e1',
	eventTitle: '11월 암송 데이',
	dDay: 12,
	ranges: [{ label: '시편 23편', done: 3, total: 5, href: '/library/60_krv?sel=1%2C2' }]
};

describe('EventSection', () => {
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

	it('links each range card to its library href', () => {
		render(EventSection, { props: { events: [card] } });
		expect(screen.getByRole('link', { name: /시편 23편/ }).getAttribute('href')).toBe('/library/60_krv?sel=1%2C2');
	});

	it('shows D-DAY on the due date', () => {
		render(EventSection, { props: { events: [{ ...card, dDay: 0 }] } });
		expect(screen.getByText('D-DAY')).toBeInTheDocument();
	});
});
