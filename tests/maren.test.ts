import { describe, expect, it } from "vitest";
import { BIOMES } from "../src/content/biomes";
import { currentAt, zoneAt } from "../src/content/map";
import { MAREN, MAREN_MAP } from "../src/content/maren";
import { TARGETS } from "../src/content/targets";
import { TIDE, tideStrength } from "../src/content/tide";
import { UPGRADES } from "../src/content/upgrades";
import { biomeAt } from "../src/domain/biome";
import { computeStats, purchaseUpgrade, respecUpgrades } from "../src/domain/economy";
import { newProgress } from "../src/domain/progress";
import { enterNextBiome } from "../src/domain/travel";
import { stepWorld } from "../src/game/step";
import { createWorld, refreshStats, type World } from "../src/game/world";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";
import { summarize } from "../src/persistence/transfer";

/** Maren with nothing alive and every door open, the player at (x, z), play time t. */
function standAt(x: number, z: number, playSeconds = 0): World {
  const p = newProgress(MAREN_MAP);
  p.depth = 6;
  p.unlockedDoors = MAREN_MAP.doors.map((d) => d.id);
  p.player = { x, z, health: 100 };
  p.playSeconds = playSeconds;
  for (const id of Object.keys(p.spawnCooldowns)) p.spawnCooldowns[id] = 1e6;
  const w = createWorld(MAREN_MAP, p);
  w.targets.length = 0;
  w.feeding.prizedTimer = 1e9;
  return w;
}

/** Full flood: the play time at which the tide peaks. */
const FLOOD = TIDE.periodSeconds / 4;

describe("Maren, the third portal world", () => {
  it("comes after Ashkar, through its portal, as a first visit", () => {
    expect(BIOMES[6]).toBe(MAREN);
    const p = newProgress(biomeAt(5).def.map);
    p.depth = 5;
    expect(p.floor).toBe("ashkar");
    enterNextBiome(p);
    expect(p.floor).toBe("maren");
    const w = createWorld(MAREN_MAP, p);
    expect(w.biome.name).toBe("Maren");
    expect(w.biome.region).toBe("Portal world: drowned platforms");
    expect(w.biome.arrival).toBe(MAREN.arrival);
    expect(w.targets.some((t) => t.def.id === "reefCrab")).toBe(true);
  });

  it("pays tide pearls, and clams are prised-open creatures, not loot", () => {
    expect(TARGETS.reefCrab.reward.pearls).toBeGreaterThan(0);
    expect(TARGETS.pearlClam.behavior).toBe("static");
    expect(TARGETS.pearlClam.loot).toBeFalsy();
    expect(MAREN.objective.repair.cost?.pearls).toBeGreaterThan(0);
    const first = MAREN_MAP.doors[0]!.requirements.cost!.pearls!;
    expect(first / TARGETS.reefCrab.reward.pearls!).toBeLessThanOrEqual(8);
  });

  it("every current lies inside the map, off the door gaps, base, sites and exit", () => {
    for (const c of MAREN_MAP.currents!) {
      const r = c.rect;
      const b = MAREN_MAP.bounds;
      expect(r.minX >= b.minX && r.maxX <= b.maxX && r.minZ >= b.minZ && r.maxZ <= b.maxZ).toBe(true);
      const inside = (x: number, z: number) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
      for (const d of MAREN_MAP.doors) expect(inside((d.rect.minX + d.rect.maxX) / 2, (d.rect.minZ + d.rect.maxZ) / 2)).toBe(false);
      expect(inside(MAREN_MAP.base.x, MAREN_MAP.base.z)).toBe(false);
      expect(inside(MAREN.exit.x, MAREN.exit.z)).toBe(false);
      for (const s of Object.values(MAREN.sites)) expect(inside(s.x, s.z)).toBe(false);
    }
  });
});

