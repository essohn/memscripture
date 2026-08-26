import { parsePassageRef } from '$lib/bible/index';
import { fetchPassageText } from '$lib/bible/fetch';
import type { TableDraft } from './tableColumns';

/**
 * Fills in the bodies a table did not carry.
 *
 * The shape of this module is dictated by one detail of the chapter cache in
 * `bible/fetch.ts`: it is populated *after* the await. Two rows of the same
 * chapter fired in parallel would therefore both miss it and fetch twice. So
 * rows are grouped by chapter, a group runs sequentially inside itself, and
 * parallelism is harvested only across distinct chapters. That is what makes
 * "시편 119:1–50" one request instead of fifty.
 */

export type RowStatus = 'ready' | 'loading' | 'no-body';

export interface FillProgress {
	index: number;
	status: RowStatus;
	/** Present only on 'ready'. */
	w?: string;
}

export interface FillOptions {
	/** Distinct chapters in flight at once. */
	concurrency?: number;
	/** How long to wait on one chapter before giving up on it. */
	timeoutMs?: number;
	/** How many chapters may fail back-to-back before the rest are abandoned. */
	maxConsecutiveFailures?: number;
	signal?: AbortSignal;
}

export interface FillSummary {
	filled: number;
	failed: number;
	/** True when the consecutive-failure breaker tripped. */
	abortedEarly: boolean;
	/** True when the caller's signal aborted the run. Rows may then be
	 *  unresolved and `filled + failed` may fall short of the rows that
	 *  needed a body — this is the field that says so out loud. */
	aborted: boolean;
}

/**
 * Stops waiting, rather than stopping the request.
 *
 * `fetchPassageText` takes no `AbortSignal`, and plumbing one through would
 * mean editing the bible module for a caller it does not otherwise know
 * about. Racing a timer leaves the request running, and if it lands late it
 * still populates the chapter cache — which makes 다시 시도 fast rather than
 * wasted.
 */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('timeout')), ms);
		work.then(
			(v) => {
				clearTimeout(timer);
				resolve(v);
			},
			(e) => {
				clearTimeout(timer);
				reject(e);
			}
		);
	});
}

export async function fillMissingBodies(
	drafts: readonly TableDraft[],
	onProgress: (p: FillProgress) => void,
	opts: FillOptions = {}
): Promise<FillSummary> {
	const {
		concurrency = 3,
		timeoutMs = 10_000,
		maxConsecutiveFailures = 3,
		signal
	} = opts;

	let filled = 0;
	let failed = 0;
	let consecutive = 0;
	const resolved = new Set<number>();

	function emit(index: number, status: RowStatus, w?: string): void {
		// Once the caller has aborted it has stopped listening — a page that
		// asked to be left alone should not be written to by a group that was
		// already in flight. Silence is the honest answer to an abort; the
		// summary below is where the caller learns what was left undone.
		if (signal?.aborted) return;
		if (status !== 'loading') resolved.add(index);
		onProgress(w === undefined ? { index, status } : { index, status, w });
	}

	// Group the rows that need a body, and settle the hopeless ones on the way.
	const groups = new Map<string, number[]>();
	for (let i = 0; i < drafts.length; i++) {
		if (drafts[i].w.length > 0) continue;
		const parsed = parsePassageRef(drafts[i].cite);
		if (!parsed) {
			// A citation this app cannot parse has no chapter to fetch. Settled
			// here rather than sent to the network to fail.
			emit(i, 'no-body');
			failed++;
			continue;
		}
		const key = `${parsed.bookId}:${parsed.chapter}`;
		const list = groups.get(key);
		if (list) list.push(i);
		else groups.set(key, [i]);
	}

	const keys = [...groups.keys()];

	async function textFor(index: number): Promise<string> {
		// Non-null: only rows whose citation parsed were grouped.
		const parsed = parsePassageRef(drafts[index].cite)!;
		return withTimeout(fetchPassageText(parsed), timeoutMs);
	}

	function settle(index: number, text: string): void {
		if (text.trim().length === 0) {
			emit(index, 'no-body');
			failed++;
			return;
		}
		emit(index, 'ready', text);
		filled++;
	}

	async function runGroup(key: string): Promise<void> {
		const indexes = groups.get(key)!;
		for (const i of indexes) emit(i, 'loading');

		const [head, ...rest] = indexes;
		let headText: string;
		try {
			headText = await textFor(head);
		} catch {
			// The chapter itself is unreachable, so every row in the group is
			// lost — and the breaker needs to hear about it.
			for (const i of indexes) {
				emit(i, 'no-body');
				failed++;
			}
			consecutive++;
			return;
		}
		consecutive = 0;
		settle(head, headText);

		// The chapter is cached now, so anything that fails below is this row's
		// own verse range rather than the network.
		for (const i of rest) {
			try {
				settle(i, await textFor(i));
			} catch {
				emit(i, 'no-body');
				failed++;
			}
		}
	}

	let next = 0;
	async function worker(): Promise<void> {
		while (true) {
			if (signal?.aborted) return;
			if (consecutive >= maxConsecutiveFailures) return;
			const k = next++;
			if (k >= keys.length) return;
			await runGroup(keys[k]);
		}
	}

	await Promise.all(
		Array.from({ length: Math.max(1, Math.min(concurrency, keys.length)) }, worker)
	);

	const abortedEarly = consecutive >= maxConsecutiveFailures;
	// Every row gets exactly one terminal status, including the ones the
	// breaker never reached — a row left on 'loading' would spin forever.
	if (abortedEarly) {
		for (const indexes of groups.values()) {
			for (const i of indexes) {
				if (resolved.has(i)) continue;
				emit(i, 'no-body');
				failed++;
			}
		}
	}

	return { filled, failed, abortedEarly, aborted: signal?.aborted ?? false };
}
