import { describe, expect, it } from "vitest";
import { BIOMES } from "../src/content/biomes";
import { FACILITY } from "../src/content/map";
import { CRYO_MAP } from "../src/content/cryo";
import { TARGETS } from "../src/content/targets";
import { UPGRADES } from "../src/content/upgrades";
import { biomeAt, clearRequirements, isBiomeCleared, MAX_DEPTH, roman, scaleAt, tidy } from "../src/domain/biome";
import { PERKS } from "../src/content/perks";
import { describePerk, grantAmount } from "../src/domain/perks";
import { levelForXp } from "../src/domain/levels";
import { updatePlayerHealth } from "../src/game/systems/combat";
import { summarize } from "../src/persistence/transfer";
import { tableCostForLevels } from "../src/domain/economy";
import { doorRequirements, unlockDoor } from "../src/domain/doors";
import { capAt, capRaise, computeStats, levelCost, maxLevel, nextCost, purchaseUpgrade, respecUpgrades, upgradeValue } from "../src/domain/economy";
import { newProgress, type ProgressState } from "../src/domain/progress";
import { activeQuests } from "../src/domain/quests";
import { nextStep, vatBatchDrop } from "../src/domain/structures";
import { leaveBiome } from "../src/game/actions";
import { createWorld, type World } from "../src/game/world";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";

describe("biome scaling", () => {
  it("tidies prices without disturbing depth 0", () => {
    expect(tidy(60)).toBe(60);
    expect(tidy(60 * 1.6)).toBe(96);
    expect(tidy(99.2)).toBe(100);
    expect(tidy(100)).toBe(100);
    expect(tidy(1258.3)).toBe(1300);
    expect(tidy(1300)).toBe(1300);
    expect(tidy(0)).toBe(0);
  });

  it("depth 0 is exactly today's content", () => {
    const b = biomeAt(0);
    expect(b.targets.worker).toBe(TARGETS.worker);
    expect(b.quests).toBe(BIOMES[0]!.quests);
    expect(b.objective.repair).toEqual(BIOMES[0]!.objective.repair);
    expect(b.name).toBe("Research wing");
    expect(b.region).toBe("Facility floor B1");
  });

  it("scales targets: resistance 1.9x, payouts and XP 1.6x, damage 1.5x per depth", () => {
    const b = biomeAt(1);
    expect(b.targets.worker.resistance).toBeCloseTo(20 * 1.9);
    expect(b.targets.worker.reward).toEqual({ biomass: 4.8 });
    expect(b.targets.worker.xp).toBe(8);
    expect(b.targets.guard.combat!.damage).toBe(18);
    expect(b.targets.worker.weight).toBe(TARGETS.worker.weight);
    // Content itself is untouched.
    expect(TARGETS.worker.resistance).toBe(20);
  });

  it("repeats the hand-made list with a numeral once it runs out", () => {
    const n = BIOMES.length;
    expect(biomeAt(n).def).toBe(BIOMES[0]);
    expect(biomeAt(n).name).toBe(`${BIOMES[0]!.name} II`);
    expect(biomeAt(n * 3).name).toBe(`${BIOMES[0]!.name} IV`);
    expect(roman(14)).toBe("XIV");
  });

  // The facility comes round again once every hand-made floor has been played.
  const F = BIOMES.length;
  const k = 1.6 ** F;

  it("scales bank goals, their titles and quest rewards", () => {
    const q = biomeAt(F).questById.get("q-first-bank")!;
    expect(q.goal).toEqual({ kind: "bank", currency: "biomass", count: tidy(30 * k) });
    expect(q.title).toBe(`Bank ${tidy(30 * k)} biomass at the base`);
    expect(q.reward).toEqual({ biomass: tidy(10 * k), xp: Math.round(10 * k) });
  });

  it("scales door, objective and structure prices, but not their gates", () => {
    const p = newProgress(FACILITY);
    p.depth = F;
    const price = tidy(60 * k);
    const door = FACILITY.doors.find((d) => d.id === "door-service")!;
    expect(doorRequirements(p, door).find((r) => r.label.startsWith("Pay"))!.label).toBe(`Pay ${price} biomass`);
    p.banked.biomass = price - 1;
    p.xp = 1000;
    p.quests["q-first-upgrade"] = { count: 1, done: true };
    expect(unlockDoor(p, door)).toEqual({ ok: false, reason: "requirements" });
    p.banked.biomass = price;
    expect(unlockDoor(p, door)).toEqual({ ok: true });
    expect(p.banked.biomass).toBe(0);
    expect(biomeAt(F).objective.repair.cost).toEqual({ parts: tidy(15 * k), biomass: tidy(300 * k) });
    p.quests["q-open-service"] = { count: 1, done: true };
    expect(nextStep(p, "vat")!.cost).toEqual({ biomass: tidy(120 * k), genetic: tidy(10 * k) });
    expect(vatBatchDrop(1).reward).toEqual({ biomass: 8 });
  });
});

