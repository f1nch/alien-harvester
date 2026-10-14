import { describe, expect, it } from "vitest";
import { EVOLUTIONS } from "../src/content/evolution";
import { FACILITY } from "../src/content/map";
import { UPGRADE_IDS, UPGRADES } from "../src/content/upgrades";
import { capRaise, computeStats, maxLevel, nextCost, purchaseUpgrade } from "../src/domain/economy";
import { evolutionRequirements, evolve } from "../src/domain/evolution";
import { newProgress } from "../src/domain/progress";
import { isDone } from "../src/domain/quests";
import { evolveCreature } from "../src/game/actions";
import { stepWorld } from "../src/game/step";
import { createWorld } from "../src/game/world";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";

/** A player who has met every requirement for the first evolution. */
function ready() {
  const p = newProgress(FACILITY);
  for (const id of ["q-first-catch", "q-first-bank", "q-first-upgrade", "q-open-service", "q-genetic"]) {
    p.quests[id] = { count: 999, done: true };
  }
  p.unlockedDoors.push("door-service");
  p.upgrades.capturePower = 4;
  p.upgrades.cargoCapacity = 4;
  p.upgrades.moveSpeed = 2;
  p.mutationsBought = 10;
  p.banked.genetic = 30;
  p.banked.biomass = 150;
  return p;
}

describe("evolution", () => {
  it("lists every requirement with progress", () => {
    const p = newProgress(FACILITY);
    const reqs = evolutionRequirements(p);
    expect(reqs.map((r) => r.label)).toEqual([
      "Quest: Bank 25 genetic material",
      "Buy 10 mutation levels",
      "Pay 150 biomass",
      "Pay 30 genetic material",
    ]);
    expect(reqs.every((r) => !r.met)).toBe(true);
  });

  it("never deducts anything unless every requirement is met", () => {
    const p = ready();
    p.mutationsBought = 9; // one short
    expect(evolve(p)).toEqual({ ok: false, reason: "requirements" });
    expect(p.banked).toMatchObject({ genetic: 30, biomass: 150 });
    expect(p.evolution).toBe(0);
  });

  it("XP alone never evolves", () => {
    const p = newProgress(FACILITY);
    p.xp = 1e9;
    p.banked.genetic = 1e6;
    p.banked.biomass = 1e6;
    expect(evolve(p).ok).toBe(false);
  });

  it("deducts the cost and raises the tier in one step, once", () => {
    const p = ready();
    expect(evolve(p)).toEqual({ ok: true, tier: 1 });
    expect(p.banked).toMatchObject({ genetic: 0, biomass: 0 });
    expect(evolve(p)).toEqual({ ok: false, reason: "final" });
  });

  it("adds a tentacle and raises every cap", () => {
    const p = ready();
    p.upgrades.moveSpeed = 5;
    expect(capRaise(p, "moveSpeed")).toBe("evolve");
    expect(nextCost(p, "moveSpeed")).toBeNull();
    const before = computeStats(p).tentacles;
    evolve(p);
    expect(computeStats(p).tentacles).toBe(before + EVOLUTIONS[0]!.tentacleBonus);
    for (const id of UPGRADE_IDS) expect(maxLevel(p, id)).toBe(UPGRADES[id].capByTier[1]);
    p.banked.biomass = 1e6;
    expect(purchaseUpgrade(p, "moveSpeed").ok).toBe(true);
    expect(p.upgrades.moveSpeed).toBe(6);
  });

  it("evolving through the game action completes the evolve quest and uses the new tentacle", () => {
    const p = ready();
    const w = createWorld(FACILITY, p);
    expect(evolveCreature(w).ok).toBe(true);
    expect(isDone(p, "q-evolve")).toBe(true);
    expect(w.events.some((e) => e.type === "evolved")).toBe(true);
    stepWorld(w);
    expect(w.tentacles.length).toBe(3);
  });

  it("every cap list is non-decreasing and within the cost table", () => {
    for (const id of UPGRADE_IDS) {
      const caps = UPGRADES[id].capByTier;
      for (let i = 1; i < caps.length; i++) expect(caps[i]).toBeGreaterThanOrEqual(caps[i - 1]!);
      expect(caps[caps.length - 1]).toBeLessThanOrEqual(UPGRADES[id].costs.length);
    }
  });
});

describe("evolution saves", () => {
  it("round-trips the tier and keeps evolved upgrade levels", () => {
    const p = ready();
    evolve(p);
    p.upgrades.capturePower = 11;
    const parsed = parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))))!;
    expect(parsed.progress.evolution).toBe(1);
    expect(parsed.progress.upgrades.capturePower).toBe(11);
  });

  it("clamps upgrade levels to the saved tier's cap", () => {
    const p = ready();
    p.upgrades.capturePower = 11; // only legal after evolving
    const parsed = parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))))!;
    expect(parsed.progress.upgrades.capturePower).toBe(8);
  });

  it("rejects malformed tiers and clamps tiers beyond the last form", () => {
    const bad = toSaveFile(ready(), defaultSettings()) as any;
    bad.progress.evolution = 1.5;
    expect(parseSave(bad)).toBeNull();
    bad.progress.evolution = 99;
    expect(parseSave(bad)!.progress.evolution).toBe(EVOLUTIONS.length);
  });

  it("migrates a v2 save to tier 0", () => {
    const v2 = JSON.parse(JSON.stringify(toSaveFile(ready(), defaultSettings())));
    v2.schemaVersion = 2;
    delete v2.progress.evolution;
    const parsed = parseSave(v2)!;
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.progress.evolution).toBe(0);
    expect(parsed.progress.banked.genetic).toBe(30);
  });
});

describe("evolution review regressions", () => {
  it("tier-0 caps match the pre-evolution saves, so migrated levels are never cut", () => {
    // Schema v2 capped levels at the cost-table lengths: 8, 8, 5, 5.
    const original = ["capturePower", "cargoCapacity", "captureRadius", "moveSpeed"] as const;
    expect(original.map((id) => UPGRADES[id].capByTier[0])).toEqual([8, 8, 5, 5]);
    // Pin every track: lowering a cap would silently remove purchased levels from saves.
    expect(Object.fromEntries(UPGRADE_IDS.map((id) => [id, UPGRADES[id].capByTier]))).toEqual({
      capturePower: [8, 12], cargoCapacity: [8, 12], captureRadius: [5, 7], moveSpeed: [5, 7],
      tentacles: [1, 3], maxHealth: [5, 8], regeneration: [4, 6], resourceYield: [3, 5],
    });
  });

  it("an evolved save whose evolve quest was never completed is repaired on load", () => {
    const p = ready();
    p.evolution = 1;
    const w = createWorld(FACILITY, p);
    expect(isDone(p, "q-evolve")).toBe(true);
    expect(w.events.some((e) => e.type === "questComplete")).toBe(true);
  });

  it("losing a tentacle releases its target and frees the reserved cargo", () => {
    const p = ready();
    evolve(p);
    const w = createWorld(FACILITY, p);
    w.player.x = 0;
    w.player.z = -9.5;
    // Three targets in reach of three tentacles.
    const near = w.targets.slice(0, 3);
    near.forEach((t, i) => {
      t.x = -1 + i;
      t.z = -8.5;
      t.idle = 1e9;
    });
    stepWorld(w);
    expect(w.tentacles.filter(Boolean)).toHaveLength(3);
    const dropped = w.tentacles[2]!;
    p.evolution = 0;
    w.stats = computeStats(p);
    stepWorld(w);
    expect(w.tentacles).toHaveLength(2);
    expect(dropped.held).toBe(false);
    expect(dropped.progress).toBe(0);
  });
});
