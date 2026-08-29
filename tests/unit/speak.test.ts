import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
	bodyToSpeech,
	citeToSpeech,
	createPlayer,
	estimateDurationMs,
	sliceFrom,
	speak,
	totalChars,
	pickKoreanVoice,
	voiceGender,
	speechSegments,
	forgetDeadVoices
} from '../../src/lib/memorize/speak';

describe('citeToSpeech', () => {
	// Every shape present in the shipped corpus, with its count at the time of
	// writing. Read aloud unconverted, the first would be "창세기 이십팔 콜론 십사".
	it.each([
		['창세기 28 : 14', '창세기 28장 14절'], // 1223 verses
		['이사야 54 : 2-3', '이사야 54장 2절에서 3절'], // 239
		['히브리서 11 : 24~26', '히브리서 11장 24절에서 26절'], // 17
		['시편 143 : 8,10', '시편 143편 8절, 10절'], // 6 — Psalms counts in 편
		['고린도전서 12 : 4∼6', '고린도전서 12장 4절에서 6절'], // 5, U+223C
		['역대하 16 : 9상', '역대하 16장 9절 상'], // 3
		['창세기 22 : 12 ', '창세기 22장 12절'] // 2, trailing space
	])('%s → %s', (cite, spoken) => {
		expect(citeToSpeech(cite)).toBe(spoken);
	});

	it('handles a book whose name contains digits', () => {
		expect(citeToSpeech('요한1서 3 : 16')).toBe('요한1서 3장 16절');
	});

	// Korean counts Psalms' chapters in 편. Every other book takes 장, so this
	// is the one exception rather than a table.
	it.each([
		['시편 118 : 13', '시편 118편 13절'],
		['시 23 : 1', '시 23편 1절'],
		['시편 119 : 105', '시편 119편 105절']
	])('%s → %s', (cite, spoken) => {
		expect(citeToSpeech(cite)).toBe(spoken);
	});

	it('leaves every other book on 장', () => {
		expect(citeToSpeech('잠언 3 : 5')).toBe('잠언 3장 5절');
		expect(citeToSpeech('욥기 1 : 1')).toBe('욥기 1장 1절');
	});

	// A hand-typed OYO citation can name anything; 장 is right for 65 of 66.
	it('falls back to 장 for a book it does not know', () => {
		expect(citeToSpeech('토비트 3 : 1')).toBe('토비트 3장 1절');
	});

	// A hand-added OYO verse can cite anything. Flat is fine; "콜론" is not.
	it('falls back without reading the colon aloud', () => {
		expect(citeToSpeech('메모 : 나중에')).not.toContain(':');
	});
});

describe('citeToSpeech across the whole corpus', () => {
	const cites: string[] = [];
	for (const f of readdirSync('static/data')) {
		if (!f.endsWith('_krv.json')) continue;
		const raw: unknown = JSON.parse(readFileSync(`static/data/${f}`, 'utf8'));
		const rows = Array.isArray(raw) ? raw : Object.values(raw as Record<string, unknown>);
		for (const v of rows.flat()) {
			if (v && typeof v === 'object' && 'cite' in v) cites.push(String((v as { cite: string }).cite));
		}
	}

	it('covers every shipped verse', () => {
		expect(cites.length).toBeGreaterThan(1400);
	});

	// The point of the conversion: nothing a synthesizer would name out loud.
	it('leaves no punctuation for the synthesizer to pronounce', () => {
		const offenders = cites
			.map((c) => citeToSpeech(c))
			.filter((s) => /[:~∼\-]/.test(s));
		expect(offenders).toEqual([]);
	});

	it('always states a chapter and a verse', () => {
		const offenders = cites
			.map(citeToSpeech)
			.filter((s) => !(s.includes('장') || s.includes('편')) || !s.includes('절'));
		expect(offenders).toEqual([]);
	});

	// Guards the conversion against the real corpus rather than three examples:
	// every shipped Psalm must be counted in 편, and nothing else may be.
	it('counts every shipped Psalm in 편, and only those', () => {
		const wrong = cites.filter((c) => {
			const spoken = citeToSpeech(c);
			return c.startsWith('시편') ? !spoken.includes('편 ') : spoken.includes('편 ');
		});
		expect(wrong).toEqual([]);
	});
});

