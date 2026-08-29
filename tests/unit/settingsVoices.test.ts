import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import Settings from '../../src/routes/settings/+page.svelte';

vi.mock('$app/navigation', async () => ({
	...(await vi.importActual<Record<string, unknown>>('$app/navigation')),
	goto: vi.fn()
}));

type V = { name: string; lang: string; localService: boolean };

/** A speech engine that reports exactly these voices. */
function withVoices(voices: V[]) {
	vi.stubGlobal('speechSynthesis', {
		getVoices: () => voices,
		addEventListener: () => {},
		removeEventListener: () => {},
		cancel: () => {},
		speak: () => {}
	});
}

beforeEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('settings — 목소리', () => {
	// The picker was wrapped in `{#if voices.length > 0}`, so it vanished on
	// exactly the device whose reader had just been told by the player to come
	// here and choose a different voice. Android, which commonly ships without
	// a Korean voice, saw an instruction pointing at nothing.
	it('explains itself when the device has no Korean voice', async () => {
		withVoices([{ name: 'Daniel', lang: 'en-GB', localService: true }]);
		render(Settings);
		await waitFor(() => expect(screen.getByTestId('no-korean-voice')).toBeInTheDocument());
		expect(screen.queryByLabelText('읽어줄 목소리')).toBeNull();
	});

	// Two different faults with two different fixes: a missing language pack,
	// or an engine that never woke up. The count is what tells them apart.
	it('says how many voices the device did report', async () => {
		withVoices([
			{ name: 'Daniel', lang: 'en-GB', localService: true },
			{ name: 'Alice', lang: 'it-IT', localService: true }
		]);
		render(Settings);
		await waitFor(() => expect(screen.getByTestId('no-korean-voice')).toHaveTextContent('2개'));
	});

	it('says so when the engine reported nothing at all', async () => {
		withVoices([]);
		render(Settings);
		await waitFor(() =>
			expect(screen.getByTestId('no-korean-voice')).toHaveTextContent('하나도 알려주지 않았습니다')
		);
	});

	it('offers the picker when there is something to pick', async () => {
		withVoices([{ name: 'Yuna', lang: 'ko-KR', localService: true }]);
		render(Settings);
		await waitFor(() => expect(screen.getByLabelText('읽어줄 목소리')).toBeInTheDocument());
		expect(screen.queryByTestId('no-korean-voice')).toBeNull();
	});
});
