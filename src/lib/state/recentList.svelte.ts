export const RECENT_LIST_KEY = 'recent_list';

/**
 * Only ever an in-app path. A stored value that is not one — hand-edited, or
 * written by a build that meant something else by this key — is dropped rather
 * than handed to the tab bar as an href, which would turn a corrupted storage
 * row into an off-site navigation. '//host' is rejected too: it starts with a
 * slash but is protocol-relative, so the browser treats it as another origin.
 */
function isAppPath(value: unknown): value is string {
	return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

/**
 * The last list of verses the reader opened, for the Recent tab.
 *
 * Holds one URL and nothing else. That is enough because every list screen
 * carries its whole question in the URL — /stats/verses names the event,
 * dimension and bucket; /library/{pkg} names the range and group filter — so
 * re-opening one re-asks the question against today's ratings instead of
 * replaying a snapshot taken when the reader walked away from it.
 *
 * localStorage rather than db.settings, for two reasons:
 *
 *  - It reads synchronously, so the bar knows on first paint whether Recent is
 *    live or dimmed. An IndexedDB read would light the tab a frame late, or
 *    worse, offer a link that is not there yet.
 *  - Every db.settings row travels in the sync envelope (snapshot.ts exempts
 *    only the three DEVICE_LOCAL_KEYS). "The list I was just looking at" is
 *    this device's business and should not follow the reader to their phone.
 *
 * Exported as a class as well as a singleton so tests can build a fresh one —
 * constructing it is what a reload does.
 */
export class RecentList {
	/** The remembered list, or null when there is nothing to go back to. */
	href = $state<string | null>(null);

	/**
	 * URLs a page has reported dead this session, refused by remember().
	 *
	 * A dead target is discovered by the page that failed to open it, from its
	 * own effect — while the layout is recording that same URL from its effect,
	 * on the same navigation. Refusing the URL outright makes the outcome the
	 * same whichever effect Svelte flushes first, which beats depending on an
	 * ordering nothing in the framework promises to keep.
	 *
	 * Not persisted, and deliberately so: reinstall the package an event names
	 * and a reload should be able to reach its list again.
	 */
	#dead = new Set<string>();

	constructor() {
		this.href = read();
	}

	/** Records a list. Persisting is best-effort: the tab must work for this
	 *  session even where storage is refused, which is ordinary in a private
	 *  window or with site data blocked. */
	remember(href: string): void {
		if (!isAppPath(href) || this.#dead.has(href)) return;
		this.href = href;
		try {
			localStorage.setItem(RECENT_LIST_KEY, href);
		} catch {
			// Nothing to do and nothing to say — a preference that cannot be
			// written is not a fault the reader can act on.
		}
	}

	/** Drops the memory, so the tab dims. Called when a remembered list turns
	 *  out to point at something that no longer exists. Naming the URL marks it
	 *  dead for the session — see #dead. */
	forget(href?: string): void {
		if (href) this.#dead.add(href);
		this.href = null;
		try {
			localStorage.removeItem(RECENT_LIST_KEY);
		} catch {
			// As above.
		}
	}
}

function read(): string | null {
	try {
		const raw = localStorage.getItem(RECENT_LIST_KEY);
		return isAppPath(raw) ? raw : null;
	} catch {
		// Storage that throws on access — private mode, blocked site data — is
		// the same answer as storage with nothing in it.
		return null;
	}
}

export const recentList = new RecentList();
