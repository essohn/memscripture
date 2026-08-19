<script lang="ts">
	/**
	 * A workbook glyph in Excel's green, drawn here for the same reason
	 * GoogleSheetsIcon is: lucide ships no brand marks, and the two export
	 * buttons now sit side by side — the colour is what tells them apart
	 * before either label is read.
	 *
	 * Same 24-unit grid, same `size` prop and the same page-with-a-fold shape
	 * as its neighbour, so the pair reads as one set rather than two borrowed
	 * logos.
	 */
	interface Props {
		size?: number;
	}
	let { size = 16 }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	aria-hidden="true"
	focusable="false"
>
	<path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#217346" />
	<path d="M14 2l5 5h-5z" fill="#12512F" />
	<!-- The X, which is what distinguishes a workbook from a sheet at 15px. -->
	<path
		d="M9.1 10.6h1.9l1 1.9 1-1.9h1.9l-1.9 3.3 2 3.5h-1.9l-1.1-2-1.1 2H9l2-3.5z"
		fill="#fff"
	/>
</svg>