describe("stats that keep scaling", () => {
  it("capture power and health caps grow per depth; speed and reach never do", () => {
    expect(capAt("capturePower", 0, 0)).toBe(8);
    expect(capAt("capturePower", 1, 0)).toBe(12);
    expect(capAt("capturePower", 1, 2)).toBe(28);
    expect(capAt("maxHealth", 1, 3)).toBe(8 + 18);
    for (const depth of [0, 1, 5, 40]) {
      expect(capAt("moveSpeed", 1, depth)).toBe(7);
      expect(capAt("captureRadius", 1, depth)).toBe(7);
      expect(capAt("tentacles", 1, depth)).toBe(3);
    }
  });

  it("compounds value and price past the table", () => {
    const p = newProgress(FACILITY);
    expect(upgradeValue(p, "capturePower", 12)).toBe(46);
    const f = UPGRADES.capturePower.growth!.valueFactor;
    expect(upgradeValue(p, "capturePower", 13)).toBeCloseTo(46 * f);
    expect(upgradeValue(p, "capturePower", 20)).toBeCloseTo(46 * f ** 8);
    expect(levelCost("capturePower", 11)).toBe(1400);
    expect(levelCost("capturePower", 12)).toBe(tidy(1400 * 1.06));
    expect(levelCost("moveSpeed", 7)).toBeNull();
  });

  it("says what raises a cap", () => {
    const p = newProgress(FACILITY);
    p.upgrades.capturePower = 8;
    expect(capRaise(p, "capturePower")).toBe("evolve");
    p.evolution = 1;
    p.upgrades.capturePower = 12;
    expect(capRaise(p, "capturePower")).toBe("nextBiome");
    expect(nextCost(p, "capturePower")).toBeNull();
    p.depth = 1;
    expect(maxLevel(p, "capturePower")).toBe(20);
    expect(nextCost(p, "capturePower")).toBe(levelCost("capturePower", 12));
    p.upgrades.moveSpeed = 7;
    expect(capRaise(p, "moveSpeed")).toBeNull();
  });

  it("buys and fully refunds levels past the table", () => {
    const p = newProgress(FACILITY);
    p.evolution = 1;
    p.depth = 1;
    p.upgrades.capturePower = 12;
    p.banked.biomass = 1e6;
    expect(purchaseUpgrade(p, "capturePower")).toEqual({ ok: true });
    expect(p.upgradeSpent.capturePower).toBe(levelCost("capturePower", 12));
    const before = p.banked.biomass;
    expect(respecUpgrades(p).ok).toBe(true);
    expect(p.banked.biomass).toBe(before + levelCost("capturePower", 12)!);
  });

  it("regeneration heals a share of max health", () => {
    const p = newProgress(FACILITY);
    expect(computeStats(p).regeneration).toBe(2);
    p.evolution = 1;
    p.depth = 2;
    p.upgrades.maxHealth = 12;
    const s = computeStats(p);
    expect(s.regeneration).toBeCloseTo((2 * s.maxHealth) / 100);
  });
});

