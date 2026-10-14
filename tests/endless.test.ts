import { describe, expect, it } from "vitest";
import { BIOMES } from "../src/content/biomes";
import { EVOLUTIONS, formName, MAX_TIER } from "../src/content/evolution";
import { SUMMON } from "../src/content/feeding";
import { zoneAt } from "../src/content/map";
import { PERKS } from "../src/content/perks";
import { UPGRADES } from "../src/content/upgrades";
import { biomeAt, scaleReward } from "../src/domain/biome";
import { fillCravings } from "../src/domain/cravings";
import {
  capAt, capRaise, computeStats, ENDLESS_TENTACLE_TIERS, extraCostForLevels, levelCost, levelExtraCost, maxLevel, purchaseUpgrade,
  respecUpgrades, upgradeValue,
} from "../src/domain/economy";
import { amountText } from "../src/domain/requirements";
import { evolutionRequirements, evolutionTo, evolve } from "../src/domain/evolution";
import { feedingTuning } from "../src/domain/mutagen";
import { isLegal } from "../src/domain/perks";
import { newProgress, type ProgressState } from "../src/domain/progress";
import { startSummon, summonCost } from "../src/domain/reactor";
import { enterNextBiome } from "../src/domain/travel";
import { leaveBiome, summonWave } from "../src/game/actions";
import { stepWorld } from "../src/game/step";
import { createWorld, SIM_DT, type World } from "../src/game/world";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";

const run = (w: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) stepWorld(w);
};

function at(depth: number, tier = 1): ProgressState {
  const p = newProgress(biomeAt(depth).def.map);
  p.depth = depth;
  p.evolution = tier;
  return p;
}

const rich = (p: ProgressState) => {
  p.banked = { biomass: 1e7, genetic: 1e6, parts: 1e5, mutagen: 0, crystals: 1e5, alloy: 1e5, amber: 1e5, shards: 1e5, pearls: 1e5 };
};

