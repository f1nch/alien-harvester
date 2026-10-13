import { describe, expect, it } from "vitest";
import { cargoWeight } from "../src/domain/progress";
import { stepWorld } from "../src/game/step";
import { committedCargo, updateCapture } from "../src/game/systems/capture";
import { SIM_DT } from "../src/game/world";
import { testWorld } from "./helpers";

const run = (w: ReturnType<typeof testWorld>, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) stepWorld(w);
};

describe("automatic capture", () => {
  it("captures a nearby worker in resistance / power seconds", () => {
    const w = testWorld([[1, 0]]);
    run(w, 1.9);
    expect(w.progress.cargo).toHaveLength(0);
    run(w, 0.2);
    expect(w.progress.cargo).toHaveLength(1);
    expect(w.progress.xp).toBe(5);
    expect(w.targets).toHaveLength(0);
  });

  it("never assigns more targets than tentacles", () => {
    const w = testWorld([[1, 0], [0, 1], [-1, 0], [0, -1]]);
    updateCapture(w, SIM_DT);
    expect(w.tentacles.filter(Boolean)).toHaveLength(2);
    expect(w.targets.filter((t) => t.held)).toHaveLength(2);
  });

  it("picks the nearest targets and keeps assignments stable", () => {
    const w = testWorld([[1.5, 0], [0.5, 0], [1, 0]]);
    updateCapture(w, SIM_DT);
    const first = w.tentacles.map((t) => t?.x);
    expect(first.sort()).toEqual([0.5, 1]);
    // A closer target appearing does not steal an existing tentacle.
    w.targets[0]!.x = 0.1;
    updateCapture(w, SIM_DT);
    expect(w.tentacles.map((t) => t?.x).sort()).toEqual([0.5, 1]);
  });

  it("cannot capture through walls", () => {
    const w = testWorld([[1.5, 0]], [{ minX: 0.6, maxX: 0.9, minZ: -1, maxZ: 1 }]);
    run(w, 5);
    expect(w.progress.cargo).toHaveLength(0);
    expect(w.tentacles.every((t) => t === null)).toBe(true);
  });

  it("reserves cargo so simultaneous completions cannot overfill", () => {
    // Capacity 20, worker weight 2: 9 in the hold leaves room for exactly one more.
    const w = testWorld([[1, 0], [-1, 0]]);
    for (let i = 0; i < 9; i++) w.progress.cargo.push({ type: "worker", weight: 2, reward: { biomass: 3 } });
    updateCapture(w, SIM_DT);
    expect(w.tentacles.filter(Boolean)).toHaveLength(1);
    run(w, 5);
    expect(cargoWeight(w.progress.cargo)).toBe(20);
    expect(committedCargo(w)).toBeLessThanOrEqual(w.stats.cargoCapacity);
    expect(w.cargoFull).toBe(true);
  });

  it("gives a grace window, then decays and releases out-of-reach targets", () => {
    const w = testWorld([[1, 0]]);
    run(w, 1);
    const t = w.tentacles.find(Boolean)!;
    const progress = t.progress;
    expect(progress).toBeCloseTo(0.5, 1);
    w.player.x = -10; // jump out of reach
    run(w, 0.25);
    expect(t.progress).toBeCloseTo(progress, 5);
    run(w, 0.3);
    expect(t.progress).toBeLessThan(progress);
    run(w, 1);
    expect(t.progress).toBe(0);
    expect(w.tentacles.includes(t)).toBe(false);
    expect(t.held).toBe(false);
  });

  it("respawns captured targets after the cooldown, in simulation time only", () => {
    const w = testWorld([[1, 0]]);
    run(w, 2.1);
    expect(w.targets).toHaveLength(0);
    expect(w.progress.spawnCooldowns.s0).toBeGreaterThan(6);
    run(w, 7);
    expect(w.targets).toHaveLength(1);
  });
});

describe("grace window", () => {
  it("protects a freshly assigned target that steps out of reach", () => {
    const w = testWorld([[1, 0]]);
    updateCapture(w, SIM_DT);
    const t = w.tentacles.find(Boolean)!;
    t.progress = 0;
    w.player.x = -10;
    updateCapture(w, SIM_DT);
    expect(w.tentacles.includes(t)).toBe(true);
  });
});
