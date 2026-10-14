import { describe, expect, it } from "vitest";
import { BIOMES } from "../src/content/biomes";
import { COLD } from "../src/content/cold";
import { CRYO_MAP } from "../src/content/cryo";
import { CURRENCIES } from "../src/content/currencies";
import { FACILITY, zoneAt, type MapDef } from "../src/content/map";
import { CATCHER, REFINERY } from "../src/content/structures";
import { biomeAt } from "../src/domain/biome";
import { newProgress, type ProgressState } from "../src/domain/progress";
import { advanceStructure, catcherLevel, refineryBatchDrop, refineryInput, refineryLevel, tickRefinery } from "../src/domain/structures";
import { enterNextBiome } from "../src/domain/travel";
import { leaveBiome } from "../src/game/actions";
import { stepWorld } from "../src/game/step";
import { BASE_HEAL_FRACTION, die } from "../src/game/systems/combat";
import { computeStats } from "../src/domain/economy";
import { atPad } from "../src/game/systems/deposit";
import { createWorld, SIM_DT, spawnTarget, type World } from "../src/game/world";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";

const run = (w: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) stepWorld(w);
};

/** A floor with every door and quest done, lots banked, and nothing alive unless asked. */
function floor(depth: number, opts: { targets?: boolean } = {}): World {
  const biome = biomeAt(depth);
  const map = biome.def.map;
  const p = newProgress(map);
  p.depth = depth;
  p.evolution = 1;
  for (const d of map.doors) p.unlockedDoors.push(d.id);
  for (const q of biome.quests) p.quests[q.id] = { count: 1, done: true };
  p.banked = { biomass: 1e5, genetic: 1e4, parts: 1e4, mutagen: 0, crystals: 1e4, alloy: 0, amber: 0, shards: 0 };
  const w = createWorld(map, p);
  if (!opts.targets) {
    w.targets.length = 0;
    for (const id of Object.keys(p.spawnCooldowns)) p.spawnCooldowns[id] = 1e6;
  }
  w.feeding.prizedTimer = 1e9;
  return w;
}

function place(w: World, x: number, z: number): void {
  w.player.x = w.player.prevX = w.progress.player.x = x;
  w.player.z = w.player.prevZ = w.progress.player.z = z;
}

/** Banked plus every drop held anywhere (your hold and the helpers'). */
function total(p: ProgressState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of CURRENCIES) out[c] = p.banked[c];
  for (const d of [...p.cargo, ...p.structures.drone.cargo, ...p.structures.catcher.cargo]) for (const c of CURRENCIES) out[c]! += d.reward[c] ?? 0;
  return out;
}

describe("structure sites on every floor", () => {
  for (const b of BIOMES) {
    it(`${b.name}: refinery and forward base stand in open floor, clear of spawns`, () => {
      const map: MapDef = b.map;
      const blocked = [...map.walls, ...map.props];
      const sites = { refinery: b.sites.refinery, outpost: b.sites.outpost, vat: b.sites.vat };
      for (const [name, s] of Object.entries(sites)) {
        expect(zoneAt(map, s.x, s.z), name).not.toBeNull();
        expect(blocked.some((r) => s.x >= r.minX - 1 && s.x <= r.maxX + 1 && s.z >= r.minZ - 1 && s.z <= r.maxZ + 1), name + " touches a wall or prop").toBe(false);
        for (const sp of map.spawns) expect(Math.hypot(sp.x - s.x, sp.z - s.z), `${name} on spawn ${sp.id}`).toBeGreaterThan(1.8);
      }
      expect(Math.hypot(b.sites.refinery.x - b.sites.vat.x, b.sites.refinery.z - b.sites.vat.z)).toBeGreaterThan(3);
      // The forward base is out on the floor, not in the first room, and its gate is a quest here.
      expect(zoneAt(map, b.sites.outpost.x, b.sites.outpost.z)!.id).not.toBe(map.zones[0]!.id);
      expect(b.quests.some((q) => q.id === b.outpost.gate)).toBe(true);
    });
  }
});

