/**
 * Runs before every test file. jsdom has no media playback and prints "Not implemented" for each
 * call to it, which buried real warnings in the output; these stand-ins do nothing instead. Tests
 * that care what the element does use stubMediaElements (renderHook.tsx).
 */
if (typeof HTMLMediaElement !== 'undefined') {
  const proto = HTMLMediaElement.prototype;
  proto.load = () => {};
  proto.pause = () => {};
  proto.play = () => Promise.resolve();
}
