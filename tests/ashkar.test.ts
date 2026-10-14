import { describe, expect, it } from "vitest";
import { ASHKAR, ASHKAR_MAP } from "../src/content/ashkar";
import { BIOMES } from "../src/content/biomes";
import { zoneAt } from "../src/content/map";
import { STORM } from "../src/content/storm";
import { TARGETS } from "../src/content/targets";
import { UPGRADES } from "../src/content/upgrades";
import { biomeAt } from "../src/domain/biome";
import { purchaseUpgrade, respecUpgrades } from "../src/domain/economy";
import { newProgress } from "../src/domain/progress";
import { enterNextBiome } from "../src/domain/travel";
import { stepWorld } from "../src/game/step";
import { sheltered } from "../src/game/systems/storm";
import { createWorld, refreshStats, SIM_DT, type World } from "../src/game/world";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";
import { summarize } from "../src/persistence/transfer";

const run = (w: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) stepWorld(w);
};

/** Ashkar with nothing alive, the player standing at (x, z). */
function standAt(x: number, z: number): World {
  const p = newProgress(ASHKAR_MAP);
  p.depth = 5;
  p.unlockedDoors = ASHKAR_MAP.doors.map((d) => d.id);
  p.player = { x, z, health: 100 };
  for (const id of Object.keys(p.spawnCooldowns)) p.spawnCooldowns[id] = 1e6;
  const w = createWorld(ASHKAR_MAP, p);
  w.targets.length = 0;
  w.feeding.prizedTimer = 1e9;
  return w;
}

describe("Ashkar, the second portal world", () => {
  it("comes after Vesh, through its portal, as a first visit", () => {
    expect(BIOMES[5]).toBe(ASHKAR);
    const p = newProgress(biomeAt(4).def.map);
    p.depth = 4;
    expect(p.floor).toBe("vesh");
    enterNextBiome(p);
    expect(p.floor).toBe("ashkar");
    const w = createWorld(ASHKAR_MAP, p);
    expect(w.biome.name).toBe("Ashkar");
    expect(w.biome.region).toBe("Portal world: desert ruins");
    expect(w.biome.arrival).toBe(ASHKAR.arrival);
    expect(w.targets.some((t) => t.def.id === "sandSkink")).toBe(true);
  });

  it("pays relic shards, and the urns are cracked-open creatures, not loot", () => {
    expect(TARGETS.sandSkink.reward.shards).toBeGreaterThan(0);
    expect(TARGETS.burialUrn.behavior).toBe("static");
    expect(TARGETS.burialUrn.loot).toBeFalsy();
    expect(ASHKAR.objective.repair.cost?.shards).toBeGreaterThan(0);
    const first = ASHKAR_MAP.doors[0]!.requirements.cost!.shards!;
    expect(first / TARGETS.sandSkink.reward.shards!).toBeLessThanOrEqual(8);
  });

  it("every shade canopy stands in an exposed zone, clear of props", () => {
    for (const s of ASHKAR_MAP.shade!) {
      expect(zoneAt(ASHKAR_MAP, s.x, s.z)?.exposed).toBe(true);
      for (const r of ASHKAR_MAP.props) {
        const dx = Math.max(r.minX - s.x, 0, s.x - r.maxX);
        const dz = Math.max(r.minZ - s.z, 0, s.z - r.maxZ);
        expect(Math.hypot(dx, dz)).toBeGreaterThan(0.5);
      }
    }
  });
});