describe("refinery", () => {
  it("needs crystals to build, then pays each batch's input from the bank as it starts", () => {
    const w = floor(1);
    const p = w.progress;
    p.banked.crystals = 0;
    expect(advanceStructure(p, "refinery")).toEqual({ ok: false, reason: "requirements" });
    p.banked.crystals = 1e4;
    expect(advanceStructure(p, "refinery").ok).toBe(true);
    const input = refineryInput(1);
    const before = { ...p.banked };
    tickRefinery(p, SIM_DT);
    expect(p.banked.biomass).toBeCloseTo(before.biomass - input.biomass);
    expect(p.banked.parts).toBeCloseTo(before.parts - input.parts);
    expect(p.structures.refinery.running).toBe(true);
    const secs = refineryLevel(p.structures.refinery).batchSeconds;
    for (let i = 0; i < Math.round(secs / SIM_DT); i++) tickRefinery(p, SIM_DT);
    expect(p.structures.refinery.stock).toBe(1);
  });

  it("waits when the bank can't pay, and stops at its storage", () => {
    const p = floor(1).progress;
    advanceStructure(p, "refinery");
    p.banked.parts = 0;
    for (let i = 0; i < 100; i++) tickRefinery(p, 1);
    expect(p.structures.refinery).toMatchObject({ stock: 0, running: false });
    expect(p.banked.parts).toBe(0);
    p.banked.parts = 1e4;
    for (let i = 0; i < 1000; i++) tickRefinery(p, 1);
    expect(p.structures.refinery.stock).toBe(REFINERY.levels[0]!.storage);
    // Full: no more input is taken.
    const parts = p.banked.parts;
    for (let i = 0; i < 100; i++) tickRefinery(p, 1);
    expect(p.banked.parts).toBe(parts);
  });

  it("alloy loads into your hold at the refinery and banks at a pad", () => {
    const w = floor(1);
    const p = w.progress;
    advanceStructure(p, "refinery");
    p.structures.refinery.stock = 2;
    p.structures.refinery.running = false;
    p.banked.parts = 0; // no new batches during the test
    const site = w.biome.def.sites.refinery;
    place(w, site.x + 1.6, site.z);
    run(w, 1);
    expect(p.structures.refinery.stock).toBe(0);
    expect(p.cargo).toEqual([refineryBatchDrop(1), refineryBatchDrop(1)]);
    const base = w.map.base;
    place(w, base.x, base.z);
    run(w, 1);
    expect(p.cargo).toEqual([]);
    expect(p.banked.alloy).toBeGreaterThan(0);
  });

  it("starts no batch while its room is locked, but finishes one already paid for", () => {
    const p = floor(1).progress;
    advanceStructure(p, "refinery");
    const parts = p.banked.parts;
    tickRefinery(p, 1, false);
    expect(p.structures.refinery.running).toBe(false);
    expect(p.banked.parts).toBe(parts);
    tickRefinery(p, 1, true);
    expect(p.structures.refinery.running).toBe(true);
    for (let i = 0; i < 100; i++) tickRefinery(p, 1, false);
    expect(p.structures.refinery).toMatchObject({ stock: 1, running: false });
  });

  it("an upgrade mid-batch doesn't charge again and keeps the batch", () => {
    const p = floor(1).progress;
    advanceStructure(p, "refinery");
    tickRefinery(p, 1);
    const banked = { ...p.banked };
    const timer = p.structures.refinery.timer;
    expect(advanceStructure(p, "refinery").ok).toBe(true);
    expect(p.structures.refinery.running).toBe(true);
    expect(p.structures.refinery.timer).toBeLessThanOrEqual(timer);
    tickRefinery(p, 1);
    // Only the upgrade's price left the bank, no second batch input.
    expect(banked.parts - p.banked.parts).toBe(0);
  });

  it("the drone fetches alloy too", () => {
    const w = floor(1);
    const p = w.progress;
    advanceStructure(p, "refinery");
    advanceStructure(p, "drone");
    p.structures.refinery.stock = 2;
    p.banked.parts = 0;
    place(w, w.map.base.x, w.map.base.z);
    const alloy = p.banked.alloy;
    run(w, 60);
    expect(p.structures.refinery.stock).toBe(0);
    expect(p.banked.alloy).toBeGreaterThan(alloy);
  });
});