describe("endless evolution tiers", () => {
  it("tier 2 needs the next floor, genetic material, alloy and more mutation levels", () => {
    const def = evolutionTo(2)!;
    expect(def.requirements).toEqual({ depth: 1, mutationLevels: 22, cost: { genetic: 80, alloy: 10 } });
    // Costs grow 1.6x per tier, like income per floor (tidied: 128 → 130).
    expect(evolutionTo(3)!.requirements.cost).toEqual({ genetic: 130, alloy: 16 });
    expect(evolutionTo(3)!.requirements.mutationLevels).toBe(34);
    expect(evolutionTo(MAX_TIER)).not.toBeNull();
    expect(evolutionTo(MAX_TIER + 1)).toBeNull();
  });

  it("can't evolve past the floor reached; evolving is one transaction", () => {
    const p = at(0);
    rich(p);
    p.mutationsBought = 100;
    expect(evolve(p)).toEqual({ ok: false, reason: "requirements" });
    expect(evolutionRequirements(p).find((r) => r.label.startsWith("Reach"))!.met).toBe(false);

    const q = at(1);
    rich(q);
    q.mutationsBought = 22;
    const before = { ...q.banked };
    expect(evolve(q)).toEqual({ ok: true, tier: 2 });
    expect(q.banked.genetic).toBe(before.genetic - 80);
    expect(q.banked.alloy).toBe(before.alloy - 10);
    expect(evolve(q)).toEqual({ ok: false, reason: "requirements" }); // tier 3 needs depth 2

    const poor = at(1);
    poor.mutationsBought = 22;
    poor.banked.genetic = 80;
    poor.banked.alloy = 9;
    expect(evolve(poor)).toEqual({ ok: false, reason: "requirements" });
    expect(poor.evolution).toBe(1);
    expect(poor.banked.genetic).toBe(80);
  });

  it("each endless tier multiplies capture power and health, and adds cargo levels", () => {
    const a = at(1, 1);
    const b = at(1, 2);
    expect(computeStats(b).capturePower).toBeCloseTo(computeStats(a).capturePower * 1.25);
    expect(computeStats(b).maxHealth).toBe(Math.round(computeStats(a).maxHealth * 1.2));
    expect(capAt("cargoCapacity", 1, 1)).toBe(12);
    expect(capAt("cargoCapacity", 2, 1)).toBe(14);
    expect(capAt("cargoCapacity", 5, 1)).toBe(20);
    // Past the table, cargo levels stay linear in value and compound in price.
    expect(levelCost("cargoCapacity", 12)).toBeGreaterThan(UPGRADES.cargoCapacity.costs[11]!);
    b.upgrades.cargoCapacity = 13;
    expect(upgradeValue(b, "cargoCapacity")).toBe(20 + 8 * 13);
  });

  it("tier bonuses add up rather than compound, so they never run away from depth scaling", () => {
    const one = computeStats(at(30, 1));
    const deep = computeStats(at(30, 31));
    expect(deep.capturePower / one.capturePower).toBeCloseTo(1 + 0.25 * 30);
    expect(deep.maxHealth).toBe(Math.round(one.maxHealth * (1 + 0.2 * 30)));
  });

  it("at a cargo cap that only the next form raises, says to go deeper while that form is out of reach", () => {
    const p = at(1, 2);
    p.upgrades.cargoCapacity = capAt("cargoCapacity", 2, 1);
    expect(capRaise(p, "cargoCapacity")).toBe("nextBiome"); // tier 3 needs depth 2
    p.depth = 2;
    expect(capRaise(p, "cargoCapacity")).toBe("evolve");
    const q = at(0, 0);
    q.upgrades.cargoCapacity = capAt("cargoCapacity", 0, 0);
    expect(capRaise(q, "cargoCapacity")).toBe("evolve"); // the hand-made form has no depth gate
  });

  it("huge prices read cleanly", () => {
    expect(amountText(80)).toBe("80");
    expect(amountText(8.699999999999999e62)).toBe("8.7e+62");
    const p = at(300, 300);
    const pay = evolutionRequirements(p).filter((r) => r.label.startsWith("Pay"));
    for (const r of pay) expect(r.label).toMatch(/^Pay \d(\.\d+)?e\+\d+ /);
  });

  it("tentacles never pass 8, and a tentacle level bought late is never wasted", () => {
    expect(ENDLESS_TENTACLE_TIERS).toBe(2);
    for (const tier of [1, 2, 3, 4, 10, MAX_TIER]) {
      const p = at(300, tier);
      const lvls = UPGRADES.tentacles.costs.length;
      p.upgrades.tentacles = lvls - 1;
      const short = computeStats(p).tentacles;
      p.upgrades.tentacles = lvls;
      expect(computeStats(p).tentacles).toBe(short + 1);
      expect(computeStats(p).tentacles).toBeLessThanOrEqual(8);
    }
    const p = at(300, 3);
    p.upgrades.tentacles = 3;
    expect(computeStats(p).tentacles).toBe(8);
    expect(evolutionTo(3)!.tentacleBonus).toBe(1);
    expect(evolutionTo(4)!.tentacleBonus).toBe(0);
  });

  it("names cycle with a numeral, and never repeat a hand-made name", () => {
    expect(formName(0)).toBe("Larval form");
    expect(formName(1)).toBe(EVOLUTIONS[0]!.name);
    expect(formName(2)).toBe("Ravager form");
    expect(formName(6)).toBe("Ravager form II");
    expect(formName(MAX_TIER)).toMatch(/form [IVXLC]+$/);
  });
});

describe("alloy sink: deep capture power", () => {
  it("levels past 24 cost alloy too, growing 1.06x per level", () => {
    expect(levelExtraCost("capturePower", 23)).toBeNull();
    expect(levelExtraCost("capturePower", 24)).toEqual({ currency: "alloy", amount: 4 });
    expect(levelExtraCost("capturePower", 32)!.amount).toBeGreaterThan(6);
    expect(levelExtraCost("maxHealth", 40)).toBeNull();
  });

  it("buys atomically with both prices, and a respec refunds both exactly", () => {
    const p = at(2);
    expect(maxLevel(p, "capturePower")).toBe(28);
    p.upgrades.capturePower = 24;
    p.banked.biomass = 1e6;
    p.banked.alloy = 3;
    const before = { ...p.banked };
    expect(purchaseUpgrade(p, "capturePower")).toEqual({ ok: false, reason: "unaffordable" });
    expect(p.banked).toEqual(before);
    expect(p.upgrades.capturePower).toBe(24);

    p.banked.alloy = 100;
    const cost = levelCost("capturePower", 24)!;
    expect(purchaseUpgrade(p, "capturePower")).toEqual({ ok: true });
    expect(p.banked.alloy).toBe(96);
    expect(p.banked.biomass).toBe(1e6 - cost);
    expect(p.upgradeExtraSpent.capturePower).toBe(4);

    const r = respecUpgrades(p);
    expect(r.ok && r.refund.alloy).toBe(4);
    expect(p.banked.alloy).toBe(100);
    expect(p.upgradeExtraSpent.capturePower).toBe(0);
  });
});

