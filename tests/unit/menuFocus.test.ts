import { describe, it, expect, beforeEach } from 'vitest';
import { menuFocus } from '../../src/lib/utils/menuFocus';

/** Builds a trigger and a menu the way every popover in this app renders one:
 *  the trigger has focus because the reader just activated it, and the menu is
 *  a role="menu" holding ordinary buttons and links. */
function mountMenu(inner: string) {
	document.body.innerHTML = `<button id="trigger">열기</button><div role="menu">${inner}</div>`;
	const trigger = document.getElementById('trigger') as HTMLButtonElement;
	trigger.focus();
	const menu = document.querySelector('[role="menu"]') as HTMLElement;
	return { trigger, menu };
}

beforeEach(() => {
	document.body.innerHTML = '';
});

describe('menuFocus', () => {
	it('focuses the first item when the menu opens', () => {
		const { menu } = mountMenu('<button>하나</button><button>둘</button>');
		menuFocus(menu);
		expect(document.activeElement).toHaveTextContent('하나');
	});

	it('moves down the items with ArrowDown, and wraps at the end', () => {
		const { menu } = mountMenu('<button>하나</button><button>둘</button>');
		menuFocus(menu);
		menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		expect(document.activeElement).toHaveTextContent('둘');
		menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		expect(document.activeElement).toHaveTextContent('하나');
	});

	it('moves back up with ArrowUp, and wraps at the start', () => {
		const { menu } = mountMenu('<button>하나</button><button>둘</button>');
		menuFocus(menu);
		menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
		expect(document.activeElement).toHaveTextContent('둘');
	});

	it('jumps to the ends with Home and End', () => {
		const { menu } = mountMenu('<button>하나</button><button>둘</button><button>셋</button>');
		menuFocus(menu);
		menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
		expect(document.activeElement).toHaveTextContent('셋');
		menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
		expect(document.activeElement).toHaveTextContent('하나');
	});

	it('skips an item the menu has disabled', () => {
		const { menu } = mountMenu('<button>하나</button><button disabled>둘</button><button>셋</button>');
		menuFocus(menu);
		menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		expect(document.activeElement).toHaveTextContent('셋');
	});

	it('treats a link as an item, because some menus navigate', () => {
		const { menu } = mountMenu('<a href="/somewhere">하나</a><button>둘</button>');
		menuFocus(menu);
		expect(document.activeElement).toHaveTextContent('하나');
	});

	it('gives focus back to whatever opened it when the menu closes', () => {
		const { trigger, menu } = mountMenu('<button>하나</button>');
		const action = menuFocus(menu);
		expect(document.activeElement).not.toBe(trigger);
		action.destroy();
		expect(document.activeElement).toBe(trigger);
	});

	it('does not reach for a trigger that has left the document', () => {
		const { trigger, menu } = mountMenu('<button>하나</button>');
		const action = menuFocus(menu);
		trigger.remove();
		// The point is that this does not throw, and does not leave focus on a
		// node nobody can see.
		expect(() => action.destroy()).not.toThrow();
	});

	it('leaves an empty menu alone rather than throwing', () => {
		const { menu } = mountMenu('');
		expect(() => menuFocus(menu)).not.toThrow();
	});
});