describe("ocean currents", () => {
  it("the tide swings between slack and full flood, on play time alone", () => {
    expect(tideStrength(FLOOD)).toBeCloseTo(TIDE.high, 5);
    expect(tideStrength(FLOOD * 3)).toBeCloseTo(TIDE.low, 5);
    expect(tideStrength(FLOOD + TIDE.periodSeconds * 7)).toBeCloseTo(TIDE.high, 5);
  });

  it("push the creature along while it stands in one, even standing still", () => {
    const reef = MAREN_MAP.currents![0]!;
    const z = (reef.rect.minZ + reef.rect.maxZ) / 2;
    const w = standAt(0, z, FLOOD);
    const x0 = w.player.x;
    stepWorld(w);
    expect(w.player.x - x0).toBeCloseTo(reef.dx * tideStrength(w.progress.playSeconds - 1 / 30) / 30, 3);

    const dry = standAt(0, 18, FLOOD);
    expect(currentAt(MAREN_MAP, 0, 18)).toBeNull();
    stepWorld(dry);
    expect(dry.player.x).toBe(0);
  });

  it("run straight along an axis, and only Maren has them", () => {
    for (const c of MAREN_MAP.currents!) expect(c.dx === 0 || c.dz === 0).toBe(true);
    expect(BIOMES.filter((b) => b !== MAREN).every((b) => !b.map.currents)).toBe(true);
  });

  it("overlap no prop, door or pod", () => {
    const overlaps = (a: { minX: number; maxX: number; minZ: number; maxZ: number }, b: typeof a) =>
      a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
    for (const c of MAREN_MAP.currents!) {
      for (const p of MAREN_MAP.props) expect(overlaps(c.rect, p)).toBe(false);
      for (const d of MAREN_MAP.doors) expect(overlaps(c.rect, d.rect)).toBe(false);
      for (const s of MAREN_MAP.spawns.filter((sp) => sp.type === "pod")) {
        expect(s.x >= c.rect.minX && s.x <= c.rect.maxX && s.z >= c.rect.minZ && s.z <= c.rect.maxZ).toBe(false);
      }
    }
  });

  it("idling in a current for two minutes never carries the creature through a wall or out of its room", () => {
    for (const c of MAREN_MAP.currents!) {
      for (const open of [true, false]) {
        const x = (c.rect.minX + c.rect.maxX) / 2;
        const z = (c.rect.minZ + c.rect.maxZ) / 2;
        const w = standAt(x, z, FLOOD);
        if (!open) w.progress.unlockedDoors = [];
        const room = zoneAt(MAREN_MAP, x, z)!.id;
        for (let i = 0; i < 120 * 30; i++) stepWorld(w);
        expect(zoneAt(MAREN_MAP, w.player.x, w.player.z)?.id).toBe(room);
        for (const r of [...MAREN_MAP.walls, ...MAREN_MAP.props]) {
          const inside = w.player.x > r.minX && w.player.x < r.maxX && w.player.z > r.minZ && w.player.z < r.maxZ;
          expect(inside).toBe(false);
        }
      }
    }
  });

  it("can be waded up at half stick, even at full flood", () => {
    const beds = MAREN_MAP.currents![1]!;
    const w = standAt(0, 58, FLOOD);
    w.input = { x: 0, z: 0.5 };
    const z0 = w.player.z;
    for (let i = 0; i < 30; i++) stepWorld(w);
    expect(beds.dz).toBeLessThan(0);
    expect(w.player.z - z0).toBeGreaterThan(0.2);
  });

  it("never outrun the creature: it can always walk against the flow", () => {
    const base = computeStats(newProgress(MAREN_MAP)).moveSpeed;
    for (const c of MAREN_MAP.currents!) expect(Math.hypot(c.dx, c.dz) * TIDE.high).toBeLessThan(base * 0.6);
  });

  it("Webbed limbs weaken the push, bought with pearls and refunded by a respec", () => {
    const reef = MAREN_MAP.currents![0]!;
    const z = (reef.rect.minZ + reef.rect.maxZ) / 2;
    const plain = standAt(0, z, FLOOD);
    stepWorld(plain);
    const w = standAt(0, z, FLOOD);
    w.progress.banked.pearls = 1000;
    expect(UPGRADES.webbedLimbs.currency).toBe("pearls");
    for (let i = 0; i < 2; i++) expect(purchaseUpgrade(w.progress, "webbedLimbs")).toEqual({ ok: true });
    refreshStats(w);
    expect(w.stats.currentResist).toBe(40);
    stepWorld(w);
    expect(w.player.x).toBeCloseTo(plain.player.x * 0.6, 5);
    const r = respecUpgrades(w.progress);
    expect(r.ok && r.refund.pearls).toBe(15 + 40);
  });
});

describe("v18 saves", () => {
  it("migrates v17: no pearls, no Webbed limbs, nothing else changed", () => {
    const p = newProgress(biomeAt(5).def.map);
    p.depth = 5;
    p.banked.shards = 44;
    p.unlockedDoors = ["ashkar-door-dunes"];
    const s = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    s.schemaVersion = 17;
    delete s.progress.banked.pearls;
    delete s.progress.upgrades.webbedLimbs;
    delete s.progress.upgradeSpent.webbedLimbs;
    delete s.progress.upgradeExtraSpent.webbedLimbs;
    const loaded = parseSave(s)!;
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.progress.banked.pearls).toBe(0);
    expect(loaded.progress.banked.shards).toBe(44);
    expect(loaded.progress.upgrades.webbedLimbs).toBe(0);
    expect(loaded.progress.floor).toBe("ashkar");
    expect(loaded.progress.unlockedDoors).toEqual(["ashkar-door-dunes"]);
  });

  it("round-trips a mid-world Maren save with pearls", () => {
    const w = standAt(0, 18, 123);
    w.progress.banked.pearls = 61.5;
    w.progress.upgrades.webbedLimbs = 1;
    w.progress.upgradeSpent.webbedLimbs = 15;
    const loaded = parseSave(JSON.parse(JSON.stringify(toSaveFile(w.progress, defaultSettings()))))!;
    expect(loaded.progress.floor).toBe("maren");
    expect(loaded.progress.banked.pearls).toBe(61.5);
    expect(loaded.progress.upgrades.webbedLimbs).toBe(1);
    expect(summarize(loaded).pearls).toBe(61);
  });
});
