import { describe, expect, it } from 'vitest';
import {
	isSpeechSupported,
	joinSpoken,
	speechErrorMessage,
	splitTranscript
} from '../../src/lib/memorize/speech';

describe('splitTranscript', () => {
	// Interim chunks are replaced wholesale by the next result. Committing one
	// would duplicate every phrase as it firms up, so they are kept apart.
	it('separates settled text from the tail still being revised', () => {
		expect(
			splitTranscript([
				{ transcript: '그들에게 율례와 ', isFinal: true },
				{ transcript: '법도를 가르쳐', isFinal: false }
			])
		).toEqual({ final: '그들에게 율례와', interim: '법도를 가르쳐' });
	});

	it('joins several settled chunks in order', () => {
		expect(
			splitTranscript([
				{ transcript: '그들에게 ', isFinal: true },
				{ transcript: '율례와 법도를', isFinal: true }
			]).final
		).toBe('그들에게 율례와 법도를');
	});

	it('is empty for no results', () => {
		expect(splitTranscript([])).toEqual({ final: '', interim: '' });
	});
});

describe('joinSpoken', () => {
	// Dictation adds to the attempt rather than replacing it, so a reader can
	// type what they are sure of and speak the rest.
	it('appends speech to what was already there', () => {
		expect(joinSpoken('그들에게 율례와', '법도를 가르쳐서')).toBe(
			'그들에게 율례와 법도를 가르쳐서'
		);
	});

	it('joins with exactly one space however the sides are padded', () => {
		expect(joinSpoken('그들에게  ', '  율례와')).toBe('그들에게 율례와');
	});

	it('adds no space when either side is empty', () => {
		expect(joinSpoken('', '그들에게')).toBe('그들에게');
		expect(joinSpoken('그들에게', '')).toBe('그들에게');
		expect(joinSpoken('', '')).toBe('');
	});
});

describe('speechErrorMessage', () => {
	// The reader gets told what to do about it; a spec identifier tells them
	// nothing.
	it('explains the codes a reader can act on', () => {
		expect(speechErrorMessage('not-allowed')).toContain('권한');
		expect(speechErrorMessage('no-speech')).toContain('소리');
		expect(speechErrorMessage('audio-capture')).toContain('마이크');
	});

	it('falls back rather than leaking an unknown code', () => {
		const msg = speechErrorMessage('some-future-code');
		expect(msg).toBe('음성 인식에 실패했습니다');
		expect(msg).not.toContain('some-future-code');
	});
});

describe('isSpeechSupported', () => {
	// jsdom ships no SpeechRecognition, which is exactly the Firefox case: the
	// control has to be absent rather than present and broken.
	it('reports false where the API is missing', () => {
		expect(isSpeechSupported()).toBe(false);
	});

	it('reports true once the prefixed constructor exists', () => {
		const w = window as unknown as Record<string, unknown>;
		w.webkitSpeechRecognition = class {};
		try {
			expect(isSpeechSupported()).toBe(true);
		} finally {
			delete w.webkitSpeechRecognition;
		}
	});
});
