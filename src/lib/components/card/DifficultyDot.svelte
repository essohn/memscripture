<script lang="ts">
	import { DIFFICULTY_COLORS, type DifficultyLevel } from '$lib/db/verseRatings';

	interface Props {
		/** What this pip measures, spoken to a screen reader.
		 *
		 *  Omitted when the pip sits inside a group that already names the whole
		 *  sequence — ten pips walked one at a time teach a screen reader user
		 *  nothing about a trend, and ten copies of one label would also collide
		 *  with the rows that carry the same one. */
		label?: string;
		value: DifficultyLevel | null;
	}
	let { label, value }: Props = $props();
</script>

<!-- role="img" rather than a bare span: the colour and the digit together are
     the whole message, and a span's aria-label is not guaranteed to be read.
     Not a button — this is what the rating *was*, not a control to change it. -->
<span
	role={label ? 'img' : undefined}
	aria-label={label ? `${label} ${value ?? '없음'}` : undefined}
	aria-hidden={label ? undefined : 'true'}
	style={value === null
		? 'border: 1.5px dashed var(--color-border); color: var(--color-text-tertiary);'
		: `background-color: ${DIFFICULTY_COLORS[value]}; color: white;`}
	class="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
>
	{value ?? '—'}
</span>
