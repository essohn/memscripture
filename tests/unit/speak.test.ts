import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { bodyToSpeech, citeToSpeech, speechSegments } from '../../src/lib/memorize/speak';

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