describe("loop perks", () => {
  it("are offered and stack with mutagen tuning", () => {
    const p = at(0);
    expect(isLegal(p, "warmBlood")).toBe(false);
    expect(isLegal(at(1), "warmBlood")).toBe(true);
    const base = feedingTuning(p);
    p.perks = { frenzy: 2, combo: 1, pods: 2 };
    p.mutagenLevels = { frenzyTime: 1 };
    const t = feedingTuning(p);
    expect(t.frenzySeconds).toBe(base.frenzySeconds + 3 + 1);
    expect(t.comboWindow).toBe(base.comboWindow + 0.5);
    expect(t.boostChance).toBeCloseTo(base.boostChance + 0.2);
    for (const id of ["frenzy", "combo", "bounty", "pods", "warmBlood"] as const) expect(PERKS[id].maxStacks).toBeGreaterThan(0);
  });

  it("Warm blood adds chill resistance (still capped at 90%)", () => {
    const p = at(1);
    p.perks = { warmBlood: 2 };
    expect(computeStats(p).chillResist).toBe(20);
    p.upgrades.thermalFat = 4;
    p.perks = { warmBlood: 3 };
    expect(computeStats(p).chillResist).toBe(90);
  });

  it("Bounty hunter raises new cravings' payout, and what's shown is what's paid", () => {
    const plain = at(0);
    fillCravings(plain);
    const p = at(0);
    p.perks = { bounty: 2 };
    fillCravings(p);
    expect(p.cravings.map((c) => c.reward)).toEqual(plain.cravings.map((c) => c.reward + 2));
  });
});

/** A floor whose objective is done, with nothing else alive. */
function finished(depth: number): World {
  const biome = biomeAt(depth);
  const p = newProgress(biome.def.map);
  p.depth = depth;
  p.evolution = 1;
  for (const d of biome.def.map.doors) p.unlockedDoors.push(d.id);
  for (const q of biome.quests) p.quests[q.id] = { count: 1, done: true };
  p.reactorRepaired = true;
  rich(p);
  for (const id of Object.keys(p.spawnCooldowns)) p.spawnCooldowns[id] = 1e6;
  const w = createWorld(biome.def.map, p);
  w.targets.length = 0;
  w.feeding.prizedTimer = 1e9;
  const o = biome.objective;
  // Next to the machine, outside its footprint.
  w.player.x = w.player.prevX = p.player.x = o.x;
  w.player.z = w.player.prevZ = p.player.z = o.z + o.halfSize + 1;
  return w;
}

