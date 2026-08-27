/** 0 → A, 25 → Z, 26 → AA. Spreadsheet columns are bijective base-26, so
 *  this is not a plain radix conversion. */
export function columnName(index0: number): string {
	let n = index0 + 1;
	let s = '';
	while (n > 0) {
		const r = (n - 1) % 26;
		s = String.fromCharCode(65 + r) + s;
		n = Math.floor((n - 1) / 26);
	}
	return s;
}
