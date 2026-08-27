import '@testing-library/jest-dom/vitest';

// jsdom does not implement ResizeObserver — provide a no-op stub.
global.ResizeObserver = class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
};

// jsdom has no Web Speech API. Route components that offer 읽어주기 reach for
// it at module scope, which otherwise puts the whole page out of a test's
// reach — the same reason ResizeObserver is stubbed above.
if (!('speechSynthesis' in globalThis)) {
	// writable as well as configurable: specs that install their own synthesizer
	// do it by plain assignment, which a non-writable property swallows in
	// silence — leaving their stub uninstalled and their assertions empty.
	Object.defineProperty(globalThis, 'speechSynthesis', {
		configurable: true,
		writable: true,
		value: {
			getVoices: () => [],
			speak: () => {},
			cancel: () => {},
			addEventListener: () => {},
			removeEventListener: () => {}
		}
	});
	Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
		configurable: true,
		writable: true,
		value: class {
			text = '';
		}
	});
}