describe("objective machines summon reward waves", () => {
  it("every floor's wave summons free-roaming creatures that live there, around the machine on open floor", () => {
    for (let d = 0; d < BIOMES.length; d++) {
      const b = biomeAt(d);
      expect(b.def.summon.types.length).toBeGreaterThan(0);
      for (const t of b.def.summon.types) {
        expect(["wander", "flee"]).toContain(b.targets[t].behavior);
        expect(b.def.map.spawns.some((s) => s.type === t)).toBe(true);
      }
      const w = finished(d);
      expect(summonWave(w).ok).toBe(true);
      const summoned = w.targets.filter((t) => t.summoned);
      expect(summoned).toHaveLength(SUMMON.count);
      const room = zoneAt(w.map, b.objective.x, b.objective.z)!.id;
      for (const t of summoned) {
        // On open floor in the machine's own room: never inside the console or a wall.
        expect(zoneAt(w.map, t.x, t.z)?.id).toBe(room);
        const inside = w.obstacles.some((r) => t.x + 0.3 > r.minX && t.x - 0.3 < r.maxX && t.z + 0.3 > r.minZ && t.z - 0.3 < r.maxZ);
        expect(inside, `${b.name}: ${t.def.id} at ${t.x.toFixed(2)}, ${t.z.toFixed(2)}`).toBe(false);
      }
      // Spread out, not stacked.
      expect(new Set(summoned.map((t) => `${t.x.toFixed(2)},${t.z.toFixed(2)}`)).size).toBe(SUMMON.count);
    }
  });

  it("only works at the machine, and each wave on a floor costs 1.2x the last", () => {
    const w = finished(0);
    w.player.x = w.player.prevX = w.map.base.x;
    w.player.z = w.player.prevZ = w.map.base.z;
    expect(summonWave(w)).toEqual({ ok: false, reason: "notAtConsole" });

    const p = at(0);
    rich(p);
    p.reactorRepaired = true;
    expect(summonCost(p)).toEqual({ biomass: 60 });
    expect(startSummon(p).ok).toBe(true);
    p.summon.left = 0;
    expect(summonCost(p)).toEqual({ biomass: 72 });
    const before = p.banked.biomass;
    expect(startSummon(p).ok).toBe(true);
    expect(p.banked.biomass).toBe(before - 72);
    p.summon.left = 0;
    expect(summonCost(p).biomass).toBeGreaterThan(72);
  });

  it("leaving banks summoned catches at the multiplier, from the hold and the helpers", () => {
    const w = finished(0);
    const p = w.progress;
    const def = biomeAt(0).targets.runner;
    const drop = () => ({ type: def.id, weight: def.weight, reward: scaleReward(def.reward, SUMMON.rewardMultiplier), summoned: true as const });
    p.cargo.push(drop());
    p.structures.drone.built = true;
    p.structures.drone.level = 1;
    p.structures.drone.cargo.push(drop());
    p.structures.catcher.built = true;
    p.structures.catcher.level = 1;
    p.structures.catcher.cargo.push(drop());
    p.summon = { waves: 1, left: 3 };
    const exit = biomeAt(0).def.exit;
    w.player.x = exit.x;
    w.player.z = exit.z;
    const before = p.banked.biomass;
    const r = leaveBiome(w);
    expect(r.ok).toBe(true);
    expect(p.banked.biomass - before).toBeCloseTo(3 * def.reward.biomass! * SUMMON.rewardMultiplier);
    expect(p.summon).toEqual({ waves: 0, left: 0 });
  });

  it("needs the objective done, pays the scaled cost once, and allows one wave at a time", () => {
    const p = at(1);
    rich(p);
    expect(startSummon(p)).toEqual({ ok: false, reason: "notDone" });
    p.reactorRepaired = true;
    const before = { ...p.banked };
    expect(startSummon(p)).toEqual({ ok: true, count: SUMMON.count });
    const cost = biomeAt(1).summonCost;
    expect(cost.crystals).toBe(24); // 15 x 1.6
    expect(p.banked.crystals).toBe(before.crystals - 24);
    expect(p.banked.biomass).toBe(before.biomass - cost.biomass!);
    expect(startSummon(p)).toEqual({ ok: false, reason: "active" });

    const broke = at(0);
    broke.reactorRepaired = true;
    expect(startSummon(broke)).toEqual({ ok: false, reason: "requirements" });
    expect(broke.summon).toEqual({ waves: 0, left: 0 });
  });

  it("summoned catches pay the multiplier, never touch spawn timers, and clear the wave", () => {
    const w = finished(0);
    w.progress.upgrades.capturePower = 12;
    w.progress.upgrades.cargoCapacity = 12;
    w.progress.upgrades.tentacles = 3;
    w.progress.upgrades.captureRadius = 7;
    w.stats = computeStats(w.progress);
    const spawnIds = Object.keys(w.progress.spawnCooldowns).sort();
    expect(summonWave(w).ok).toBe(true);
    for (let i = 0; i < 40 && w.progress.summon.left > 0; i++) {
      for (const t of w.targets) {
        if (!t.summoned) continue;
        t.x = t.homeX = w.player.x + 0.8;
        t.z = t.homeZ = w.player.z;
      }
      run(w, 0.5);
    }
    expect(w.progress.summon.left).toBe(0);
    // Spawn points only ticked down (nothing caught reset one), and none was added.
    expect(Object.keys(w.progress.spawnCooldowns).sort()).toEqual(spawnIds);
    for (const cd of Object.values(w.progress.spawnCooldowns)) expect(cd).toBeGreaterThan(1e6 - 100);
    const drops = w.progress.cargo.filter((d) => d.summoned);
    expect(drops.length).toBeGreaterThan(0);
    for (const d of drops) expect(d.reward).toEqual(scaleReward(biomeAt(0).targets[d.type as "worker"].reward, SUMMON.rewardMultiplier));
  });

  it("a paid wave and its catches survive a save and reload", () => {
    const w = finished(1);
    expect(summonWave(w).ok).toBe(true);
    const t = w.targets.find((x) => x.summoned)!;
    w.progress.cargo.push({ type: t.def.id, weight: t.def.weight, reward: { ...t.def.reward }, summoned: true });
    w.progress.summon.left -= 1;
    const loaded = parseSave(JSON.parse(JSON.stringify(toSaveFile(w.progress, defaultSettings()))))!;
    expect(loaded.progress.summon).toEqual({ waves: 1, left: SUMMON.count - 1 });
    expect(loaded.progress.cargo[0]).toEqual(w.progress.cargo[0]);
    const again = createWorld(biomeAt(1).def.map, loaded.progress);
    expect(again.targets.filter((x) => x.summoned)).toHaveLength(SUMMON.count - 1);
  });

  it("a summoned flag on a creature this floor doesn't summon is ignored", () => {
    const p = at(0);
    p.cargo.push({ type: "guard", weight: 3, reward: { biomass: 1e6 }, summoned: true });
    const loaded = parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))))!;
    expect(loaded.progress.cargo[0]).toEqual({ type: "guard", weight: 3, reward: biomeAt(0).targets.guard.reward });
  });

  it("moving on leaves a roaming wave behind", () => {
    const p = at(0);
    p.reactorRepaired = true;
    p.summon = { waves: 2, left: 5 };
    enterNextBiome(p);
    expect(p.summon).toEqual({ waves: 0, left: 0 });
  });
});

