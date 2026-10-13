import { describe, expect, it } from "vitest";
import { FACILITY } from "../src/content/map";
import { newProgress } from "../src/domain/progress";
import { createWorld } from "../src/game/world";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";

const valid = () => {
  const p = newProgress(FACILITY);
  p.banked.biomass = 42;
  p.upgrades.cargoCapacity = 2;
  p.upgradeSpent.cargoCapacity = 65;
  p.mutationsBought = 2;
  p.cargo.push({ type: "worker", weight: 2, reward: { biomass: 3 } });
  p.spawnCooldowns[FACILITY.spawns[0]!.id] = 3.5;
  return toSaveFile(p, defaultSettings());
};

describe("save schema", () => {
  it("round-trips through JSON", () => {
    const s = valid();
    const parsed = parseSave(JSON.parse(JSON.stringify(s)), FACILITY);
    expect(parsed).toEqual(s);
  });

  it("contains no wall-clock timestamps", () => {
    // Durations are stored as remaining seconds; nothing records when something happened.
    const keys: string[] = [];
    const nums: number[] = [];
    const walk = (v: unknown, key = ""): void => {
      if (typeof v === "number") nums.push(v);
      else if (Array.isArray(v)) v.forEach((x) => walk(x));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.push(k); walk(x, k); }
      void key;
    };
    walk(valid());
    // camelCase "...At" is case-sensitive so words like "vat" don't match.
    expect(keys.filter((k) => /timestamp|date|lastseen/i.test(k) || /At$|^at$/.test(k))).toEqual([]);
    // Epoch milliseconds or seconds would be enormous next to any game value.
    expect(nums.every((n) => Math.abs(n) < 1e8)).toBe(true);
  });

  it.each([
    ["not an object", 7],
    ["newer schema", { ...valid(), schemaVersion: 99 }],
    ["negative biomass", { ...valid(), progress: { ...valid().progress, banked: { biomass: -1 } } }],
    ["NaN xp", { ...valid(), progress: { ...valid().progress, xp: NaN } }],
    ["unknown cargo type", { ...valid(), progress: { ...valid().progress, cargo: [{ type: "dragon", weight: 1, reward: {} }] } }],
    ["fractional upgrade", { ...valid(), progress: { ...valid().progress, upgrades: { capturePower: 1.5 } } }],
  ])("rejects malformed input: %s", (_name, raw) => {
    expect(parseSave(raw, FACILITY)).toBeNull();
  });

  it("clamps upgrade levels above the cap", () => {
    const s = valid();
    s.progress.upgrades.moveSpeed = 999;
    expect(parseSave(s, FACILITY)!.progress.upgrades.moveSpeed).toBe(5);
  });

  it("restores cooldowns so reloading does not respawn captured targets early", () => {
    const s = parseSave(valid(), FACILITY)!;
    const w = createWorld(FACILITY, s.progress);
    expect(w.targets).toHaveLength(FACILITY.spawns.length - 1);
  });

  it("snapshots are isolated from later mutation", () => {
    const p = newProgress(FACILITY);
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
    const parsed = parseSave(s, FACILITY)!;
    const capacity = 20 + 8 * 2; // valid() has cargoCapacity level 2
    expect(parsed.progress.cargo.reduce((n, d) => n + d.weight, 0)).toBeLessThanOrEqual(capacity);
    expect(parsed.progress.cargo.every((d) => d.reward.biomass === 3)).toBe(true);
  });

  it("returns out-of-zone positions to spawn and clamps health", () => {
    const s = valid();
    s.progress.player = { x: 1e6, z: -1e6, health: 5000 };
    const p = parseSave(s, FACILITY)!.progress.player;
    expect([p.x, p.z]).toEqual([FACILITY.playerSpawn.x, FACILITY.playerSpawn.z]);
    expect(p.health).toBe(100);
  });

  it("returns a player standing in a still-locked zone to spawn", () => {
    const s = valid();
    s.progress.player = { x: 0, z: 30, health: 100 }; // service wing, door locked
    expect(parseSave(s, FACILITY)!.progress.player.z).toBe(FACILITY.playerSpawn.z);
    s.progress.unlockedDoors = ["door-service"];
    expect(parseSave(s, FACILITY)!.progress.player.z).toBe(30);
  });

  it("migrates a v1 save to the current schema without losing progress", () => {
    const v1 = JSON.parse(JSON.stringify(valid()));
    v1.schemaVersion = 1;
    delete v1.progress.quests;
    delete v1.progress.unlockedDoors;
    const parsed = parseSave(v1, FACILITY)!;
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.progress.evolution).toBe(0);
    expect(parsed.progress.banked.biomass).toBe(42);
    expect(parsed.progress.upgrades.cargoCapacity).toBe(2);
    expect(parsed.progress.quests).toEqual({});
    expect(parsed.progress.unlockedDoors).toEqual([]);
    expect(v1.schemaVersion).toBe(1); // input not mutated
  });

  it("drops unknown quests and doors but rejects malformed ones", () => {
    const s = valid() as any;
    s.progress.quests = { "q-first-catch": { count: 99, done: false }, "q-removed": { count: 1, done: true } };
    s.progress.unlockedDoors = ["door-service", "door-gone"];
    const parsed = parseSave(s, FACILITY)!;
    expect(parsed.progress.quests).toEqual({ "q-first-catch": { count: 5, done: false } });
    expect(parsed.progress.unlockedDoors).toEqual(["door-service"]);
    s.progress.quests = { "q-first-catch": { count: "x", done: false } };
    expect(parseSave(s, FACILITY)).toBeNull();
  });
});

describe("position reachability", () => {
  it("keeps a player standing in an open doorway", () => {
    const s = valid();
    s.progress.unlockedDoors = ["door-service"];
    s.progress.player = { x: 0, z: 17.5, health: 100 };
    expect(parseSave(s, FACILITY)!.progress.player.z).toBe(17.5);
  });

  it("returns a player to spawn when an earlier door on the path is still locked", () => {
    const s = valid();
    s.progress.unlockedDoors = ["door-security"]; // service door still locked
    s.progress.player = { x: 0, z: 60, health: 100 };
    expect(parseSave(s, FACILITY)!.progress.player.z).toBe(FACILITY.playerSpawn.z);
  });
});
