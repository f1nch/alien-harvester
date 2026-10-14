import { describe, expect, it } from "vitest";
import { BIOMES } from "../src/content/biomes";
import { SPECIMEN_VAULTS, VAULTS_MAP } from "../src/content/vaults";
import { TARGETS } from "../src/content/targets";
import { SUMMON } from "../src/content/feeding";
import { biomeAt, scaleAt, scaleCost, scaleReward } from "../src/domain/biome";
import { fillCravings } from "../src/domain/cravings";
import { evolutionRequirements } from "../src/domain/evolution";
import { newProgress } from "../src/domain/progress";
import { enterNextBiome } from "../src/domain/travel";
import { stepWorld } from "../src/game/step";
import { createWorld, SIM_DT } from "../src/game/world";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";

describe("Specimen vaults", () => {
  it("is the third floor, and the chain then repeats", () => {
    expect(BIOMES[2]).toBe(SPECIMEN_VAULTS);
    expect(biomeAt(2).name).toBe("Specimen vaults");
    expect(biomeAt(2).region).toBe("Facility floor B3");
    expect(biomeAt(3).name).toBe("Hangar");
    expect(biomeAt(4).name).toBe("Research wing II");
    expect(biomeAt(6).name).toBe("Specimen vaults II");
  });

  it("follows Cryo labs: moving on from depth 1 lands in the vaults, starting its quests", () => {
    const p = newProgress(biomeAt(1).def.map);
    p.depth = 1;
    p.unlockedDoors = ["cryo-door-cold"];
    p.reactorRepaired = true;
    p.summon = { waves: 1, left: 2 };
    enterNextBiome(p);
    expect(p.depth).toBe(2);
    expect(p.unlockedDoors).toEqual([]);
    expect(p.player.x).toBe(VAULTS_MAP.playerSpawn.x);
    const w = createWorld(VAULTS_MAP, p);
    expect(w.biome.def.id).toBe("vaults");
    expect(w.targets.some((t) => t.def.id === "handler")).toBe(true);
  });

  it("has a genes-heavy mix: tanks rich in genetic material, a fighting chimera, a fleeing lurker", () => {
    expect(TARGETS.specimenTank.behavior).toBe("static");
    expect(TARGETS.specimenTank.reward.genetic).toBeGreaterThan(TARGETS.specimenTank.reward.biomass! * 0.9);
    expect(TARGETS.chimera.combat).toBeDefined();
    expect(TARGETS.lurker.behavior).toBe("flee");
    expect(TARGETS.alphaSpecimen.behavior).toBe("boss");
    expect(SPECIMEN_VAULTS.summon.types).toEqual(["handler", "lurker"]);
  });

  it("the third endless form asks for depth 2", () => {
    const p = newProgress(VAULTS_MAP);
    p.depth = 1;
    p.evolution = 2;
    expect(evolutionRequirements(p).some((r) => r.label === "Reach depth 2" && !r.met)).toBe(true);
  });

  it("cravings only ask for creatures in rooms you can reach", () => {
    const p = newProgress(VAULTS_MAP);
    p.depth = 2;
    for (let i = 0; i < 30; i++) {
      p.cravings = [];
      fillCravings(p);
      for (const c of p.cravings) if (c.kind === "capture") expect(["worker", "handler"]).toContain(c.target);
    }
  });

  it("a cracked specimen tank is a creature, not a supply pod: cravings, bestiary, no power-up", () => {
    const p = newProgress(VAULTS_MAP);
    p.depth = 2;
    p.evolution = 1;
    p.upgrades.capturePower = 28;
    p.unlockedDoors = ["vault-door-pens", "vault-door-tanks"];
    // Pod luck maxed: a pod would always give a power-up.
    p.mutagenLevels = { podLuck: 4 };
    p.perks = { pods: 2 };
    p.cravings = [{ kind: "capture", target: "specimenTank", goal: 3, progress: 0, reward: 4 }];
    const w = createWorld(VAULTS_MAP, p);
    w.feeding.prizedTimer = 1e9;
    const tank = w.targets.find((t) => t.def.id === "specimenTank" && t.spawnId === "vault-tanks-t4")!; // at (0, 53)
    w.targets = [tank];
    w.player.x = w.player.prevX = p.player.x = 0;
    w.player.z = w.player.prevZ = p.player.z = 51.2;
    for (let i = 0; i < 20 / SIM_DT && w.targets.includes(tank); i++) stepWorld(w);
    expect(w.targets.includes(tank)).toBe(false);
    expect(p.bestiary.specimenTank).toBe(1);
    expect(p.cravings.find((c) => c.target === "specimenTank")?.progress).toBe(1);
    expect(w.feeding.boosts).toEqual({});
  });

  it("plays and saves mid-floor", () => {
    const p = newProgress(VAULTS_MAP);
    p.depth = 2;
    p.unlockedDoors = ["vault-door-pens", "vault-door-tanks"];
    p.quests = { "vault-catch-handlers": { count: 4, done: true } };
    const w = createWorld(VAULTS_MAP, p);
    for (let i = 0; i < 10 / SIM_DT; i++) stepWorld(w);
    const loaded = parseSave(JSON.parse(JSON.stringify(toSaveFile(w.progress, defaultSettings()))))!;
    expect(loaded.progress.depth).toBe(2);
    expect(loaded.progress.unlockedDoors).toEqual(["vault-door-pens", "vault-door-tanks"]);
    expect(loaded.progress.quests["vault-catch-handlers"]?.done).toBe(true);
  });
});