describe("forward base", () => {
  it("is built once per floor after its gate, banks your hold, and is lost when you move on", () => {
    const w = floor(0);
    const p = w.progress;
    delete p.quests[w.biome.def.outpost.gate];
    expect(advanceStructure(p, "outpost")).toEqual({ ok: false, reason: "requirements" });
    p.quests[w.biome.def.outpost.gate] = { count: 1, done: true };
    expect(advanceStructure(p, "outpost")).toEqual({ ok: true, level: 1, built: true });
    expect(advanceStructure(p, "outpost")).toEqual({ ok: false, reason: "max" });
    const o = w.biome.def.sites.outpost;
    place(w, o.x, o.z);
    expect(atPad(w)).toBe(true);
    p.cargo = [{ type: "worker", weight: 2, reward: { biomass: 3 } }];
    const biomass = p.banked.biomass;
    run(w, 0.5);
    expect(p.cargo).toEqual([]);
    expect(p.banked.biomass).toBeGreaterThan(biomass);
    enterNextBiome(p);
    expect(p.structures.outpost).toEqual({ built: false, level: 0 });
  });

  it("is heated: chill drains on it in a cold room, and not before it's built", () => {
    const w = floor(1);
    const o = w.biome.def.sites.outpost;
    expect(zoneAt(CRYO_MAP, o.x, o.z)!.cold).toBe(true);
    // Not standing on a vent: the warmth is the forward base's own.
    for (const v of CRYO_MAP.heatVents ?? []) expect(Math.hypot(v.x - o.x, v.z - o.z)).toBeGreaterThan(v.radius + 1);
    place(w, o.x, o.z);
    w.chill = 0.5;
    run(w, 1);
    expect(w.chill).toBeGreaterThan(0.5);
    advanceStructure(w.progress, "outpost");
    w.chill = 1;
    run(w, COLD.ventSeconds + 0.1);
    expect(w.chill).toBe(0);
  });

  it("banks but doesn't heal: healing and respawn stay at the main base", () => {
    const w = floor(0);
    advanceStructure(w.progress, "outpost");
    const o = w.biome.def.sites.outpost;
    place(w, o.x, o.z);
    w.progress.player.health = 10;
    run(w, 1);
    expect(w.progress.player.health).toBeLessThan(10 + BASE_HEAL_FRACTION * w.stats.maxHealth * 0.5);
    w.progress.firstDeathForgiven = true;
    die(w);
    expect(w.player).toMatchObject({ x: FACILITY.base.x, z: FACILITY.base.z });
  });

  it("helpers deliver to whichever pad is nearer", () => {
    const w = floor(0);
    const p = w.progress;
    advanceStructure(p, "outpost");
    advanceStructure(p, "drone");
    const o = w.biome.def.sites.outpost;
    p.structures.drone.x = o.x - 3;
    p.structures.drone.z = o.z;
    p.structures.drone.cargo = [{ type: "worker", weight: 2, reward: { biomass: 3 } }];
    w.droneMode = "toBase";
    place(w, o.x, o.z); // on a pad: the drone has nothing to fetch from you
    const biomass = p.banked.biomass;
    run(w, 2);
    expect(p.structures.drone.cargo).toEqual([]);
    expect(p.banked.biomass).toBeGreaterThan(biomass);
  });
});