describe('bodyToSpeech', () => {
	// 291 of these across the corpus. Read aloud they become "별표" or a stumble.
	it('drops the verse-boundary marker', () => {
		expect(bodyToSpeech('부하게 되느니라 *여름에')).toBe('부하게 되느니라 여름에');
	});

	it('collapses whitespace so a line break is not swallowed', () => {
		expect(bodyToSpeech('갈  길과\n할 일을')).toBe('갈 길과 할 일을');
	});

	it('leaves ordinary text alone', () => {
		expect(bodyToSpeech('네 자손이 땅의 티끌 같이')).toBe('네 자손이 땅의 티끌 같이');
	});
});

describe('speechSegments', () => {
	const verse = { title: '양  육', cite: '출애굽기 18 : 20', w: '그들에게 율례와 법도를' };

	// Reference first, then the text — and as separate utterances so the
	// synthesizer puts a real pause between them.
	it('reads the reference before the body', () => {
		expect(speechSegments(verse)).toEqual(['출애굽기 18장 20절', '그들에게 율례와 법도를']);
	});

	// The title is a topical label, not scripture, so it is opt-in.
	it('omits the title unless asked', () => {
		expect(speechSegments(verse).some((s) => s.includes('양'))).toBe(false);
	});

	it('puts the title first when asked, with its layout padding collapsed', () => {
		expect(speechSegments(verse, { includeTitle: true })[0]).toBe('양 육');
	});

	it('skips an empty body rather than speaking silence', () => {
		expect(speechSegments({ ...verse, w: '  ' })).toEqual(['출애굽기 18장 20절']);
	});
});

describe('pickKoreanVoice', () => {
	// The real macOS list, in the order the platform reports it. Eight character
	// voices sort ahead of the narration one, so leaving the choice to the
	// platform is how scripture ends up read by "Grandpa".
	const MACOS = [
		'Eddy (Korean (South Korea))',
		'Flo (Korean (South Korea))',
		'Grandma (Korean (South Korea))',
		'Grandpa (Korean (South Korea))',
		'Reed (Korean (South Korea))',
		'Rocko (Korean (South Korea))',
		'Sandy (Korean (South Korea))',
		'Shelley (Korean (South Korea))',
		'Yuna',
		'Google 한국의'
	].map((name) => ({ name, lang: 'ko-KR' }));

	it('picks the neural network voice over every local one', () => {
		expect(pickKoreanVoice(MACOS)?.name).toBe('Google 한국의');
	});

	it('falls back to the narration voice, never a character one', () => {
		const noNetwork = MACOS.filter((v) => !v.name.startsWith('Google'));
		expect(pickKoreanVoice(noNetwork)?.name).toBe('Yuna');
	});

	it('prefers a Natural/Neural voice where one exists', () => {
		const edge = [
			{ name: 'Microsoft SunHi Online (Natural) - Korean (Korea)', lang: 'ko-KR' },
			{ name: 'Google 한국의', lang: 'ko-KR' }
		];
		expect(pickKoreanVoice(edge)?.name).toContain('SunHi');
	});

	it('honours an explicit choice', () => {
		expect(pickKoreanVoice(MACOS, { wanted: 'Yuna' })?.name).toBe('Yuna');
	});

	// Voices come and go with OS updates. A stale name must not mean silence.
	it('falls back to the ranking when the chosen voice is gone', () => {
		expect(pickKoreanVoice(MACOS, { wanted: 'Yuna Premium (removed)' })?.name).toBe('Google 한국의');
	});

	it('ignores voices of other languages', () => {
		expect(pickKoreanVoice([{ name: 'Samantha', lang: 'en-US' }])).toBeNull();
	});

	it('returns null when nothing Korean is installed', () => {
		expect(pickKoreanVoice([])).toBeNull();
	});
});

describe('voice gender', () => {
	// The API reports no gender, so this is a table of the voices the three
	// platforms actually ship. An unknown name says so rather than guessing.
	it.each([
		['Yuna', 'female'],
		['Google 한국의', 'female'],
		['Microsoft SunHi Online (Natural) - Korean (Korea)', 'female'],
		['Microsoft InJoon Online (Natural) - Korean (Korea)', 'male'],
		['Reed (Korean (South Korea))', 'male'],
		['Rocko (Korean (South Korea))', 'male'],
		['Grandpa (Korean (South Korea))', 'male'],
		['Grandma (Korean (South Korea))', 'female']
	])('%s is %s', (name, gender) => {
		expect(voiceGender(name)).toBe(gender);
	});

	it('admits when it does not know a voice', () => {
		expect(voiceGender('Some Future Voice')).toBeNull();
	});
});

