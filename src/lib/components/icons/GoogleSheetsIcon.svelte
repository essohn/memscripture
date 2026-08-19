<script lang="ts">
	/**
	 * A spreadsheet glyph in Google Sheets' green, drawn here rather than
	 * imported: lucide ships no brand marks, and the whole point of this
	 * control is that the reader recognises where the button sends them
	 * before reading the label.
	 *
	 * Kept to the same 24-unit grid and `size` prop as the lucide icons it
	 * sits beside, so it lines up without per-call-site nudging.
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
	<!-- Page with a folded corner. -->
	<path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#0F9D58" />
	<path d="M14 2l5 5h-5z" fill="#0B7C45" />
	<!-- Table: a white field with the green ruling showing through. -->
	<path d="M7.6 10.4h8.8v7.2H7.6z" fill="#fff" />
	<g fill="#0F9D58">
		<rect x="7.6" y="12.6" width="8.8" height="0.7" />
		<rect x="7.6" y="14.8" width="8.8" height="0.7" />
		<rect x="11.65" y="10.4" width="0.7" height="7.2" />
	</g>
</svg>
