<script lang="ts">
	import PlaylistBar from './PlaylistBar.svelte';
	import type { PlaylistPlayer } from '$lib/state/playlistPlayer.svelte';

	/**
	 * The playlist bar, wired to a player.
	 *
	 * PlaylistBar is deliberately presentational — every value arrives as a
	 * prop, so it can be rendered and tested without a synthesizer. The cost is
	 * fourteen lines of wiring, and the moment a second screen wanted a player
	 * that became fourteen lines to keep in step across three files. This is
	 * that wiring, written once.
	 */
	interface Props {
		player: PlaylistPlayer;
	}
	let { player }: Props = $props();
</script>

{#if player.openId}
	<PlaylistBar
		playing={player.playing}
		failed={player.failed}
		label={player.waiting ? '따라 해보세요' : (player.nowPlaying?.cite ?? '')}
		waitFraction={player.waitFraction}
		reciteScale={player.reciting ? player.reciteScale : null}
		onPickReciteScale={(s) => player.setReciteScale(s)}
		index={player.index}
		count={player.count}
		fraction={player.progress.fraction}
		elapsedMs={player.progress.elapsedMs}
		totalMs={player.progress.totalMs}
		repeat={player.listRepeat}
		onToggle={() => player.toggle()}
		onSeek={(f) => player.seek(f)}
		onToggleRepeat={() => player.toggleRepeat()}
		onClose={() => player.close()}
	/>
{/if}
