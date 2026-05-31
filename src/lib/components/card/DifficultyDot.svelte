<script lang="ts">
	import { DIFFICULTY_COLORS, type DifficultyLevel } from '$lib/db/verseRatings';

	interface Props {
		value: DifficultyLevel | null;
		/** Screen-reader label that disambiguates start vs full. */
		label: string;
	}
	let { value, label }: Props = $props();
</script>

<span
	role="img"
	aria-label={value === null ? `${label} 미설정` : `${label} ${value}`}
	style={value === null
		? 'border: 1px dashed var(--color-border); color: var(--color-text-tertiary);'
		: `background-color: ${DIFFICULTY_COLORS[value]}; color: white;`}
	class="inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[9px] font-semibold tabular-nums leading-none"
>
	{value ?? ''}
</span>