describe('picking by gender', () => {
	const MACOS = [
		'Eddy (Korean (South Korea))',
		'Grandpa (Korean (South Korea))',
		'Reed (Korean (South Korea))',
		'Rocko (Korean (South Korea))',
		'Yuna',
		'Google 한국의'
	].map((name) => ({ name, lang: 'ko-KR' }));

	// On macOS every male Korean voice is one of Apple's character voices, so
	// asking for male means picking the best of those — not the first listed.
	it('picks the best male voice, not merely the first', () => {
		expect(pickKoreanVoice(MACOS, { gender: 'male' })?.name).toContain('Reed');
	});

	it('picks the neural voice when female is asked for', () => {
		expect(pickKoreanVoice(MACOS, { gender: 'female' })?.name).toBe('Google 한국의');
	});

	it('prefers a neural male voice over a character one', () => {
		const edge = [
			{ name: 'Microsoft InJoon Online (Natural) - Korean (Korea)', lang: 'ko-KR' },
			{ name: 'Reed (Korean (South Korea))', lang: 'ko-KR' }
		];
		expect(pickKoreanVoice(edge, { gender: 'male' })?.name).toContain('InJoon');
	});

	// No voice at all is worse than the wrong gender.
	it('falls back rather than going silent when the gender is unavailable', () => {
		const femaleOnly = [{ name: 'Google 한국의', lang: 'ko-KR' }];
		expect(pickKoreanVoice(femaleOnly, { gender: 'male' })?.name).toBe('Google 한국의');
	});

	it('lets an explicit choice override the gender preference', () => {
		expect(pickKoreanVoice(MACOS, { wanted: 'Yuna', gender: 'male' })?.name).toBe('Yuna');
	});
});


describe('estimateDurationMs', () => {
	// Chrome reports real boundary events; iOS Safari fires none, so without an
	// estimate the bar would sit still through the whole verse there.
	it('scales with the number of spoken characters', () => {
		expect(estimateDurationMs('가'.repeat(55), 1)).toBe(10_000);
	});

	it('ignores whitespace, which is not spoken', () => {
		expect(estimateDurationMs('가 나 다', 1)).toBe(estimateDurationMs('가나다', 1));
	});

	it('takes longer at a slower rate', () => {
		expect(estimateDurationMs('가'.repeat(55), 0.5)).toBeGreaterThan(
			estimateDurationMs('가'.repeat(55), 1)
		);
	});

	it('is zero for nothing to say', () => {
		expect(estimateDurationMs('   ', 1)).toBe(0);
	});
});

describe('sliceFrom', () => {
	const SCRIPT = ['창세기 28장 14절', '네 자손이 땅의 티끌'];

	it('returns everything from the start', () => {
		expect(sliceFrom(SCRIPT, 0)).toEqual(SCRIPT);
	});

	// Landing mid-word plays that word rather than skipping it, and never
	// begins mid-syllable.
	it('snaps back to the start of the word it lands in', () => {
		const offset = SCRIPT[0].length + '네 자손'.length;
		expect(sliceFrom(SCRIPT, offset)[0]).toBe('자손이 땅의 티끌');
	});

	it('drops the segments already spoken', () => {
		expect(sliceFrom(SCRIPT, SCRIPT[0].length)).toEqual(['네 자손이 땅의 티끌']);
	});

	it('is empty past the end', () => {
		expect(sliceFrom(SCRIPT, 999)).toEqual([]);
	});

	it('counts the whole script for the progress fraction', () => {
		expect(totalChars(SCRIPT)).toBe(SCRIPT[0].length + SCRIPT[1].length);
	});
});

// ─── Global queue ownership ─────────────────────────────────────────────────

/** The slice of the Web Speech API createPlayer touches. jsdom ships none of
 *  it, and a real one cannot be driven from a test. */
