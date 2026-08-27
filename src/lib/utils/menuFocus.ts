/**
 * Makes a `role="menu"` behave like the widget that role promises.
 *
 * Every popover in this app already renders real buttons and links, so a
 * keyboard reader was never locked out — but `role="menu"` tells assistive
 * technology to expect arrow-key navigation and managed focus, and none of
 * them delivered it. This closes that gap in one place, so the six menus stay
 * consistent and the seventh gets it for free:
 *
 *   <div role="menu" use:menuFocus> … </div>
 *
 * Closing is deliberately not its business. Every menu here already decides
 * for itself what Escape and an outside click mean, and those answers differ;
 * this only moves focus.
 */

/** Everything inside the menu a reader can land on. Queried rather than
 *  required to carry `role="menuitem"`, because the colour grid in
 *  BookmarkControl is a menu of plain buttons and is no less a menu for it. */
function items(node: HTMLElement): HTMLElement[] {
	return [...node.querySelectorAll<HTMLElement>('[role="menuitem"], button, a[href]')].filter(
		(el) => !el.hasAttribute('disabled')
	);
}

export function menuFocus(node: HTMLElement) {
	/**
	 * Whatever had focus when the menu opened — which is the trigger, because
	 * the reader just activated it.
	 *
	 * Read here rather than passed in: threading a `bind:this` through six
	 * components to tell the action a thing it can see for itself is plumbing
	 * that would earn nothing. A browser that leaves focus on `<body>` after a
	 * click simply gives us nothing to return to, which is exactly what these
	 * menus did before this action existed — no worse, and never wrong for the
	 * keyboard reader this is for.
	 */
	const opener = document.activeElement;

	function onKeydown(e: KeyboardEvent) {
		const list = items(node);
		if (list.length === 0) return;
		const here = list.indexOf(document.activeElement as HTMLElement);
		let next: number;
		if (e.key === 'ArrowDown') next = here < 0 ? 0 : (here + 1) % list.length;
		else if (e.key === 'ArrowUp') next = here < 0 ? list.length - 1 : (here - 1 + list.length) % list.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = list.length - 1;
		else return;
		// Only after we know the key was ours: the menus below still want their
		// own Escape, and a page still wants its own PageDown.
		e.preventDefault();
		list[next].focus();
	}

	node.addEventListener('keydown', onKeydown);
	items(node)[0]?.focus();

	return {
		destroy() {
			node.removeEventListener('keydown', onKeydown);
			// `isConnected` because a menu item can remove the trigger it belongs
			// to — focusing a detached node silently sends focus to the body and
			// loses the reader's place instead of restoring it.
			if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
		}
	};
}