describe("sandstorms", () => {
  it("cycle calm, warning, blowing, calm on simulation time, with events", () => {
    const w = standAt(0, 25);
    expect(w.storm.phase).toBe("calm");
    run(w, STORM.firstCalmSeconds + 0.1);
    expect(w.storm.phase).toBe("warning");
    run(w, STORM.warnSeconds);
    expect(w.storm.phase).toBe("blowing");
    run(w, STORM.blowSeconds);
    expect(w.storm.phase).toBe("calm");
    const kinds = w.events.map((e) => e.type).filter((t) => t.startsWith("storm"));
    expect(kinds).toEqual(["stormWarning", "stormStart", "stormEnd"]);
  });

  it("cut capture reach out in the open, not in shade or the sheltered ruins", () => {
    const open = standAt(0, 25); // the shifting dunes
    const reach = open.stats.captureRadius;
    run(open, STORM.firstCalmSeconds + STORM.warnSeconds + STORM.rampSeconds + 0.5);
    expect(open.storm.phase).toBe("blowing");
    expect(open.stats.captureRadius).toBeCloseTo(reach * (1 - STORM.reachPenalty / 100), 5);

    const shade = ASHKAR_MAP.shade![1]!;
    const shaded = standAt(shade.x, shade.z);
    expect(sheltered(shaded)).toBe(true);
    run(shaded, STORM.firstCalmSeconds + STORM.warnSeconds + STORM.rampSeconds + 0.5);
    expect(shaded.stats.captureRadius).toBeCloseTo(reach, 5);

    const ruins = standAt(0, 48); // the sunken colonnade
    expect(sheltered(ruins)).toBe(true);
    run(ruins, STORM.firstCalmSeconds + STORM.warnSeconds + STORM.rampSeconds + 0.5);
    expect(ruins.stats.captureRadius).toBeCloseTo(reach, 5);
  });

  it("Dust lids soften the storm, bought with shards", () => {
    const w = standAt(0, 25);
    w.progress.banked.shards = 1000;
    expect(UPGRADES.dustLids.currency).toBe("shards");
    for (let i = 0; i < 2; i++) expect(purchaseUpgrade(w.progress, "dustLids")).toEqual({ ok: true });
    refreshStats(w);
    const reach = w.stats.captureRadius;
    run(w, STORM.firstCalmSeconds + STORM.warnSeconds + STORM.rampSeconds + 0.5);
    // 40% resist: the penalty is 60% of its full size.
    expect(w.stats.captureRadius).toBeCloseTo(reach * (1 - (STORM.reachPenalty * 0.6) / 100), 5);
  });

  it("stepping into shade mid-storm restores reach on that tick; the base pad shelters too", () => {
    const w = standAt(0, 25);
    const reach = w.stats.captureRadius;
    run(w, STORM.firstCalmSeconds + STORM.warnSeconds + STORM.rampSeconds + 0.5);
    expect(w.stats.captureRadius).toBeLessThan(reach);
    const shade = ASHKAR_MAP.shade![1]!;
    w.player.x = w.player.prevX = shade.x;
    w.player.z = w.player.prevZ = shade.z;
    stepWorld(w);
    expect(w.stormApplied).toBe(0);
    expect(w.stats.captureRadius).toBeCloseTo(reach, 5);

    const pad = standAt(ASHKAR_MAP.base.x, ASHKAR_MAP.base.z);
    expect(sheltered(pad)).toBe(true);
  });

  it("the first storm waits longer than the rest", () => {
    const w = standAt(0, 25);
    run(w, STORM.calmSeconds + 1);
    expect(w.storm.phase).toBe("calm");
    expect(STORM.firstCalmSeconds).toBeGreaterThan(STORM.calmSeconds);
  });

  it("a Magnet power-up and a full storm add up as percentages, never below 70% of reach", () => {
    const w = standAt(0, 25);
    const reach = w.stats.captureRadius;
    w.feeding.boosts.magnet = 999;
    run(w, STORM.firstCalmSeconds + STORM.warnSeconds + STORM.rampSeconds + 0.5);
    expect(w.stats.captureRadius).toBeCloseTo((reach * (100 + 50 - STORM.reachPenalty)) / 100, 5);
    w.feeding.boosts = {};
    refreshStats(w);
    expect(w.stats.captureRadius).toBeGreaterThanOrEqual(reach * 0.7 - 1e-9);
  });

  it("a respec refunds Dust lids in shards", () => {
    const p = newProgress(ASHKAR_MAP);
    p.depth = 5;
    p.banked.shards = 500;
    for (let i = 0; i < 4; i++) purchaseUpgrade(p, "dustLids");
    const r = respecUpgrades(p);
    expect(r.ok && r.refund.shards).toBe(15 + 40 + 75 + 120);
    expect(p.banked.shards).toBe(500);
  });

  it("never blow on floors without storms", () => {
    const p = newProgress(biomeAt(4).def.map);
    p.depth = 4;
    const w = createWorld(biomeAt(4).def.map, p);
    run(w, STORM.firstCalmSeconds + STORM.warnSeconds + 3);
    expect(w.storm.phase).toBe("calm");
    expect(w.stormApplied).toBe(0);
  });
});

describe("v17 saves", () => {
  it("migrates v16: no shards, no Dust lids, nothing else changed", () => {
    const p = newProgress(biomeAt(4).def.map);
    p.depth = 4;
    p.banked.amber = 77;
    p.unlockedDoors = ["vesh-door-canopy"];
    const s = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    s.schemaVersion = 16;
    delete s.progress.banked.shards;
    delete s.progress.upgrades.dustLids;
    delete s.progress.upgradeSpent.dustLids;
    delete s.progress.upgradeExtraSpent.dustLids;
    const loaded = parseSave(s)!;
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.progress.banked.shards).toBe(0);
    expect(loaded.progress.banked.amber).toBe(77);
    expect(loaded.progress.upgrades.dustLids).toBe(0);
    expect(loaded.progress.floor).toBe("vesh");
    expect(loaded.progress.unlockedDoors).toEqual(["vesh-door-canopy"]);
  });

  it("round-trips Ashkar mid-storm; the storm itself is never saved", () => {
    const w = standAt(0, 25);
    w.progress.banked.shards = 33.5;
    run(w, STORM.firstCalmSeconds + STORM.warnSeconds + 1);
    expect(w.storm.phase).toBe("blowing");
    const save = toSaveFile(w.progress, defaultSettings());
    expect(JSON.stringify(save)).not.toContain("blowing");
    const loaded = parseSave(JSON.parse(JSON.stringify(save)))!;
    expect(loaded.progress.floor).toBe("ashkar");
    expect(loaded.progress.banked.shards).toBe(33.5);
    expect(summarize(loaded).shards).toBe(33);
    expect(createWorld(ASHKAR_MAP, loaded.progress).storm.phase).toBe("calm");
  });
});