class FakeUtterance {
	text: string;
	lang = '';
	rate = 1;
	voice: unknown = null;
	onstart: (() => void) | null = null;
	onend: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onboundary: ((e: { charIndex: number }) => void) | null = null;
	constructor(text: string) {
		this.text = text;
	}
}

function installFakeSynth() {
	let current: FakeUtterance | null = null;
	const spoken: FakeUtterance[] = [];
	const synth = {
		speaking: false,
		pending: false,
		paused: false,
		getVoices: () => [{ name: 'Google 한국의', lang: 'ko-KR' }],
		speak(u: FakeUtterance) {
			current = u;
			spoken.push(u);
			synth.speaking = true;
			// A working voice says so. Without this the fake is indistinguishable
			// from one that takes an utterance and never speaks it, which is a
			// real failure the player now watches for.
			u.onstart?.();
		},
		// Chrome fires the current utterance's `end` on cancel. That is the
		// behaviour the ownership fix exists for, so the fake reproduces it.
		cancel() {
			const u = current;
			current = null;
			synth.speaking = false;
			u?.onend?.();
		},
		resume() {}
	};
	vi.stubGlobal('speechSynthesis', synth);
	vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
	return { synth, spoken };
}

/**
 * A synthesizer where some voices take an utterance and never speak it.
 *
 * That is the failure this file could not previously see: no sound, no error,
 * `speaking` true, and not one event. A fake that always fires `start` models
 * the API but not the platform, and green-lights code that cannot tell a
 * working voice from a dead one.
 */
function installVoiceSynth(dead: string[]) {
	const spoken: FakeUtterance[] = [];
	let current: FakeUtterance | null = null;
	const voices = [
		{ name: 'Google 한국의', lang: 'ko-KR', localService: false },
		{ name: 'Yuna', lang: 'ko-KR', localService: true }
	];
	const synth = {
		speaking: false,
		pending: false,
		paused: false,
		getVoices: () => voices,
		speak(u: FakeUtterance) {
			current = u;
			spoken.push(u);
			synth.speaking = true;
			// '' stands for the platform's own default — the last thing the
			// player tries once every named voice has been written off.
			const name = (u.voice as { name: string } | null)?.name ?? '';
			// The whole point: accepted, and then nothing. No start, no end, no
			// error — exactly what a network voice does when it cannot fetch.
			if (dead.includes(name)) return;
			u.onstart?.();
		},
		cancel() {
			const u = current;
			current = null;
			synth.speaking = false;
			u?.onend?.();
		},
		resume() {}
	};
	vi.stubGlobal('speechSynthesis', synth);
	vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
	return { synth, spoken };
}

const voiceOf = (u: FakeUtterance) => (u.voice as { name: string } | null)?.name ?? null;

describe('a voice that takes an utterance and never speaks it', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
		forgetDeadVoices();
	});

	/*
	 * `Google 한국의` is a network voice — localService false — and it outranks
	 * every local one because neural voices sound better. When its fetch fails
	 * it does not error; it goes quiet. On Android that left 전체 듣기 silent
	 * with a progress bar running to the end, on a phone whose TTS worked in
	 * every other app.
	 */
	it('stops waiting on it and tries another voice', () => {
		const { spoken } = installVoiceSynth(['Google 한국의']);
		createPlayer(['가나다라마바사'], {});
		expect(spoken.map(voiceOf)).toEqual(['Google 한국의']);
		vi.advanceTimersByTime(4000);
		expect(spoken.map(voiceOf)).toEqual(['Google 한국의', 'Yuna']);
	});

	// Once a voice has proven dead it must not be picked again — 149 verses
	// each waiting on the same silent voice is not playback, it is a hang.
	it('does not go back to a voice that already failed', () => {
		const { spoken } = installVoiceSynth(['Google 한국의']);
		createPlayer(['가나다라마바사', '아자차카타파하'], {});
		vi.advanceTimersByTime(4000);
		spoken.length = 0;
		createPlayer(['하나둘셋넷'], {});
		expect(spoken.map(voiceOf)).toEqual(['Yuna']);
	});

	/*
	 * The bar was the reason this went two days undiagnosed. `byClock` carries
	 * it on wall-clock time so that iOS, which fires no boundary events, still
	 * shows movement — but it ran just as happily when nothing was being
	 * spoken, and finish() reports a full bar. A silent failure therefore drew
	 * exactly what a completed playlist draws.
	 */
	it('never draws a finished bar for a script that made no sound', () => {
		// Including '': not one voice on this device speaks, the platform's own
		// default included, so there is nothing left to fall back to.
		installVoiceSynth(['Google 한국의', 'Yuna', '']);
		const onProgress = vi.fn();
		const onFailure = vi.fn();
		createPlayer(['가나다라마바사'], { onProgress, onFailure });
		vi.advanceTimersByTime(30_000);
		expect(onFailure).toHaveBeenCalled();
		expect(onProgress.mock.calls.some(([p]) => p.fraction === 1)).toBe(false);
	});

	it('leaves a voice that actually speaks alone', () => {
		const { spoken } = installVoiceSynth([]);
		createPlayer(['가나다라마바사'], {});
		vi.advanceTimersByTime(30_000);
		expect(spoken.map(voiceOf)).toEqual(['Google 한국의']);
	});
});

