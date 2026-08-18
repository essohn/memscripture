import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
	bodyToSpeech,
	citeToSpeech,
	pickKoreanVoice,
	voiceGender,
	speechSegments
} from '../../src/lib/memorize/speak';

describe('citeToSpeech', () => {
	// Every shape present in the shipped corpus, with its count at the time of
	// writing. Read aloud unconverted, the first would be "창세기 이십팔 콜론 십사".
	it.each([
		['창세기 28 : 14', '창세기 28장 14절'], // 1223 verses
		['이사야 54 : 2-3', '이사야 54장 2절에서 3절'], // 239
		['히브리서 11 : 24~26', '히브리서 11장 24절에서 26절'], // 17
		['시편 143 : 8,10', '시편 143장 8절, 10절'], // 6
		['고린도전서 12 : 4∼6', '고린도전서 12장 4절에서 6절'], // 5, U+223C
		['역대하 16 : 9상', '역대하 16장 9절 상'], // 3
		['창세기 22 : 12 ', '창세기 22장 12절'] // 2, trailing space
	])('%s → %s', (cite, spoken) => {
		expect(citeToSpeech(cite)).toBe(spoken);
	});

	it('handles a book whose name contains digits', () => {
		expect(citeToSpeech('요한1서 3 : 16')).toBe('요한1서 3장 16절');
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
		const offenders = cites.map(citeToSpeech).filter((s) => !s.includes('장') || !s.includes('절'));
		expect(offenders).toEqual([]);
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

