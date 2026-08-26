import '@testing-library/jest-dom/vitest';

// jsdom does not implement ResizeObserver — provide a no-op stub.
global.ResizeObserver = class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
};

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