describe('a silence before a segment', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
		forgetDeadVoices();
	});

	// '장절' is two characters, so the body begins at offset 2.
	const gapOnBody = (_text: string, offset: number) => (offset === 2 ? 1000 : 0);

	it('holds the segment back for as long as it was asked to', () => {
		const { spoken } = installVoiceSynth([]);
		createPlayer(['장절', '본문'], { gapBefore: gapOnBody });
		expect(spoken.map((u) => u.text)).toEqual(['장절']);
		spoken[0].onend?.();
		expect(spoken.map((u) => u.text)).toEqual(['장절']);
		vi.advanceTimersByTime(1000);
		expect(spoken.map((u) => u.text)).toEqual(['장절', '본문']);
	});

	// The bar has no characters to follow through a silence, so it says what is
	// happening instead of looking stuck.
	it('reports that it is waiting, and stops when the verse begins', () => {
		const { spoken } = installVoiceSynth([]);
		const onProgress = vi.fn();
		createPlayer(['장절', '본문'], { onProgress, gapBefore: gapOnBody });
		spoken[0].onend?.();
		onProgress.mockClear();
		vi.advanceTimersByTime(400);
		expect(onProgress.mock.calls.at(-1)?.[0].waiting).toBe(true);
		vi.advanceTimersByTime(1000);
		expect(onProgress.mock.calls.at(-1)?.[0].waiting).toBe(false);
	});

	/*
	 * A silence with nothing moving on screen is indistinguishable from a
	 * player that has died — which is exactly the reading this app gave an
	 * Android user this morning. The bar cannot advance through it, because the
	 * script has not moved, so the countdown is its own measure.
	 */
	it('counts the silence down while it runs', () => {
		const { spoken } = installVoiceSynth([]);
		const onProgress = vi.fn();
		createPlayer(['장절', '본문'], { onProgress, gapBefore: gapOnBody });
		spoken[0].onend?.();
		vi.advanceTimersByTime(400);
		expect(onProgress.mock.calls.at(-1)?.[0].waitFraction).toBeCloseTo(0.4, 1);
		vi.advanceTimersByTime(400);
		expect(onProgress.mock.calls.at(-1)?.[0].waitFraction).toBeCloseTo(0.8, 1);
	});

	it('has nothing to count once the verse begins', () => {
		const { spoken } = installVoiceSynth([]);
		const onProgress = vi.fn();
		createPlayer(['장절', '본문'], { onProgress, gapBefore: gapOnBody });
		spoken[0].onend?.();
		vi.advanceTimersByTime(1400);
		expect(onProgress.mock.calls.at(-1)?.[0].waitFraction).toBe(0);
	});

	it('leaves a segment with no gap alone', () => {
		const { spoken } = installVoiceSynth([]);
		createPlayer(['장절', '본문'], {});
		spoken[0].onend?.();
		expect(spoken.map((u) => u.text)).toEqual(['장절', '본문']);
	});

	// A silence is a stretch of playback like any other: closing the bar during
	// one must not have the verse arrive a second later out of nowhere.
	it('does not speak after being stopped mid-silence', () => {
		const { spoken } = installVoiceSynth([]);
		const player = createPlayer(['장절', '본문'], { gapBefore: gapOnBody });
		spoken[0].onend?.();
		player?.stop();
		vi.advanceTimersByTime(3000);
		expect(spoken.map((u) => u.text)).toEqual(['장절']);
	});
});

