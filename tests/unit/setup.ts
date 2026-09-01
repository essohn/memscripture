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

// jsdom implements the PointerEvent class but not the capture methods on
// Element — setPointerCapture/hasPointerCapture/releasePointerCapture are all
// undefined, so ScrubTrack's drag handling throws without a stub. Track
// captured ids per element so hasPointerCapture reflects real state instead
// of a bare `false`, which would let releasePointerCapture's guard always
// skip and a test pass without ever exercising the release path. Guarded
// because a few test files opt into the plain Node environment (no DOM at
// all), where the global `Element` this patches does not exist.
if (typeof Element !== 'undefined') {
	const capturedPointerIds = new WeakMap<Element, Set<number>>();
	Element.prototype.setPointerCapture = function (pointerId: number) {
		if (!capturedPointerIds.has(this)) capturedPointerIds.set(this, new Set());
		capturedPointerIds.get(this)!.add(pointerId);
	};
	Element.prototype.releasePointerCapture = function (pointerId: number) {
		capturedPointerIds.get(this)?.delete(pointerId);
	};
	Element.prototype.hasPointerCapture = function (pointerId: number) {
		return capturedPointerIds.get(this)?.has(pointerId) ?? false;
	};
}

// jsdom implements no Web Animations API, so `element.animate` is undefined and
// any component carrying a Svelte transition throws the moment it enters —
// Toast (transition:fly) takes the whole page down with it, which turns "assert
// the message the reader sees" into an unrunnable test. Guarded like the
// pointer-capture patch above, for the files that opt into the plain Node
// environment.
//
// Deliberately inert: `onfinish` is never called, so a transition starts and
// simply never completes. The node is inserted either way — which is all an
// assertion about rendered text needs — while firing onfinish would run outros
// to completion and delete elements out from under tests that expect them.
if (typeof Element !== 'undefined' && !Element.prototype.animate) {
	Element.prototype.animate = function () {
		return {
			currentTime: 0,
			startTime: 0,
			playState: 'running',
			onfinish: null,
			effect: { getComputedTiming: () => ({ duration: 0 }) },
			finished: new Promise(() => {}),
			cancel() {},
			play() {},
			pause() {},
			finish() {},
			commitStyles() {},
			addEventListener() {},
			removeEventListener() {}
		} as unknown as Animation;
	};
}