/** Capture power and prices on the curve: everything bought up to the cap at each depth. */
function onCurve(depth: number): { captureSeconds: number; lastPriceInWorkers: number } {
  const p = newProgress(FACILITY);
  p.evolution = 1;
  p.depth = depth;
  const cap = maxLevel(p, "capturePower");
  p.upgrades.capturePower = cap;
  const power = computeStats(p).capturePower;
  const worker = biomeAt(depth).targets.worker;
  return {
    captureSeconds: worker.resistance / power,
    lastPriceInWorkers: levelCost("capturePower", cap - 1)! / worker.reward.biomass!,
  };
}

describe("pacing across depths", () => {
  it("keeps capture time and upgrade price (in targets) roughly constant", () => {
    const base = onCurve(1);
    for (const depth of [2, 3, 5, 8]) {
      const c = onCurve(depth);
      // Within ±25% per the design's budget: harder, but never a wall or a grind.
      expect(c.captureSeconds / base.captureSeconds).toBeGreaterThan(0.8);
      expect(c.captureSeconds / base.captureSeconds).toBeLessThan(1.25);
      expect(c.lastPriceInWorkers / base.lastPriceInWorkers).toBeGreaterThan(0.8);
      expect(c.lastPriceInWorkers / base.lastPriceInWorkers).toBeLessThan(1.25);
    }
  });

  it("enemy damage relative to health stays level", () => {
    const ratio = (depth: number) => {
      const p = newProgress(FACILITY);
      p.evolution = 1;
      p.depth = depth;
      p.upgrades.maxHealth = maxLevel(p, "maxHealth");
      return biomeAt(depth).targets.guard.combat!.damage / computeStats(p).maxHealth;
    };
    for (const depth of [1, 3, 6]) {
      expect(ratio(depth) / ratio(0)).toBeGreaterThan(0.75);
      expect(ratio(depth) / ratio(0)).toBeLessThan(1.33);
    }
  });
});

/** A facility world with every door open, the boss beaten and the reactor repaired. */
function clearedWorld(): World {
  const p = newProgress(FACILITY);
  p.evolution = 1;
  p.xp = 6000;
  for (const d of FACILITY.doors) p.unlockedDoors.push(d.id);
  for (const q of BIOMES[0]!.quests) p.quests[q.id] = { count: 1, done: true };
  p.reactorRepaired = true;
  const exit = BIOMES[0]!.exit;
  p.player.x = exit.x;
  p.player.z = exit.z;
  return createWorld(FACILITY, p);
}

