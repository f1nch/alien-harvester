import { describe, expect, it } from "vitest";
import { BIOMES } from "../src/content/biomes";
import { UPGRADES } from "../src/content/upgrades";
import { VESH, VESH_MAP } from "../src/content/vesh";
import { inResin } from "../src/content/map";
import { TARGETS } from "../src/content/targets";
import { biomeAt } from "../src/domain/biome";
import { computeStats, purchaseUpgrade, respecUpgrades } from "../src/domain/economy";
import { newProgress } from "../src/domain/progress";
import { enterNextBiome } from "../src/domain/travel";
import { stepWorld } from "../src/game/step";
import { damagePlayer } from "../src/game/systems/combat";
import { RESIN_SPEED } from "../src/game/systems/movement";
import { createWorld, refreshStats, SIM_DT } from "../src/game/world";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";
import { summarize } from "../src/persistence/transfer";

function at(depth = 4) {
  const p = newProgress(VESH_MAP);
  p.depth = depth;
  return p;
}

describe("Vesh, the first portal world", () => {
  it("comes after the hangar, through its portal, as a first visit", () => {
    expect(BIOMES[4]).toBe(VESH);
    const p = newProgress(biomeAt(3).def.map);
    p.depth = 3;
    expect(p.floor).toBe("hangar");
    enterNextBiome(p);
    expect(p.floor).toBe("vesh");
    const w = createWorld(VESH_MAP, p);
    expect(w.biome.name).toBe("Vesh");
    expect(w.biome.region).toBe("Portal world: hive jungle");
    expect(w.biome.arrival).toBe(VESH.arrival);
    expect(w.targets.some((t) => t.def.id === "hiveForager")).toBe(true);
    // Drawn as a world, not a facility floor.
    expect(VESH_MAP.look?.kind).toBe("wild");
  });

  it("pays hive amber, which the doors, the objective and the summons spend", () => {
    expect(TARGETS.hiveForager.reward.amber).toBeGreaterThan(0);
    expect(TARGETS.broodSac.behavior).toBe("static");
    expect(TARGETS.broodSac.loot).toBeFalsy();
    expect(VESH.objective.repair.cost?.amber).toBeGreaterThan(0);
    expect(VESH.summon.cost.amber).toBeGreaterThan(0);
    // The first door's amber is reachable from the glade's foragers alone.
    const first = VESH_MAP.doors[0]!.requirements.cost!.amber!;
    expect(first / TARGETS.hiveForager.reward.amber!).toBeLessThanOrEqual(8);
  });
});

describe("resin pools", () => {
  it("slow the creature while it wades through", () => {
    const pool = VESH_MAP.resin![0]!;
    expect(inResin(VESH_MAP, pool.x, pool.z)).toBe(true);
    expect(inResin(VESH_MAP, pool.x + pool.radius + 0.1, pool.z)).toBe(false);

    const travel = (x: number, z: number) => {
      const p = at();
      p.unlockedDoors = ["vesh-door-canopy"];
      p.player = { x, z, health: 100 };
      const w = createWorld(VESH_MAP, p);
      w.targets.length = 0;
      w.input = { x: 0, z: 1 };
      stepWorld(w);
      return w.player.z - z;
    };
    const free = travel(-10, 25.5);
    const stuck = travel(pool.x, pool.z - 0.5);
    expect(stuck).toBeCloseTo(free * RESIN_SPEED, 5);
  });
});

describe("Chitin plating", () => {
  it("is bought with amber and cuts every hit, never below 1", () => {
    const p = at();
    p.banked.amber = 1000;
    expect(UPGRADES.chitin.currency).toBe("amber");
    for (let i = 0; i < 5; i++) expect(purchaseUpgrade(p, "chitin")).toEqual({ ok: true });
    expect(purchaseUpgrade(p, "chitin")).toEqual({ ok: false, reason: "maxed" });
    expect(computeStats(p).damageResist).toBe(30);

    const w = createWorld(VESH_MAP, p);
    refreshStats(w);
    const by = w.targets[0]!;
    const before = w.progress.player.health;
    expect(damagePlayer(w, 50, by)).toBe(true);
    expect(before - w.progress.player.health).toBe(35);
    // The hit event reports what was actually taken.
    expect(w.events.filter((e) => e.type === "playerHit").map((e) => e.type === "playerHit" && e.damage)).toEqual([35]);
    w.player.invulnerable = 0;
    const mid = w.progress.player.health;
    damagePlayer(w, 1, by);
    expect(mid - w.progress.player.health).toBe(1);

    const r = respecUpgrades(p);
    expect(r.ok && r.refund.amber).toBe(15 + 35 + 65 + 105 + 160);
  });
});

describe("v16 saves", () => {
  it("migrates v15: no amber, no Chitin plating, nothing else changed", () => {
    const p = newProgress(biomeAt(3).def.map);
    p.depth = 3;
    p.unlockedDoors = ["hangar-door-workshops"];
    const s = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    s.schemaVersion = 15;
    delete s.progress.banked.amber;
    delete s.progress.upgrades.chitin;
    delete s.progress.upgradeSpent.chitin;
    delete s.progress.upgradeExtraSpent.chitin;
    const loaded = parseSave(s)!;
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.progress.banked.amber).toBe(0);
    expect(loaded.progress.upgrades.chitin).toBe(0);
    expect(loaded.progress.upgradeSpent.chitin).toBe(0);
    expect(loaded.progress.floor).toBe("hangar");
    expect(loaded.progress.unlockedDoors).toEqual(["hangar-door-workshops"]);
  });

  it("appending Vesh moves nobody: a v15 save on the facility at depth 4 stays there", () => {
    const p = newProgress(biomeAt(0).def.map);
    p.depth = 4;
    p.floor = "facility";
    p.visits = { facility: 2, cryo: 1, vaults: 1, hangar: 1 };
    p.unlockedDoors = ["door-service"];
    p.quests = { "q-open-service": { count: 0, done: true } };
    const s = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    s.schemaVersion = 15;
    const loaded = parseSave(s)!.progress;
    expect(loaded.floor).toBe("facility");
    expect(biomeAt(loaded.depth, loaded.floor, loaded.visits.facility).name).toBe("Research wing II");
    expect(loaded.unlockedDoors).toEqual(["door-service"]);
    expect(loaded.quests["q-open-service"]?.done).toBe(true);
  });

  it("the import preview shows amber", () => {
    const p = at(4);
    p.banked.amber = 512.7;
    expect(summarize(toSaveFile(p, defaultSettings())).amber).toBe(512);
  });

  it("round-trips a mid-world Vesh save with amber and plating", () => {
    const p = at(4);
    p.banked.amber = 42.5;
    p.upgrades.chitin = 2;
    p.upgradeSpent.chitin = 50;
    p.unlockedDoors = ["vesh-door-canopy", "vesh-door-nursery"];
    const w = createWorld(VESH_MAP, p);
    for (let i = 0; i < 5 / SIM_DT; i++) stepWorld(w);
    const loaded = parseSave(JSON.parse(JSON.stringify(toSaveFile(w.progress, defaultSettings()))))!.progress;
    expect(loaded.floor).toBe("vesh");
    expect(loaded.banked.amber).toBe(42.5);
    expect(loaded.upgrades.chitin).toBe(2);
    expect(loaded.unlockedDoors).toEqual(["vesh-door-canopy", "vesh-door-nursery"]);
  });
});