describe('the bar against the segment being spoken', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
		forgetDeadVoices();
	});

	/*
	 * byClock exists so iOS, which fires no boundary events, still shows
	 * movement — it divides wall-clock time by an estimate of the whole script.
	 * An estimate is all it is, and the moment real time outruns it the bar
	 * claims ground the voice has not covered: with 따라 읽기's silences the
	 * clock runs at better than twice the estimate, and the title line was
	 * naming a verse two or three ahead of the one being read.
	 *
	 * Whatever the clock believes, playback cannot be further along than the
	 * end of the segment on the queue.
	 */
	it('never reports past the end of the segment on the queue', () => {
		installVoiceSynth([]);
		const onProgress = vi.fn();
		// Four characters in two segments, so the first ends at exactly half.
		createPlayer(['장절', '본문'], { onProgress });
		vi.advanceTimersByTime(60_000);
		expect(onProgress.mock.calls.at(-1)?.[0].fraction).toBeLessThanOrEqual(0.5);
	});

	// And the runtime it reports has to include the silences, or the bar counts
	// up past its own total on every verse.
	it('counts the silences in the runtime', () => {
		installVoiceSynth([]);
		const onProgress = vi.fn();
		createPlayer(['장절', '본문'], {
			onProgress,
			gapBefore: (_text, offset) => (offset === 2 ? 5000 : 0)
		});
		vi.advanceTimersByTime(300);
		const withGap = onProgress.mock.calls.at(-1)?.[0].totalMs;

		onProgress.mockClear();
		createPlayer(['장절', '본문'], { onProgress });
		vi.advanceTimersByTime(300);
		const without = onProgress.mock.calls.at(-1)?.[0].totalMs;

		expect(withGap).toBe(without + 5000);
	});
});

describe('pickKoreanVoice exclusions', () => {
	const VOICES = [
		{ name: 'Google 한국의', lang: 'ko-KR' },
		{ name: 'Yuna', lang: 'ko-KR' }
	];

	it('passes over an excluded voice', () => {
		expect(pickKoreanVoice(VOICES, { exclude: new Set(['Google 한국의']) })?.name).toBe('Yuna');
	});

	// A stale explicit choice must not resurrect a voice known to be silent.
	it('will not honour a wanted voice that is excluded', () => {
		const picked = pickKoreanVoice(VOICES, {
			wanted: 'Google 한국의',
			exclude: new Set(['Google 한국의'])
		});
		expect(picked?.name).toBe('Yuna');
	});

	it('returns null when every Korean voice is excluded', () => {
		expect(pickKoreanVoice(VOICES, { exclude: new Set(['Google 한국의', 'Yuna']) })).toBeNull();
	});
});