describe("moving on", () => {
  it("needs every door, the boss and the objective", () => {
    const p = clearedWorld().progress;
    expect(isBiomeCleared(p)).toBe(true);
    p.reactorRepaired = false;
    expect(isBiomeCleared(p)).toBe(false);
    expect(clearRequirements(p).filter((r) => !r.met).map((r) => r.label)).toEqual(["Repair the reactor"]);
    p.reactorRepaired = true;
    p.unlockedDoors.pop();
    expect(clearRequirements(p)[0]).toMatchObject({ met: false, progress: "2 / 3" });
  });

  it("refuses away from the exit or before clearing, changing nothing", () => {
    const w = clearedWorld();
    w.progress.reactorRepaired = false;
    const snapshot = structuredClone(w.progress);
    expect(leaveBiome(w)).toEqual({ ok: false, reason: "notCleared" });
    w.progress.reactorRepaired = true;
    w.player.x += 10;
    expect(leaveBiome(w)).toEqual({ ok: false, reason: "notAtExit" });
    w.progress.reactorRepaired = false;
    expect(w.progress).toEqual(snapshot);
  });

  it("banks everything aboard, then resets the biome and keeps the creature", () => {
    const w = clearedWorld();
    const p = w.progress;
    p.upgrades.capturePower = 10;
    p.perks.cargo = 1;
    p.banked = { biomass: 100, genetic: 5, parts: 2, mutagen: 0, crystals: 0, alloy: 0 };
    p.cargo = [{ type: "worker", weight: 2, reward: { biomass: 3 } }, { type: "technician", weight: 3, reward: { biomass: 2, genetic: 2 } }];
    p.structures.drone = { built: true, level: 1, x: 5, z: 50, cargo: [{ type: "guard", weight: 3, reward: { biomass: 9, genetic: 1 } }] };
    p.structures.vat = { built: true, level: 1, stock: 2, timer: 3 };
    const r = leaveBiome(w);
    expect(r).toEqual({ ok: true, banked: { biomass: 24, genetic: 3, parts: 0, mutagen: 0, crystals: 0, alloy: 0 } });
    expect(p.banked).toEqual({ biomass: 124, genetic: 8, parts: 2, mutagen: 0, crystals: 0, alloy: 0 });
    expect(p.depth).toBe(1);
    expect(p.cargo).toEqual([]);
    expect(p.structures.drone).toMatchObject({ built: true, level: 1, cargo: [], x: FACILITY.base.x, z: FACILITY.base.z });
    expect(p.structures.vat).toMatchObject({ built: true, level: 1, stock: 0 });
    expect(p.unlockedDoors).toEqual([]);
    expect(p.quests).toEqual({});
    expect(p.reactorRepaired).toBe(false);
    expect(p.player).toEqual({ x: FACILITY.playerSpawn.x, z: FACILITY.playerSpawn.z, health: computeStats(p).maxHealth });
    // Kept: mutations, perks, evolution, XP.
    expect(p.upgrades.capturePower).toBe(10);
    expect(p.perks.cargo).toBe(1);
    expect(p.evolution).toBe(1);
    expect(p.xp).toBe(6000);
    expect(w.events.some((e) => e.type === "biomeLeft" && e.depth === 1)).toBe(true);
  });

  it("the next floor is Cryo labs, starting its own quest chain at the new depth", () => {
    const w = clearedWorld();
    leaveBiome(w);
    expect(w.progress.player).toMatchObject(CRYO_MAP.playerSpawn);
    const next = createWorld(biomeAt(1).def.map, w.progress);
    expect(next.biome.def.id).toBe("cryo");
    expect(next.map).toBe(CRYO_MAP);
    expect(next.biome.depth).toBe(1);
    expect(next.targets.find((t) => t.def.id === "worker")!.def.resistance).toBeCloseTo(38);
    expect(next.targets.some((t) => t.def.id === "cryoScientist")).toBe(true);
    expect(activeQuests(next.progress).map((q) => q.id)).toEqual(["cryo-catch-crew"]);
    expect(isBiomeCleared(next.progress)).toBe(false);
  });
});

describe("saves (v9)", () => {
  const roundTrip = (p: ProgressState) => parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())))) ;

  it("migrates v8 saves into the first biome", () => {
    const s = toSaveFile(newProgress(FACILITY), defaultSettings()) as any;
    s.schemaVersion = 8;
    delete s.progress.depth;
    const parsed = parseSave(s)!;
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.progress.depth).toBe(0);
  });

  it("rejects impossible depths", () => {
    for (const depth of [-1, 1.5, "2", 1e6, null]) {
      const s = toSaveFile(newProgress(FACILITY), defaultSettings()) as any;
      s.progress.depth = depth;
      expect(parseSave(s)).toBeNull();
    }
  });

  it("round-trips a deep save: cargo rebuilt at that depth's payouts", () => {
    const p = newProgress(FACILITY);
    p.depth = 2;
    p.cargo = [{ type: "worker", weight: 2, reward: { biomass: 999 } }, { type: "vat", weight: 2, reward: { biomass: 999 } }];
    const parsed = roundTrip(p)!;
    expect(parsed.progress.depth).toBe(2);
    expect(parsed.progress.cargo.map((d) => d.reward)).toEqual([biomeAt(2).targets.worker.reward, vatBatchDrop(2).reward]);
  });

  it("clamps upgrade levels to the cap at the save's depth", () => {
    const p = newProgress(FACILITY);
    p.evolution = 1;
    p.upgrades.capturePower = 25;
    expect(roundTrip(p)!.progress.upgrades.capturePower).toBe(12);
    p.depth = 1;
    expect(roundTrip(p)!.progress.upgrades.capturePower).toBe(20);
    p.depth = 2;
    expect(roundTrip(p)!.progress.upgrades.capturePower).toBe(25);
  });

  it("accepts the state right after moving on", () => {
    const w = clearedWorld();
    leaveBiome(w);
    const parsed = roundTrip(w.progress)!;
    expect(parsed).not.toBeNull();
    expect(parsed.progress.depth).toBe(1);
    expect(parsed.progress.player).toEqual(w.progress.player);
  });

  it("scaled growth values stay finite at extreme depth", () => {
    expect(Number.isFinite(scaleAt(500).resistance)).toBe(true);
    expect(UPGRADES.capturePower.growth).toBeDefined();
  });
});

