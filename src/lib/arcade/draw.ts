/**
 * The pixels both stages draw.
 *
 * 시작 3단어's board and 퍼펙트 게임's have different games on them and the
 * same grammar: a bitmap sprite at whole-pixel sizes, a CRT wash, and fire
 * across the ground when the round is lost. Written once so the two cannot
 * drift into two different-looking arcades.
 */

/** Two pixels on, two off — the cheapest honest CRT. */
export function drawScanlines(ctx: CanvasRenderingContext2D, w: number, h: number, ink: string) {
	ctx.save();
	ctx.globalAlpha = 0.06;
	ctx.fillStyle = ink;
	for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
	ctx.restore();
}

/**
 * A bitmap sprite, drawn as squares.
 *
 * `rows` is the sprite as text — one character per block, 'X' for on — which
 * is both the easiest shape to edit and the only one that stays a grid when
 * the block size changes.
 */
export function drawSprite(
	ctx: CanvasRenderingContext2D,
	rows: readonly string[],
	px: number,
	cx: number,
	cy: number,
	colour: string
) {
	const w = (rows[0]?.length ?? 0) * px;
	const h = rows.length * px;
	ctx.fillStyle = colour;
	for (let r = 0; r < rows.length; r++) {
		for (let c = 0; c < rows[r].length; c++) {
			if (rows[r][c] !== 'X') continue;
			ctx.fillRect(Math.round(cx - w / 2 + c * px), Math.round(cy - h / 2 + r * px), px, px);
		}
	}
}

export interface FireOptions {
	/** Seconds since the fire started. */
	seconds: number;
	/** The y the flames stand on. */
	ground: number;
	hot: string;
	ember: string;
	/** The tallest a column may reach, as a share of the board's height. */
	heightShare?: number;
}

/**
 * Fire along the ground, filling the width.
 *
 * Columns whose heights ripple against each other on two waves at different
 * speeds, rather than one solid block: a wall of colour reads as a rendering
 * fault, and the whole point of the frame is that the round can be seen lost
 * from across the room.
 */
export function drawFire(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	{ seconds, ground, hot, ember, heightShare = 0.42 }: FireOptions
) {
	const cols = Math.max(8, Math.round(w / 12));
	const cw = w / cols;
	const rise = Math.min(1, seconds / 0.35);
	for (let i = 0; i < cols; i++) {
		// Two waves, so the crests never line up into a pattern the eye follows.
		const flicker =
			0.55 + 0.3 * Math.sin(seconds * 9 + i * 0.9) + 0.15 * Math.sin(seconds * 17 + i * 2.3);
		const tall = h * heightShare * rise * Math.max(0.2, flicker);
		const x = Math.round(i * cw);
		const bw = Math.ceil(cw) + 1;
		ctx.fillStyle = hot;
		ctx.fillRect(x, Math.round(ground - tall), bw, Math.ceil(tall) + 6);
		ctx.fillStyle = ember;
		ctx.fillRect(x, Math.round(ground - tall * 0.55), bw, Math.ceil(tall * 0.55) + 6);
	}
}