describe("v13 saves", () => {
  it("migrates a v12 save: nothing paid in alloy, no wave, endless tiers allowed", () => {
    const p = at(3, 1);
    const s = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    s.schemaVersion = 12;
    delete s.progress.upgradeExtraSpent;
    delete s.progress.summon;
    const loaded = parseSave(s)!;
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.progress.summon).toEqual({ waves: 0, left: 0 });
    expect(Object.values(loaded.progress.upgradeExtraSpent).every((v) => v === 0)).toBe(true);
  });

  it("a v12 save with capture power past 24 paid no alloy, so a respec refunds none", () => {
    const p = at(2, 1);
    p.upgrades.capturePower = 28;
    p.upgradeSpent.capturePower = 5000;
    const s = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    s.schemaVersion = 12;
    delete s.progress.upgradeExtraSpent;
    delete s.progress.summon;
    const loaded = parseSave(s)!.progress;
    expect(loaded.upgrades.capturePower).toBe(28);
    expect(loaded.upgradeExtraSpent.capturePower).toBe(0);
    const r = respecUpgrades(loaded);
    expect(r.ok && r.refund.alloy).toBe(0);
    expect(r.ok && r.refund.biomass).toBe(5000);
  });

  it("the second-price ledger can be rebuilt from levels (dev devolve)", () => {
    expect(extraCostForLevels("capturePower", 24)).toBe(0);
    expect(extraCostForLevels("capturePower", 26)).toBe(levelExtraCost("capturePower", 24)!.amount + levelExtraCost("capturePower", 25)!.amount);
    expect(extraCostForLevels("moveSpeed", 7)).toBe(0);
  });

  it("keeps endless tiers and deep levels, and rejects malformed new fields", () => {
    const p = at(4, 5);
    p.upgrades.capturePower = 40;
    p.upgradeExtraSpent.capturePower = 55;
    p.upgrades.cargoCapacity = capAt("cargoCapacity", 5, 4);
    const ok = parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))))!;
    expect(ok.progress.evolution).toBe(5);
    expect(ok.progress.upgrades.capturePower).toBe(40);
    expect(ok.progress.upgrades.cargoCapacity).toBe(20);
    expect(ok.progress.upgradeExtraSpent.capturePower).toBe(55);

    const bad = (f: (s: any) => void) => {
      const s = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
      f(s);
      return parseSave(s);
    };
    expect(bad((s) => (s.progress.summon = { waves: 0, left: -1 }))).toBeNull();
    expect(bad((s) => (s.progress.summon = { waves: 0.5, left: 0 }))).toBeNull();
    expect(bad((s) => delete s.progress.summon)).toBeNull();
    expect(bad((s) => (s.progress.upgradeExtraSpent.capturePower = -1))).toBeNull();
    expect(bad((s) => (s.progress.summon = { waves: 3, left: 99 }))!.progress.summon.left).toBe(SUMMON.count);
    // A second price only exists on capture power.
    expect(bad((s) => (s.progress.upgradeExtraSpent.moveSpeed = 7))!.progress.upgradeExtraSpent.moveSpeed).toBe(0);
  });
});