describe("review regressions", () => {
  it("a fully bought-up creature at the deepest biome still saves", () => {
    const p = newProgress(FACILITY);
    p.evolution = 1;
    p.depth = MAX_DEPTH;
    for (const id of ["capturePower", "maxHealth"] as const) {
      p.upgrades[id] = maxLevel(p, id);
      p.upgradeSpent[id] = tableCostForLevels(id, p.upgrades[id]);
      expect(Number.isFinite(p.upgradeSpent[id])).toBe(true);
    }
    p.banked.biomass = 1e70;
    p.xp = 1e70;
    p.player.health = computeStats(p).maxHealth;
    const parsed = parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))));
    expect(parsed).not.toBeNull();
    expect(parsed!.progress.upgrades.capturePower).toBe(p.upgrades.capturePower);
  });

  it("never moves past the deepest biome", () => {
    const w = clearedWorld();
    w.progress.depth = MAX_DEPTH;
    expect(leaveBiome(w)).toEqual({ ok: false, reason: "deepest" });
    expect(w.progress.depth).toBe(MAX_DEPTH);
  });

  it("players past level 10 before endless levels get those perk choices once", () => {
    const s = toSaveFile(newProgress(FACILITY), defaultSettings()) as any;
    s.schemaVersion = 8;
    delete s.progress.depth;
    s.progress.xp = 12000;
    const parsed = parseSave(s)!;
    expect(levelForXp(12000)).toBe(12);
    expect(parsed.progress.pendingPerks.map((c) => c.level)).toEqual([11, 12]);
    // Rolled from the save: loading it twice gives the same cards.
    expect(parseSave(s)!.progress.pendingPerks).toEqual(parsed.progress.pendingPerks);
    // Current saves are never backfilled.
    const again = parseSave(JSON.parse(JSON.stringify(parsed)))!;
    expect(again.progress.pendingPerks).toEqual(parsed.progress.pendingPerks);
  });

  it("one-off perk grants grow with depth, unchanged at depth 0", () => {
    const cache = PERKS.biomassCache;
    expect(grantAmount(cache, 7, 0)).toBe(30 + 15 * 7);
    expect(grantAmount(cache, 7, 1)).toBe(tidy(135 * 1.6));
    expect(describePerk(cache, 7, 1)).toContain(String(tidy(135 * 1.6)));
  });

  it("healing at base keeps pace with big health pools", () => {
    const w = clearedWorld();
    w.progress.depth = 4;
    w.progress.upgrades.maxHealth = 20;
    w.stats = computeStats(w.progress);
    const max = w.stats.maxHealth;
    w.player.x = FACILITY.base.x;
    w.player.z = FACILITY.base.z;
    w.progress.player.health = 1;
    for (let i = 0; i < 90; i++) updatePlayerHealth(w, 1 / 30);
    // Three seconds at base heals at least 35% of max per second.
    expect(w.progress.player.health).toBeGreaterThanOrEqual(Math.min(max, 1 + max * 0.35 * 3 - 1));
  });

  it("the import preview says where the save is", () => {
    const p = newProgress(FACILITY);
    p.depth = 1;
    p.floor = "cryo";
    expect(summarize(toSaveFile(p, defaultSettings())).place).toBe("Cryo labs");
    p.floor = "facility";
    p.visits = { facility: 2 };
    expect(summarize(toSaveFile(p, defaultSettings())).place).toBe("Research wing II");
  });
});
