import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
	verses: []
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

// `unknown[]`, not `Record<string, unknown>[]`: FakeUtterance is declared
// inside installFakeSynth() below, so its type isn't in scope up here, and a
// class instance isn't structurally assignable to an indexed-signature type.
const spoken: unknown[] = [];

function installFakeSynth() {
	class FakeUtterance {
		text: string;
		lang = '';
		rate = 1;
		voice: unknown = null;
		onend: (() => void) | null = null;
		onerror: (() => void) | null = null;
		onboundary: ((e: { charIndex: number }) => void) | null = null;
		constructor(text: string) {
			this.text = text;
		}
	}
	const synth = {
		speaking: false,
		pending: false,
		paused: false,
		getVoices: () => [{ name: 'Google 한국의', lang: 'ko-KR' }],
		speak(u: FakeUtterance) {
			spoken.push(u);
			synth.speaking = true;
		},
		cancel() {
			synth.speaking = false;
		},
		resume() {}
	};
	vi.stubGlobal('speechSynthesis', synth);
	vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
}

const withVerses: EventCardVM = {
	...card,
	verses: [
		{ title: '중심', cite: '창세기 28 : 14', w: '네 자손이 땅의 티끌 같이 되어' },
		{ title: '사랑', cite: '요한복음 3 : 16', w: '하나님이 세상을 이처럼 사랑하사' }
	]
};

describe('EventSection — 전체 듣기', () => {
	beforeEach(() => {
		spoken.length = 0;
		installFakeSynth();
	});
	afterEach(() => vi.unstubAllGlobals());

	it('offers 전체 듣기 for an event with verses', () => {
		render(EventSection, { props: { events: [withVerses] } });
		expect(
			screen.getByRole('button', { name: '11월 암송 데이 전체 듣기' })
		).toBeInTheDocument();
	});

	// Absent rather than offered and then failing.
	it('offers nothing when the platform does not speak', () => {
		vi.unstubAllGlobals();
		render(EventSection, { props: { events: [withVerses] } });
		expect(screen.queryByRole('button', { name: /전체 듣기/ })).toBeNull();
	});

	it('offers nothing for an event with no verses', () => {
		render(EventSection, { props: { events: [{ ...withVerses, verses: [] }] } });
		expect(screen.queryByRole('button', { name: /전체 듣기/ })).toBeNull();
	});

	it('tapping it speaks and raises the bar', async () => {
		render(EventSection, { props: { events: [withVerses] } });
		await fireEvent.click(screen.getByRole('button', { name: '11월 암송 데이 전체 듣기' }));
		expect(spoken).toHaveLength(1);
		expect(screen.getByRole('button', { name: '재생 닫기' })).toBeInTheDocument();
		expect(screen.getByText('창세기 28 : 14')).toBeInTheDocument();
	});

	it('the header button becomes a stop while its own list is open', async () => {
		render(EventSection, { props: { events: [withVerses] } });
		await fireEvent.click(screen.getByRole('button', { name: '11월 암송 데이 전체 듣기' }));
		expect(
			screen.getByRole('button', { name: '11월 암송 데이 듣기 정지' })
		).toBeInTheDocument();
	});

	it('tapping the stop puts the bar away', async () => {
		render(EventSection, { props: { events: [withVerses] } });
		await fireEvent.click(screen.getByRole('button', { name: '11월 암송 데이 전체 듣기' }));
		await fireEvent.click(screen.getByRole('button', { name: '11월 암송 데이 듣기 정지' }));
		expect(screen.queryByRole('button', { name: '재생 닫기' })).toBeNull();
	});
});