describe("catcher", () => {
  /** A Cryo labs world with only the creatures asked for, placed near the player in the dock. */
  function hunt(types: Array<{ type: string; x: number; z: number }>): World {
    const w = floor(1);
    advanceStructure(w.progress, "catcher");
    place(w, 0, -2);
    w.progress.structures.catcher.x = 0;
    w.progress.structures.catcher.z = -2;
    for (const { type, x, z } of types) {
      const spawn = w.map.spawns.find((s) => s.type === type)!;
      const t = spawnAt(w, spawn.id, x, z);
      t.idle = 1e9;
    }
    // Your own tentacles stay out of it.
    w.stats = { ...w.stats, captureRadius: 0 };
    return w;
  }

  function spawnAt(w: World, spawnId: string, x: number, z: number) {
    const before = w.targets.length;
    const t = spawnTarget(w, spawnId)!;
    expect(w.targets.length).toBe(before + 1);
    t.x = x;
    t.z = z;
    t.homeX = x;
    t.homeZ = z;
    return t;
  }

  it("catches creatures near you into its own hold, and flies them to a pad", () => {
    const w = hunt([{ type: "worker", x: 3, z: -2 }]);
    const p = w.progress;
    const prey = w.targets[0];
    const xp = p.xp;
    const before = total(p);
    run(w, 30);
    // (Its spawn point refills meanwhile; the one caught is gone.)
    expect(w.targets).not.toContain(prey);
    expect(p.xp).toBeGreaterThan(xp);
    expect(p.bestiary.worker).toBe(1);
    // Banked through bankDrop: nothing created beyond the catch's payout.
    const after = total(p);
    expect(p.structures.catcher.cargo).toEqual([]);
    expect(after.biomass! - before.biomass!).toBeCloseTo(biomeAt(1).targets.worker.reward.biomass! * (w.stats.yieldPercent / 100));
  });

  it("leaves bosses, fighters, supply pods and prized specimens alone", () => {
    const w = hunt([
      { type: "worker", x: 3, z: -2 },
      { type: "pod", x: -3, z: -2 },
      { type: "cryoSentinel", x: 0, z: 2 },
      { type: "patrolDrone", x: -2, z: 0 },
    ]);
    const [worker, ...others] = w.targets;
    worker!.prized = true;
    w.feeding.prizedLeft = 1e6;
    for (let i = 0; i < 300; i++) {
      stepWorld(w);
      expect(w.catcher.target).toBeNull();
    }
    for (const t of others) expect(w.targets).toContain(t);
    expect(w.targets).toContain(worker);
  });

  it("lets go of prey that turns prized mid-grip, and prized picks skip its prey", () => {
    const w = hunt([{ type: "worker", x: 3, z: -2 }]);
    const [worker] = w.targets;
    for (let i = 0; i < 60 && w.catcher.progress < 0.2; i++) stepWorld(w);
    expect(w.catcher.target).toBe(worker);
    worker!.prized = true;
    w.feeding.prizedLeft = 30;
    stepWorld(w);
    expect(w.catcher.target).toBeNull();
    run(w, 30);
    expect(w.targets).toContain(worker);
    expect(w.progress.bestiary.worker ?? 0).toBe(0);
  });

  it("never grips what you're holding", () => {
    const w = hunt([{ type: "worker", x: 1.5, z: -2 }]);
    w.stats = computeStats(w.progress); // your reach back to normal
    const [worker] = w.targets;
    let overlap = 0;
    for (let i = 0; i < 300 && w.targets.includes(worker!); i++) {
      stepWorld(w);
      if (w.tentacles.includes(worker!) && w.catcher.target === worker) overlap++;
    }
    expect(w.progress.cargo.some((d) => d.type === "worker")).toBe(true);
    expect(overlap).toBe(0);
  });

  it("ignores creatures far from you", () => {
    const w = hunt([{ type: "worker", x: 0, z: -2 + CATCHER.huntRadius + 3 }]);
    run(w, 10);
    expect(w.targets).toHaveLength(1);
  });

  it("keeps its hold when you die", () => {
    const w = hunt([]);
    const c = w.progress.structures.catcher;
    c.cargo = [{ type: "worker", weight: 2, reward: { biomass: 3 } }];
    w.progress.firstDeathForgiven = true;
    die(w);
    expect(c.cargo).toHaveLength(1);
  });

  it("never carries more than its capacity", () => {
    const w = hunt([1, 2, 3, 4, 5].map((i) => ({ type: "worker", x: i * 0.8, z: -1 })));
    const cap = catcherLevel(w.progress.structures.catcher).capacity;
    let max = 0;
    for (let i = 0; i < 600; i++) {
      stepWorld(w);
      max = Math.max(max, w.progress.structures.catcher.cargo.reduce((n, d) => n + d.weight, 0));
    }
    expect(max).toBeLessThanOrEqual(cap);
    expect(max).toBeGreaterThan(0);
  });
});

describe("moving on with helpers", () => {
  it("banks the catcher's hold and the refinery's stock on the way out", () => {
    const w = floor(0);
    const p = w.progress;
    p.reactorRepaired = true;
    advanceStructure(p, "refinery");
    advanceStructure(p, "catcher");
    p.structures.refinery.stock = 3;
    p.structures.catcher.cargo = [{ type: "worker", weight: 2, reward: { biomass: 3 } }];
    const exit = w.biome.def.exit;
    place(w, exit.x, exit.z);
    const before = { ...p.banked };
    const r = leaveBiome(w);
    expect(r.ok).toBe(true);
    expect(p.structures.refinery.stock).toBe(0);
    expect(p.structures.catcher.cargo).toEqual([]);
    expect(p.banked.alloy).toBeCloseTo(before.alloy + 3 * refineryBatchDrop(0).reward.alloy! * (w.stats.yieldPercent / 100));
    expect(p.structures.catcher).toMatchObject({ x: CRYO_MAP.base.x, z: CRYO_MAP.base.z });
  });
});

