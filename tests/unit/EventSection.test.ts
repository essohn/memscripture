import { render, screen, fireEvent } from '@testing-library/svelte';
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
	stats: { total: 5, perfect: 0, start: [0, 0, 0, 0, 0], full: [0, 0, 0, 0, 0] },
	verses: []
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

// A second, distinctly-titled event with its own verses — for proving the
// section raises exactly one bar, not one per event.
const withVersesB: EventCardVM = {
	...card,
	eventId: 'e2',
	eventTitle: '12월 암송 데이',
	verses: [
		{ title: '소망', cite: '로마서 8 : 28', w: '우리가 알거니와 하나님을 사랑하는 자 곧' },
		{ title: '믿음', cite: '히브리서 11 : 1', w: '믿음은 바라는 것들의 실상이요' }
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
		// Unstubbing is not enough on its own: tests/unit/setup.ts installs a
		// global speechSynthesis so route components can reach for one at module
		// scope, and support is read as `'speechSynthesis' in window` — the key
		// has to be gone, not merely undefined, for the platform to look mute.
		// setup.ts defines it configurable, and the next case's beforeEach stubs
		// it back, so the deletion cannot leak past this test.
		const restore = Object.getOwnPropertyDescriptor(globalThis, 'speechSynthesis');
		delete (globalThis as { speechSynthesis?: unknown }).speechSynthesis;
		try {
			render(EventSection, { props: { events: [withVerses] } });
			expect(screen.queryByRole('button', { name: /전체 듣기/ })).toBeNull();
		} finally {
			if (restore) Object.defineProperty(globalThis, 'speechSynthesis', restore);
		}
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
		// `index` arrives 1-based, not 0-based, for the two-verse fixture.
		expect(screen.getByText('1/2')).toBeInTheDocument();
		// listRepeat defaults on — proves `repeat` is wired to player.listRepeat.
		expect(screen.getByRole('button', { name: '목록 반복' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
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

	it('starting a second event hands the one bar off — not one per event', async () => {
		render(EventSection, { props: { events: [withVerses, withVersesB] } });
		await fireEvent.click(screen.getByRole('button', { name: '11월 암송 데이 전체 듣기' }));
		expect(screen.getByText('창세기 28 : 14')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: '12월 암송 데이 전체 듣기' }));

		// The plural query is the point: there must be exactly one bar, hence
		// exactly one close button, even with a second event now playing.
		expect(screen.getAllByRole('button', { name: '재생 닫기' })).toHaveLength(1);
		expect(
			screen.getByRole('button', { name: '11월 암송 데이 전체 듣기' })
		).toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: '12월 암송 데이 듣기 정지' })
		).toBeInTheDocument();
		expect(screen.getByText('로마서 8 : 28')).toBeInTheDocument();
		expect(screen.queryByText('창세기 28 : 14')).toBeNull();
	});
});

describe('EventSection header players', () => {
	const withVerses: EventCardVM = {
		...card,
		verses: [{ cite: '창세기 28 : 14', w: '네 자손이 땅의 티끌 같이 되어' }]
	};

	beforeEach(async () => {
		await db.delete();
		await db.open();
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

	it('offers 따라 읽기 beside 전체 듣기', () => {
		render(EventSection, { props: { events: [withVerses] } });
		expect(screen.getByLabelText(/전체 듣기/)).toBeInTheDocument();
		expect(screen.getByLabelText(/따라 읽기/)).toBeInTheDocument();
	});

	/*
	 * The quiz kept its full-width button under the stats on the home page.
	 * What went is the unnamed sword icon in this header, which reached the
	 * same screen and which nobody could have guessed at.
	 */
	it('no longer carries the quiz in the header', () => {
		render(EventSection, { props: { events: [withVerses] } });
		expect(screen.queryByLabelText(/퀴즈/)).toBeNull();
	});

	// One synthesizer, so one list at a time: the two buttons must not both
	// read as running.
	it('lights only the player that is actually going', async () => {
		render(EventSection, { props: { events: [withVerses] } });
		await fireEvent.click(screen.getByLabelText(/따라 읽기$/));
		expect(screen.getByLabelText(/따라 읽기 정지/)).toBeInTheDocument();
		expect(screen.queryByLabelText(/듣기 정지/)).toBeNull();
	});
});
