import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arcade } from '../../src/lib/state/arcade.svelte';
import { getArcadeSound, setArcadeSound } from '../../src/lib/db/arcadeOptions';

vi.mock('../../src/lib/arcade/player', () => ({ playTones: vi.fn() }));
const { playTones } = await import('../../src/lib/arcade/player');

beforeEach(() => {
	arcade._resetForTest();
	vi.mocked(playTones).mockClear();
});

describe('arcade sound', () => {
	// On by default: the quiz is the one place in this app that is a game, and
	// a game whose sound is off by default is a game nobody knows has sound.
	it('starts on', async () => {
		expect(await getArcadeSound()).toBe(true);
	});

	it('remembers being turned off', async () => {
		await setArcadeSound(false);
		expect(await getArcadeSound()).toBe(false);
		await setArcadeSound(true);
		expect(await getArcadeSound()).toBe(true);
	});

	it('plays when the reader wants sound', () => {
		arcade.sound = true;
		arcade.play('select');
		expect(playTones).toHaveBeenCalledTimes(1);
	});

	// Silence has to be silence everywhere, including the chain's chime, which
	// takes a different path to the same speaker.
	it('is silent when they do not', () => {
		arcade.sound = false;
		arcade.play('select');
		arcade.playCombo(3);
		expect(playTones).not.toHaveBeenCalled();
	});

	// A pick made while the stored value is still being read must win: the
	// switch is a user action and the read is not.
	it('lets a choice beat a load that was already running', async () => {
		await setArcadeSound(true);
		const loading = arcade.load();
		await arcade.setSound(false);
		await loading;
		expect(arcade.sound).toBe(false);
	});
});
