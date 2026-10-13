import { describe, expect, it } from "vitest";
import { CONTAINMENT } from "../src/content/rooms";
import { newProgress } from "../src/domain/progress";
import { createWorld } from "../src/game/world";
import { defaultSettings, parseSave, toSaveFile } from "../src/persistence/schema";

const valid = () => {
  const p = newProgress(CONTAINMENT);
  p.banked.biomass = 42;
  p.upgrades.cargoCapacity = 2;
  p.cargo.push({ type: "worker", weight: 2, reward: { biomass: 3 } });
  p.spawnCooldowns[CONTAINMENT.spawns[0]!.id] = 3.5;
  return toSaveFile(p, defaultSettings());
};

describe("save schema", () => {
  it("round-trips through JSON", () => {
    const s = valid();
    const parsed = parseSave(JSON.parse(JSON.stringify(s)), CONTAINMENT);
    expect(parsed).toEqual(s);
  });

  it("contains no wall-clock timestamps", () => {
    expect(JSON.stringify(valid())).not.toMatch(/time|date|at"/i);
  });

  it.each([
    ["not an object", 7],
    ["newer schema", { ...valid(), schemaVersion: 99 }],
    ["negative biomass", { ...valid(), progress: { ...valid().progress, banked: { biomass: -1 } } }],
    ["NaN xp", { ...valid(), progress: { ...valid().progress, xp: NaN } }],
    ["unknown cargo type", { ...valid(), progress: { ...valid().progress, cargo: [{ type: "dragon", weight: 1, reward: {} }] } }],
    ["fractional upgrade", { ...valid(), progress: { ...valid().progress, upgrades: { capturePower: 1.5 } } }],
  ])("rejects malformed input: %s", (_name, raw) => {
    expect(parseSave(raw, CONTAINMENT)).toBeNull();
  });

  it("clamps upgrade levels above the cap", () => {
    const s = valid();
    s.progress.upgrades.moveSpeed = 999;
    expect(parseSave(s, CONTAINMENT)!.progress.upgrades.moveSpeed).toBe(5);
  });

  it("restores cooldowns so reloading does not respawn captured targets early", () => {
    const s = parseSave(valid(), CONTAINMENT)!;
    const w = createWorld(CONTAINMENT, s.progress);
    expect(w.targets).toHaveLength(CONTAINMENT.spawns.length - 1);
  });

  it("snapshots are isolated from later mutation", () => {
    const p = newProgress(CONTAINMENT);
    const s = toSaveFile(p, defaultSettings());
    p.banked.biomass = 500;
    p.cargo.push({ type: "worker", weight: 2, reward: { biomass: 3 } });
    expect(s.progress.banked.biomass).toBe(0);
    expect(s.progress.cargo).toHaveLength(0);
  });
});

describe("save hardening", () => {
  it("rebuilds cargo from content and caps it at capacity", () => {
    const s = valid() as unknown as { progress: { cargo: unknown[] } };
    s.progress.cargo = Array.from({ length: 50 }, () => ({ type: "worker", weight: 0, reward: { biomass: 1e308 } }));
    const parsed = parseSave(s, CONTAINMENT)!;
    const capacity = 20 + 8 * 2; // valid() has cargoCapacity level 2
    expect(parsed.progress.cargo.reduce((n, d) => n + d.weight, 0)).toBeLessThanOrEqual(capacity);
    expect(parsed.progress.cargo.every((d) => d.reward.biomass === 3)).toBe(true);
  });

  it("clamps position and health", () => {
    const s = valid();
    s.progress.player = { x: 1e6, z: -1e6, health: 5000 };
    const p = parseSave(s, CONTAINMENT)!.progress.player;
    expect(p.x).toBe(CONTAINMENT.bounds.maxX);
    expect(p.z).toBe(CONTAINMENT.bounds.minZ);
    expect(p.health).toBe(100);
  });
});
