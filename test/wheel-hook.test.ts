import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { TuiAltScreen, type TUI, type Terminal } from "@earendil-works/pi-tui";
import { AdaptiveWheelHook } from "../wheel-hook.ts";

function harness(nativeLines = 3) {
  let nativeCalls = 0;
  let resets = 0;
  let overlay = false;
  const policy = {
    next(_direction: number, _now: number) { nativeCalls++; return nativeLines; },
    reset() { resets++; },
  };
  const tui = { mode: "fullscreen", wheelScroll: policy, hasOverlay: () => overlay };
  return { policy, tui: tui as unknown as TUI, hook: new AdaptiveWheelHook(),
    overlay: (value: boolean) => { overlay = value; },
    nativeCalls: () => nativeCalls, resets: () => resets };
}

test("installs once, accelerates, and restores the exact native method on disposal", () => {
  const h = harness();
  const original = h.policy.next;
  assert.equal(h.hook.sync(h.tui), true);
  const replacement = h.policy.next;
  h.hook.sync(h.tui);
  assert.equal(h.policy.next, replacement);
  assert.equal(h.policy.next(-1, 0), 1);
  for (let i = 1; i <= 100; i++) h.policy.next(-1, i * 8);
  assert.equal(h.policy.next(-1, 808), 12);
  assert.equal(h.nativeCalls(), 0);
  h.hook.dispose();
  h.hook.dispose();
  assert.equal(h.policy.next, original);
  assert.equal(h.policy.next(-1, 816), 3);
  assert.equal(h.resets(), 1);
});

test("overlays keep native behavior and returning to transcript resets acceleration", () => {
  const h = harness();
  h.hook.sync(h.tui);
  for (let i = 0; i < 100; i++) h.policy.next(-1, i * 8);
  h.overlay(true);
  assert.equal(h.policy.next(-1, 800), 3);
  h.overlay(false);
  assert.equal(h.policy.next(-1, 808), 1);
});

test("off restores native scrolling and profile changes reset the gesture", () => {
  const h = harness();
  const original = h.policy.next;
  h.hook.sync(h.tui);
  for (let i = 0; i < 100; i++) h.policy.next(1, i * 8);
  h.hook.setMode("gentle");
  assert.equal(h.policy.next(1, 800), 1);
  h.hook.setMode("off");
  assert.equal(h.policy.next, original);
  assert.equal(h.hook.sync(h.tui), false);
  h.hook.setMode("normal");
  assert.equal(h.hook.sync(h.tui), true);
});

test("unsupported/regular renderers are untouched, including frozen policy objects", () => {
  const h = harness();
  assert.equal(h.hook.sync({ mode: "regular" } as TUI), false);
  assert.equal(h.hook.sync({ mode: "fullscreen" } as TUI), false);
  assert.equal(h.hook.sync({ mode: "fullscreen", wheelScroll: { next() {} } } as unknown as TUI), false);
  Object.freeze(h.policy);
  assert.equal(h.hook.sync(h.tui), false);
});

test("renderer replacement restores old policy before attaching the new one", () => {
  const first = harness();
  const second = harness();
  const original = first.policy.next;
  let active = first.tui;
  const proxy = new Proxy({} as TUI, { get: (_target, key) => Reflect.get(active, key) });
  first.hook.sync(proxy);
  active = second.tui;
  first.hook.sync(proxy);
  assert.equal(first.policy.next, original);
  assert.equal(second.policy.next(1, 0), 1);
  active = { mode: "regular" } as TUI;
  assert.equal(first.hook.sync(proxy), false);
  assert.equal(second.policy.next(1, 8), 3);
});

test("cleanup does not overwrite another extension's subsequent replacement", () => {
  const h = harness();
  h.hook.sync(h.tui);
  const other = () => 9;
  h.policy.next = other;
  h.hook.dispose();
  assert.equal(h.policy.next, other);
});

test("a later extension wrapping this hook cannot keep acceleration alive after cleanup", () => {
  const h = harness();
  h.hook.sync(h.tui);
  const wrapped = h.policy.next;
  for (let i = 0; i < 100; i++) wrapped(-1, i * 8);
  h.policy.next = (direction, now) => wrapped(direction, now);
  h.hook.dispose();
  assert.equal(h.policy.next(-1, 800), 3);
});

test("works with the installed Pi fullscreen policy and preserves its configured native speed", () => {
  const tui = new TuiAltScreen({ columns: 80, rows: 24 } as Terminal, false, undefined, { wheelScrollLines: 4 });
  const policy = (tui as unknown as { wheelScroll: { next(direction: number, now: number): number } }).wheelScroll;
  const hook = new AdaptiveWheelHook();
  assert.equal(hook.sync(tui), true);
  assert.equal(policy.next(-1, 0), 1);
  for (let i = 1; i < 100; i++) policy.next(-1, i * 8);
  assert.equal(policy.next(-1, 800), 12);
  hook.dispose();
  assert.equal(policy.next(-1, 808), 4);
});

test("real SGR wheel routing retains direction, Alt multiplier and keyboard handling", () => {
  const tui = new TuiAltScreen({ columns: 80, rows: 24 } as Terminal);
  const viewport = tui as unknown as {
    handleViewportInput(data: string): unknown;
    routeWheel(event: unknown, delta: number): void;
  };
  const deltas: number[] = [];
  viewport.routeWheel = (_event, delta) => { deltas.push(delta); };
  const hook = new AdaptiveWheelHook();
  let now = 0;
  const clock = mock.method(performance, "now", () => now);
  try {
    hook.sync(tui);
    for (let i = 0; i < 100; i++) {
      now = i * 8;
      assert.deepEqual(viewport.handleViewportInput("\x1b[<64;10;10M"), { consume: true });
    }
    assert.equal(deltas[0], -1);
    assert.equal(deltas.at(-1), -12);
    now += 8;
    viewport.handleViewportInput("\x1b[<72;10;10M");
    assert.equal(deltas.at(-1), -60);
    now += 8;
    viewport.handleViewportInput("\x1b[<65;10;10M");
    assert.equal(deltas.at(-1), 1);
    const pageScrolls: number[] = [];
    tui.scrollBy = (lines) => { pageScrolls.push(lines); };
    viewport.handleViewportInput("\x1b[5~");
    assert.deepEqual(pageScrolls, [-1]);
  } finally {
    hook.dispose();
    clock.mock.restore();
  }
});