describe("leaving mid-grip", () => {
  it("drops the catcher's prey and leaves it a valid save", () => {
    const w = floor(0, { targets: true });
    const p = w.progress;
    p.reactorRepaired = true;
    advanceStructure(p, "catcher");
    w.catcher.target = w.targets.find((t) => t.def.id === "worker")!;
    w.catcher.progress = 0.8;
    w.catcher.mode = "hunting";
    const exit = w.biome.def.exit;
    place(w, exit.x, exit.z);
    expect(leaveBiome(w).ok).toBe(true);
    expect(w.catcher.target).toBeNull();
    expect(parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))))).not.toBeNull();
  });
});

describe("saves (v12)", () => {
  it("round-trips every new structure mid-floor", () => {
    const w = floor(1);
    const p = w.progress;
    for (const k of ["refinery", "catcher", "outpost"] as const) expect(advanceStructure(p, k).ok).toBe(true);
    tickRefinery(p, 3);
    p.structures.refinery.stock = 1;
    p.structures.catcher.cargo = [{ type: "frostRunner", weight: 2, reward: { biomass: 1 } }];
    p.structures.catcher.x = -5;
    p.structures.catcher.z = 26;
    p.cargo = [refineryBatchDrop(1)];
    const parsed = parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))))!.progress;
    expect(parsed.structures.refinery).toEqual(p.structures.refinery);
    expect(parsed.structures.outpost).toEqual({ built: true, level: 1 });
    expect(parsed.structures.catcher).toMatchObject({ built: true, level: 1, x: -5, z: 26 });
    expect(parsed.structures.catcher.cargo).toEqual([{ type: "frostRunner", ...pick(biomeAt(1).targets.frostRunner) }]);
    expect(parsed.cargo).toEqual([refineryBatchDrop(1)]);
  });

  it("caps helper cargo and refinery stock, and rejects malformed state", () => {
    const p = floor(1).progress;
    advanceStructure(p, "refinery");
    advanceStructure(p, "catcher");
    const s = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    s.progress.structures.refinery.stock = 99;
    s.progress.structures.catcher.cargo = Array.from({ length: 10 }, () => ({ type: "worker" }));
    const parsed = parseSave(s)!.progress;
    expect(parsed.structures.refinery.stock).toBe(refineryLevel(parsed.structures.refinery).storage);
    expect(parsed.structures.catcher.cargo.reduce((n, d) => n + d.weight, 0)).toBeLessThanOrEqual(catcherLevel(parsed.structures.catcher).capacity);
    const bad = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    bad.progress.structures.refinery.running = "yes";
    expect(parseSave(bad)).toBeNull();
    const missing = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    delete missing.progress.structures.outpost;
    expect(parseSave(missing)).toBeNull();
  });

  it("migrates v11: nothing new is built, the rest is untouched", () => {
    const p = newProgress(FACILITY);
    p.structures.vat = { built: true, level: 2, stock: 1, timer: 4 };
    const s = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    s.schemaVersion = 11;
    delete s.progress.structures.refinery;
    delete s.progress.structures.catcher;
    delete s.progress.structures.outpost;
    const parsed = parseSave(s)!;
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.progress.structures.vat).toEqual(p.structures.vat);
    expect(parsed.progress.structures.refinery).toMatchObject({ built: false, stock: 0 });
    expect(parsed.progress.structures.catcher).toMatchObject({ built: false, cargo: [] });
    expect(parsed.progress.structures.outpost).toEqual({ built: false, level: 0 });
    // Saves from before structures existed still load.
    const v11null = JSON.parse(JSON.stringify(toSaveFile(newProgress(FACILITY), defaultSettings())));
    v11null.schemaVersion = 11;
    v11null.progress.structures = null;
    expect(parseSave(v11null)).not.toBeNull();
  });

});

function pick(def: { weight: number; reward: object }) {
  return { weight: def.weight, reward: def.reward };
}
