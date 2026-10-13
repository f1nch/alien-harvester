import { describe, expect, it } from "vitest";
import { FixedLoop } from "../src/game/loop";

describe("foreground-only simulation", () => {
  it("runs fixed steps from elapsed frame time", () => {
    let steps = 0;
    const loop = new FixedLoop(() => steps++, { hz: 30, maxStepsPerFrame: 5 });
    loop.frame(0);
    loop.frame(100);
    expect(steps).toBe(3);
  });

  it("grants zero steps for time spent paused, for any duration", () => {
    let steps = 0;
    const loop = new FixedLoop(() => steps++, { hz: 30, maxStepsPerFrame: 5 });
    loop.frame(0);
    loop.frame(1000);
    const before = steps;
    loop.pause("hidden");
    loop.frame(5_000);
    loop.frame(3_600_000);
    loop.resume("hidden");
    loop.frame(3_600_000 * 24);
    expect(steps).toBe(before);
    loop.frame(3_600_000 * 24 + 34);
    expect(steps).toBe(before + 1);
  });

  it("caps catch-up after a stall and discards the excess", () => {
    let steps = 0;
    const loop = new FixedLoop(() => steps++, { hz: 30, maxStepsPerFrame: 5 });
    loop.frame(0);
    loop.frame(60_000);
    expect(steps).toBe(5);
    loop.frame(60_001);
    expect(steps).toBe(5);
  });

  it("ignores backward clock jumps", () => {
    let steps = 0;
    const loop = new FixedLoop(() => steps++, { hz: 30, maxStepsPerFrame: 5 });
    loop.frame(10_000);
    loop.frame(0);
    loop.frame(10);
    expect(steps).toBe(0);
  });

  it("stays paused until every pause reason is cleared", () => {
    let steps = 0;
    const loop = new FixedLoop(() => steps++, { hz: 30, maxStepsPerFrame: 5 });
    loop.pause("hidden");
    loop.pause("menu");
    loop.resume("hidden");
    loop.frame(0);
    loop.frame(1000);
    expect(steps).toBe(0);
  });
});
