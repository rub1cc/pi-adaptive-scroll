import assert from "node:assert/strict";
import { test } from "node:test";
import { PROFILES, ScrollAcceleration, type Profile } from "../acceleration.ts";

test("isolated and slow wheel notches move one line", () => {
  const acceleration = new ScrollAcceleration();
  for (let now = 0; now < 3000; now += 150) {
    assert.equal(acceleration.next(-1, now, "normal"), 1);
  }
});

test("sustained rapid scrolling accelerates gradually with a hard cap", () => {
  for (const profile of Object.keys(PROFILES) as Profile[]) {
    const acceleration = new ScrollAcceleration();
    const lines = Array.from({ length: 300 }, (_, i) => acceleration.next(-1, i * 8, profile));
    assert.deepEqual(lines.slice(0, 3), [1, 1, 1]);
    assert.ok(lines.every((n, i) => n >= 1 && n <= PROFILES[profile].maxLines && (!i || n >= lines[i - 1]!)));
    assert.equal(lines.at(-1), PROFILES[profile].maxLines);
  }
});

test("changing direction or pausing immediately restores precision", () => {
  const acceleration = new ScrollAcceleration();
  for (let i = 0; i < 100; i++) acceleration.next(-1, i * 8, "normal");
  assert.equal(acceleration.next(1, 800, "normal"), 1);
  for (let i = 101; i < 200; i++) acceleration.next(1, i * 8, "normal");
  assert.equal(acceleration.next(1, 1772, "normal"), 1);
});

test("slowing input decays acceleration instead of maintaining runaway speed", () => {
  const acceleration = new ScrollAcceleration();
  for (let i = 0; i < 100; i++) acceleration.next(-1, i * 8, "normal");
  let lines = 0;
  for (let i = 1; i <= 20; i++) lines = acceleration.next(-1, 792 + i * 120, "normal");
  assert.equal(lines, 1);
});

test("explicit reset and backwards clocks restore precision", () => {
  const acceleration = new ScrollAcceleration();
  for (let i = 0; i < 100; i++) acceleration.next(-1, i * 8, "normal");
  assert.equal(acceleration.next(-1, 1, "normal"), 1);
  for (let i = 1; i < 100; i++) acceleration.next(-1, i * 8, "normal");
  acceleration.reset();
  assert.equal(acceleration.next(-1, 800, "normal"), 1);
});

test("faster event streams and stronger profiles travel further", () => {
  function distance(interval: number, profile: Profile): number {
    const acceleration = new ScrollAcceleration();
    return Array.from({ length: 100 }, (_, i) => acceleration.next(1, i * interval, profile)).reduce((a, b) => a + b, 0);
  }
  assert.ok(distance(16, "normal") > distance(50, "normal"));
  assert.ok(distance(16, "fast") > distance(16, "normal"));
  assert.ok(distance(16, "normal") > distance(16, "gentle"));
});