describe('global queue ownership', () => {
	beforeEach(() => installFakeSynth());
	afterEach(() => vi.unstubAllGlobals());

	it('a new player relieves the previous one, which reports its end once', () => {
		const onEnd = vi.fn();
		const first = createPlayer(['가나다라마바사'], { onEnd });
		expect(first).not.toBeNull();

		const second = createPlayer(['아자차카타파하'], {});
		expect(second).not.toBeNull();

		expect(onEnd).toHaveBeenCalledTimes(1);
		second?.stop();
	});

	// The bug this exists for: the relieved player must not treat being
	// cancelled as "the verse finished" and start itself again.
	it('a repeating player does not restart when another takes the queue', () => {
		const { spoken } = installFakeSynth();
		const first = createPlayer(['가나다라마바사'], { repeat: true });
		const spokenAfterFirst = spoken.length;
		const second = createPlayer(['아자차카타파하'], {});
		// Exactly one new utterance — the second player's. A restart would have
		// added the first player's script back on top.
		expect(spoken.length).toBe(spokenAfterFirst + 1);
		expect(spoken[spoken.length - 1].text).toBe('아자차카타파하');
		first?.stop();
		second?.stop();
	});

	it('stopping a relieved player does not unregister its successor', () => {
		const first = createPlayer(['가나다라마바사'], {});
		const secondEnd = vi.fn();
		const second = createPlayer(['아자차카타파하'], { onEnd: secondEnd });
		first?.stop();
		expect(secondEnd).not.toHaveBeenCalled();
		second?.stop();
	});

	it('speak() also relieves a running player', () => {
		const onEnd = vi.fn();
		const player = createPlayer(['가나다라마바사'], { onEnd });
		void player;
		speak(['짧은 문장']);
		expect(onEnd).toHaveBeenCalledTimes(1);
	});

	// Seeking cancels to move position. The outgoing utterance's onend must
	// not be read as "the list finished" and loop the reader back to zero.
	it('seeking a repeating player moves there rather than back to the start', () => {
		const { spoken } = installFakeSynth();
		// A space partway through: sliceFrom snaps a seek to a word start, so
		// without one to snap to the offset always collapses back to 0 and this
		// test could not tell a real seek from a restart.
		const player = createPlayer(['가나다라마바사 아자차카타파하'], { repeat: true });
		const before = spoken.length;
		player?.seek(0.5);
		// One new utterance for the seek, and it is not the whole script again.
		expect(spoken.length).toBe(before + 1);
		expect(spoken[spoken.length - 1].text).not.toBe('가나다라마바사 아자차카타파하');
		player?.stop();
	});

	// claimSynth's two lines must run in the order the file's comment says:
	// register the new owner, *then* relieve the old one. Reversing them
	// leaves every other test in this block passing — the old owner's own
	// release re-nulls activeStop, and the assignment after it re-sets the
	// same value either way — so this is the one test load-bearing on the
	// order itself. It is built to fail if the two lines are swapped, and was
	// verified to do so by swapping them locally and watching it fail.
	it('a claim that arrives while a relief is still in flight is not clobbered by it', () => {
		const { spoken } = installFakeSynth();
		const thirdEnd = vi.fn();
		// A holder rather than a bare `let`: the assignment happens inside
		// first's onEnd closure below, and TypeScript does not carry that
		// reassignment's type back out to the read at the bottom of this test.
		const holder: { third: ReturnType<typeof createPlayer> } = { third: null };
		const first = createPlayer(['가나다라마바사'], {
			// Fires synchronously from inside second's own claimSynth call —
			// second has claimed the queue but not yet started playFrom(0) —
			// so third's claim lands while second's claim is still unwinding.
			onEnd: () => {
				holder.third = createPlayer(['고노도로모보소'], { onEnd: thirdEnd });
			}
		});
		void first;
		const second = createPlayer(['아자차카타파하'], {});
		// Only first's script and third's were ever spoken. second was
		// relieved by third before its own playFrom(0) ran, so it never
		// reached the synth — a third entry here would mean second clobbered
		// third's claim and got to speak anyway.
		expect(spoken.map((u) => u.text)).toEqual(['가나다라마바사', '고노도로모보소']);
		// second was already relieved, so stopping it now must be a no-op —
		// in particular it must not reach back into third's synth.cancel().
		second?.stop();
		expect(thirdEnd).not.toHaveBeenCalled();
		holder.third?.stop();
	});
});

// ─── Keepalive ──────────────────────────────────────────────────────────────

