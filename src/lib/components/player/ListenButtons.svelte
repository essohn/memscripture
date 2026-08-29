<script lang="ts">
	import { CirclePlay, Play, Square } from 'lucide-svelte';
	import type { PlaylistVerse } from '$lib/memorize/playlist';
	import type { PlaylistPlayer } from '$lib/state/playlistPlayer.svelte';

	/**
	 * 전체 듣기 and 따라 읽기 for one list of verses.
	 *
	 * Anywhere the reader has narrowed a list down — an 암송 DAY, a difficulty
	 * level, a series inside a 구절집 — the same two questions apply: play it,
	 * or play it with room to recite. The pair travels together because the
	 * second is only legible next to the first.
	 *
	 * The player is passed in rather than owned here. There is one synthesizer,
	 * so a screen showing several lists must share one player between them or
	 * two bars would open at once, each believing it is the one playing.
	 */
	interface Props {
		player: PlaylistPlayer;
		/** Distinguishes this list from every other the player might hold, so
		 *  the buttons light for their own list and not a neighbour's. */
		id: string;
		/** Names the list in the buttons' accessible labels. */
		title: string;
		verses: PlaylistVerse[];
	}
	let { player, id, title, verses }: Props = $props();

	const listening = $derived(player.openId === id);
	const reciting = $derived(player.openId === `${id}:recite`);
</script>

{#if player.supported && verses.length > 0}
	<!--
		Stop, not pause, and not a muted speaker: the transport lives in the bar,
		so each button's whole promise is "start this list / put it away".
	-->
	<button
		type="button"
		onclick={() => (listening ? player.close() : player.start(id, verses))}
		aria-label="{title} {listening ? '듣기 정지' : '전체 듣기'}"
		class="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors {listening
			? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
			: 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]'}"
	>
		{#if listening}
			<Square size={14} strokeWidth={2} fill="currentColor" />
		{:else}
			<Play size={15} strokeWidth={1.75} />
		{/if}
	</button>
	<button
		type="button"
		onclick={() =>
			reciting ? player.close() : player.start(`${id}:recite`, verses, { recite: true })}
		aria-label="{title} {reciting ? '따라 읽기 정지' : '따라 읽기'}"
		class="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors {reciting
			? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
			: 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]'}"
	>
		{#if reciting}
			<Square size={14} strokeWidth={2} fill="currentColor" />
		{:else}
			<CirclePlay size={15} strokeWidth={1.75} />
		{/if}
	</button>
{/if}