describe("v14 saves", () => {
  /** A v13 save at a depth, mid-floor on whatever floor that depth was then. */
  function v13At(depth: number) {
    const p = newProgress(biomeAt(depth).def.map);
    p.depth = depth;
    p.unlockedDoors = ["door-service"];
    p.quests = { "q-open-service": { count: 0, done: true } };
    p.reactorRepaired = true;
    p.banked.genetic = 77;
    p.evolution = 2;
    p.structures.outpost = { built: true, level: 1 };
    const s = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    s.schemaVersion = 13;
    s.progress.summon = { waves: 2, left: 4 };
    return s;
  }

  it("starts fresh on depths whose floor changed (d % 2 then, d % 3 now), keeping the creature", () => {
    for (const depth of [2, 3, 4, 5, 8]) {
      const loaded = parseSave(v13At(depth))!;
      expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
      const p = loaded.progress;
      expect(p.depth).toBe(depth);
      expect(p.reactorRepaired, `depth ${depth}`).toBe(false);
      expect(p.unlockedDoors).toEqual([]);
      expect(p.quests).toEqual({});
      expect(p.summon).toEqual({ waves: 0, left: 0 });
      expect(p.structures.outpost.built).toBe(false);
      expect(p.banked.genetic).toBe(77);
      expect(p.evolution).toBe(2);
    }
  });

  it("refunds a forward base and an unfinished wave, and keeps summoned catches' bonus", () => {
    const s = v13At(2); // the facility (Research wing II) before, the vaults now
    s.progress.summon = { waves: 2, left: 4 };
    s.progress.cargo = [{ type: "runner", weight: 2, reward: { biomass: 1 }, summoned: true }];
    const before = s.progress.banked;
    const p = parseSave(s)!.progress;
    const k = scaleAt(2).cost;
    const outpost = scaleCost(BIOMES[0]!.outpost.cost, k);
    const wave = scaleCost(scaleCost(BIOMES[0]!.summon.cost, k), 1.2);
    expect(p.banked.biomass).toBe(before.biomass + outpost.biomass! + wave.biomass!);
    expect(p.banked.parts).toBe(before.parts + outpost.parts!);
    expect(p.cargo[0]!.reward).toEqual(scaleReward(biomeAt(2).targets.runner.reward, SUMMON.rewardMultiplier));
    // Unchanged floors refund nothing: their base and wave are still there.
    const same = parseSave(v13At(12))!.progress;
    expect(same.banked.biomass).toBe(before.biomass);
  });

  it("v10 saves at depth 3 are reset twice over (known: Cryo then, the facility now)", () => {
    const p = newProgress(biomeAt(3).def.map);
    p.depth = 3;
    p.unlockedDoors = ["door-service"];
    p.reactorRepaired = true;
    const s = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    s.schemaVersion = 10;
    const loaded = parseSave(s)!.progress;
    expect(loaded.unlockedDoors).toEqual([]);
    expect(loaded.reactorRepaired).toBe(false);
  });

  it("leaves depths whose floor is the same alone", () => {
    for (const depth of [1, 13]) {
      const s = v13At(depth);
      s.progress.unlockedDoors = ["cryo-door-cold"];
      expect(parseSave(s)!.progress.unlockedDoors, `depth ${depth}`).toEqual(["cryo-door-cold"]);
    }
    for (const depth of [0, 1, 12, 13]) {
      const p = parseSave(v13At(depth))!.progress;
      expect(p.reactorRepaired, `depth ${depth}`).toBe(true);
      expect(p.summon).toEqual({ waves: 2, left: 4 });
      expect(p.structures.outpost.built).toBe(true);
    }
  });
});