// Real utterances never end naturally under the fakes above (no timers drive
// them), so this is the one place that can honestly exercise the nudge: fake
// timers stand in for the 10-second cadence, and the assertion is on
// synth.resume() being called, not on an utterance's onend firing.
describe('createPlayer keepalive', () => {
	beforeEach(() => {
		installFakeSynth();
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('resumes the synth every 10 seconds so Chrome does not drop a long utterance', () => {
		const synth = window.speechSynthesis as unknown as {
			speaking: boolean;
			paused: boolean;
			resume: () => void;
		};
		synth.resume = vi.fn();
		const player = createPlayer(['가나다라마바사'], {});
		expect(player).not.toBeNull();
		// speak() on the fake sets `speaking = true` synchronously, matching a
		// real synth mid-utterance.
		expect(synth.speaking).toBe(true);

		vi.advanceTimersByTime(10_000);
		expect(synth.resume).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(10_000);
		expect(synth.resume).toHaveBeenCalledTimes(2);

		player?.stop();
	});

	it('stops nudging once stopped, so it never reaches a synth a successor now owns', () => {
		const synth = window.speechSynthesis as unknown as {
			resume: () => void;
		};
		synth.resume = vi.fn();
		const player = createPlayer(['가나다라마바사'], {});
		player?.stop();

		vi.advanceTimersByTime(30_000);
		expect(synth.resume).not.toHaveBeenCalled();
	});
});

describe('createPlayer speaks one segment at a time', () => {
	afterEach(() => vi.unstubAllGlobals());

	// The whole remainder used to go to the platform as one utterance. On the
	// shipped 암송 DAY that is 149 verses and ~12,000 characters, and Chrome
	// simply never starts one that size — no start, no error, `speaking` stuck
	// true — so 전체 듣기 was silent and the engine was left wedged for
	// everything after it. iOS happened to tolerate it, which is luck, not a
	// contract. speak() has always chained per segment; so does this now.
	it('does not hand the platform the whole script at once', () => {
		const { spoken } = installFakeSynth();
		createPlayer(['가나다', '라마바', '사아자'], {});
		expect(spoken).toHaveLength(1);
		expect(spoken[0].text).toBe('가나다');
	});

	it('chains to the next segment when one ends', () => {
		const { spoken } = installFakeSynth();
		createPlayer(['가나다', '라마바'], {});
		spoken[0].onend?.();
		expect(spoken.map((u) => u.text)).toEqual(['가나다', '라마바']);
	});

	it('reports the end of the script only after the last segment', () => {
		const onEnd = vi.fn();
		const { spoken } = installFakeSynth();
		createPlayer(['가나다', '라마바'], { onEnd });
		spoken[0].onend?.();
		expect(onEnd).not.toHaveBeenCalled();
		spoken[1].onend?.();
		expect(onEnd).toHaveBeenCalledTimes(1);
	});

	// Repeat has to mean the whole script again, not the segment that just
	// ended — the bug that made a dying engine loop verse one forever.
	it('repeats from the first segment', () => {
		const { spoken } = installFakeSynth();
		createPlayer(['가나다', '라마바'], { repeat: true });
		spoken[0].onend?.();
		spoken[1].onend?.();
		expect(spoken[2].text).toBe('가나다');
	});

	it('starts a seek in the segment the fraction lands in', () => {
		const { spoken } = installFakeSynth();
		const player = createPlayer(['가나다', '라마바'], {});
		player?.seek(0.5);
		expect(spoken[spoken.length - 1].text).toBe('라마바');
	});
});

// Android ships Korean voices whose lang the app does not always recognise —
// a reader with 한국어 installed and working in the system settings saw an
// empty picker and silence. Whatever the tagging, the reader can read the
// names on their own device, and an explicit choice is an instruction rather
// than a hint.
describe('pickKoreanVoice — an explicit choice outranks the sniffing', () => {
	// An empty lang, which some Android engines report for a voice that is
	// installed and works. /^ko/ has nothing to match on.
	const ODD = { name: 'Korean Korea (South) 1', lang: '', localService: true };
	const KO = { name: 'Yuna', lang: 'ko-KR', localService: true };
	const EN = { name: 'Daniel', lang: 'en-GB', localService: true };

	it('honours a voice the lang filter would have dropped', () => {
		expect(pickKoreanVoice([EN, ODD], { wanted: ODD.name })?.name).toBe(ODD.name);
	});

	it('honours it even when a recognised Korean voice is also installed', () => {
		expect(pickKoreanVoice([KO, EN], { wanted: EN.name })?.name).toBe(EN.name);
	});

	// A voice already found silent must not come back, explicit or not.
	it('still refuses one already known to be silent', () => {
		const picked = pickKoreanVoice([KO, EN], {
			wanted: EN.name,
			exclude: new Set([EN.name])
		});
		expect(picked?.name).toBe(KO.name);
	});

	// A name that is no longer installed falls back to the ranking rather than
	// to silence — voices come and go with OS updates.
	it('falls back when the chosen voice has gone', () => {
		expect(pickKoreanVoice([KO], { wanted: 'Vanished' })?.name).toBe(KO.name);
	});

	// With nothing chosen it is the same function it always was.
	it('picks a Korean voice when no choice was made', () => {
		expect(pickKoreanVoice([EN, KO])?.name).toBe(KO.name);
		expect(pickKoreanVoice([EN])).toBeNull();
	});
});
