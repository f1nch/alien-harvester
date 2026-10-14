import { describe, expect, it } from "vitest";
import { CURRENCIES } from "../src/content/currencies";
import { FACILITY, zoneAt } from "../src/content/map";
import { DRONE, VAT } from "../src/content/structures";
import { FixedLoop } from "../src/game/loop";
import { cargoWeight, newProgress, type ProgressState } from "../src/domain/progress";
import { isDone } from "../src/domain/quests";
import { advanceStructure, droneCapacity, tickVat, vatLevel } from "../src/domain/structures";
import { buildStructure } from "../src/game/actions";
import { stepWorld } from "../src/game/step";
import { die } from "../src/game/systems/combat";
import { createWorld, SIM_DT, type World } from "../src/game/world";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";
import { BIOMES } from "../src/content/biomes";

const VAT_SITE = BIOMES[0]!.sites.vat;

/** Service wing open, plenty of resources. */
function ready(): ProgressState {
  const p = newProgress(FACILITY);
  for (const id of ["q-first-catch", "q-first-bank", "q-first-upgrade", "q-open-service"]) p.quests[id] = { count: 999, done: true };
  p.unlockedDoors.push("door-service");
  p.banked = { biomass: 5000, genetic: 500, parts: 0, mutagen: 0, crystals: 0, alloy: 0, amber: 0, shards: 0, pearls: 0 };
  return p;
}

const run = (w: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) stepWorld(w);
};

/** Total value anywhere in the system: banked + player cargo + drone cargo. */
function totalValue(p: ProgressState): number {
  let n = 0;
  for (const c of CURRENCIES) n += p.banked[c];
  for (const d of [...p.cargo, ...p.structures.drone.cargo]) for (const c of CURRENCIES) n += d.reward[c] ?? 0;
  return n;
}

describe("biomass vat", () => {
  it("needs the service wing quest, and building is one transaction", () => {
    const p = newProgress(FACILITY);
    p.banked = { biomass: 5000, genetic: 500, parts: 0, mutagen: 0, crystals: 0, alloy: 0, amber: 0, shards: 0, pearls: 0 };
    expect(advanceStructure(p, "vat")).toEqual({ ok: false, reason: "requirements" });
    expect(p.banked.biomass).toBe(5000);
    const q = ready();
    expect(advanceStructure(q, "vat")).toEqual({ ok: true, level: 1, built: true });
    expect(q.banked).toMatchObject({ biomass: 5000 - 120, genetic: 500 - 10 });
  });

  it("upgrades to the last level, then stops", () => {
    const p = ready();
    for (let i = 0; i < VAT.levels.length; i++) expect(advanceStructure(p, "vat").ok).toBe(true);
    expect(advanceStructure(p, "vat")).toEqual({ ok: false, reason: "max" });
    expect(p.structures.vat.level).toBe(VAT.levels.length);
  });

  it("produces only from simulation ticks and stops at its storage cap", () => {
    const p = ready();
    advanceStructure(p, "vat");
    const v = p.structures.vat;
    const lvl = vatLevel(v);
    for (let t = 0; t < lvl.batchSeconds * 2 + 0.1; t += 0.1) tickVat(v, 0.1);
    expect(v.stock).toBe(2);
    for (let t = 0; t < 1000; t += 0.5) tickVat(v, 0.5);
    expect(v.stock).toBe(lvl.storage);
  });

  it("produces nothing while the game is paused or hidden, for any duration", () => {
    const p = ready();
    advanceStructure(p, "vat");
    const w = createWorld(FACILITY, p);
    const loop = new FixedLoop((dt) => stepWorld(w, dt), { hz: 30, maxStepsPerFrame: 5 });
    loop.frame(0);
    loop.pause("hidden");
    loop.frame(10 * 60 * 60 * 1000);
    loop.resume("hidden");
    loop.frame(10 * 60 * 60 * 1000);
    expect(p.structures.vat.stock).toBe(0);
  });

  it("the farm perk speeds production", () => {
    const p = ready();
    advanceStructure(p, "vat");
    const v = p.structures.vat;
    const base = vatLevel(v).batchSeconds;
    for (let t = 0; t < base / 1.3 + 0.05; t += 0.05) tickVat(v, 0.05, 1.3);
    expect(v.stock).toBe(1);
  });

  it("building completes q-build-farm and pushes nearby targets out of the footprint", () => {
    const w = createWorld(FACILITY, ready());
    const t = w.targets.find((x) => zoneAt(FACILITY, x.x, x.z)?.id === "service")!;
    t.x = VAT_SITE.x;
    t.z = VAT_SITE.z;
    expect(buildStructure(w, "vat").ok).toBe(true);
    expect(isDone(w.progress, "q-build-farm")).toBe(true);
    expect(Math.hypot(t.x - VAT_SITE.x, t.z - VAT_SITE.z)).toBeGreaterThan(VAT.halfSize);
  });

  it("standing near it loads batches into cargo, within free capacity", () => {
    const p = ready();
    advanceStructure(p, "vat");
    p.structures.vat.stock = 6;
    const w = createWorld(FACILITY, p);
    w.player.x = VAT_SITE.x - 1.6;
    w.player.z = VAT_SITE.z;
    // Leave room for exactly two batches.
    while (cargoWeight(p.cargo) < w.stats.cargoCapacity - 2 * VAT.batch.weight) p.cargo.push({ type: "worker", weight: 2, reward: { biomass: 3 } });
    w.stats.captureRadius = 0;
    run(w, 3);
    expect(p.cargo.filter((d) => d.type === "vat")).toHaveLength(2);
    expect(p.structures.vat.stock).toBe(4);
    expect(cargoWeight(p.cargo)).toBeLessThanOrEqual(w.stats.cargoCapacity);
  });
});

describe("delivery drone", () => {
  const withDrone = () => {
    const p = ready();
    advanceStructure(p, "drone");
    const w = createWorld(FACILITY, p);
    w.stats.captureRadius = 0;
    return w;
  };

  it("fetches cargo from the player across a doorway, banks it at base, and conserves value", () => {
    const w = withDrone();
    const p = w.progress;
    w.player.x = 0;
    w.player.z = 25; // in the service wing
    for (let i = 0; i < 4; i++) p.cargo.push({ type: "runner", weight: 2, reward: { biomass: 6 } });
    const total = totalValue(p);
    let sawLoaded = false;
    for (let i = 0; i < 40 / SIM_DT; i++) {
      stepWorld(w);
      expect(totalValue(p)).toBeCloseTo(total, 6);
      expect(cargoWeight(p.structures.drone.cargo)).toBeLessThanOrEqual(droneCapacity(p.structures.drone));
      if (p.structures.drone.cargo.length > 0) sawLoaded = true;
    }
    expect(sawLoaded).toBe(true);
    expect(p.cargo).toHaveLength(0);
    expect(p.structures.drone.cargo).toHaveLength(0);
    expect(p.banked.biomass).toBe(5000 - 150 + 24);
  });

  it("only takes what fits", () => {
    const w = withDrone();
    w.player.x = 0;
    w.player.z = 5;
    for (let i = 0; i < 8; i++) w.progress.cargo.push({ type: "worker", weight: 2, reward: { biomass: 3 } });
    w.progress.structures.drone.x = 0;
    w.progress.structures.drone.z = 5;
    run(w, 1.5);
    expect(cargoWeight(w.progress.structures.drone.cargo)).toBe(DRONE.levels[0]!.capacity);
    expect(w.progress.cargo).toHaveLength(3);
  });

  it("never passes a locked door", () => {
    const p = newProgress(FACILITY);
    p.banked = { biomass: 5000, genetic: 500, parts: 0, mutagen: 0, crystals: 0, alloy: 0, amber: 0, shards: 0, pearls: 0 };
    p.quests["q-open-service"] = { count: 1, done: true };
    advanceStructure(p, "drone");
    const w = createWorld(FACILITY, p);
    // Player (somehow) beyond the locked service door: the drone has no route and stays put.
    w.player.x = 0;
    w.player.z = 25;
    p.cargo.push({ type: "worker", weight: 2, reward: { biomass: 3 } });
    run(w, 20);
    expect(zoneAt(FACILITY, p.structures.drone.x, p.structures.drone.z)?.id).toBe("containment");
  });

  it("collects from the vat when the player has nothing to hand over", () => {
    const w = withDrone();
    const p = w.progress;
    advanceStructure(p, "vat");
    p.structures.vat.stock = 3;
    w.player.x = FACILITY.base.x;
    w.player.z = FACILITY.base.z;
    run(w, 40);
    // The vat keeps producing meanwhile, so check whole batches arrived rather than an exact count.
    const gained = p.banked.biomass - (5000 - 150 - 120);
    expect(gained).toBeGreaterThanOrEqual(3 * VAT.batch.reward.biomass);
    expect(gained % VAT.batch.reward.biomass).toBe(0);
  });

  it("cargo the drone is carrying survives the player's death", () => {
    const w = withDrone();
    const d = w.progress.structures.drone;
    d.cargo.push({ type: "guard", weight: 3, reward: { biomass: 9, genetic: 1 } });
    w.progress.firstDeathForgiven = true;
    w.progress.cargo.push({ type: "worker", weight: 2, reward: { biomass: 3 } });
    die(w);
    expect(w.progress.cargo).toHaveLength(0);
    expect(d.cargo).toHaveLength(1);
  });
});

describe("structure saves", () => {
  it("round-trips vat state and drone cargo in transit", () => {
    const p = ready();
    advanceStructure(p, "vat");
    advanceStructure(p, "drone");
    p.structures.vat.stock = 3;
    p.structures.vat.timer = 4.5;
    p.structures.drone.cargo.push({ type: "vat", weight: 2, reward: { biomass: 5 } });
    p.structures.drone.x = 0;
    p.structures.drone.z = 20;
    const parsed = parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))))!;
    expect(parsed.progress.structures).toEqual(p.structures);
  });

  it("migrates v6 saves with nothing built", () => {
    const v6 = JSON.parse(JSON.stringify(toSaveFile(newProgress(FACILITY), defaultSettings())));
    v6.schemaVersion = 6;
    delete v6.progress.structures;
    const parsed = parseSave(v6)!;
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.progress.structures.vat.built).toBe(false);
    expect(parsed.progress.structures.drone.built).toBe(false);
  });

  it("clamps stock and timer, caps drone cargo, and returns an unreachable drone to base", () => {
    const p = ready();
    advanceStructure(p, "vat");
    advanceStructure(p, "drone");
    const s = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    s.progress.structures.vat.stock = 999;
    s.progress.structures.vat.timer = 999;
    s.progress.structures.drone.cargo = Array.from({ length: 30 }, () => ({ type: "worker" }));
    s.progress.structures.drone.x = 0;
    s.progress.structures.drone.z = 60; // security sector: door still locked
    const parsed = parseSave(s)!.progress.structures;
    expect(parsed.vat.stock).toBe(vatLevel(parsed.vat).storage);
    expect(parsed.vat.timer).toBe(vatLevel(parsed.vat).batchSeconds);
    expect(cargoWeight(parsed.drone.cargo)).toBeLessThanOrEqual(droneCapacity(parsed.drone));
    expect([parsed.drone.x, parsed.drone.z]).toEqual([FACILITY.base.x, FACILITY.base.z]);
  });
});

describe("structure review regressions", () => {
  it("the drone can't take cargo from a player killed this tick", () => {
    const p = ready();
    advanceStructure(p, "drone");
    const w = createWorld(FACILITY, p);
    w.stats.captureRadius = 0;
    p.firstDeathForgiven = true;
    w.player.x = 0;
    w.player.z = 5;
    p.structures.drone.x = 0;
    p.structures.drone.z = 5;
    w.droneMode = "toPlayer";
    p.cargo.push({ type: "worker", weight: 2, reward: { biomass: 3 } });
    p.player.health = 0;
    stepWorld(w);
    expect(p.structures.drone.cargo).toHaveLength(0);
    expect(p.cargo).toHaveLength(0); // lost to death, as for any unbanked cargo
  });

  it("upgrading the vat shortens the batch already in progress", () => {
    const p = ready();
    advanceStructure(p, "vat");
    expect(p.structures.vat.timer).toBe(12);
    advanceStructure(p, "vat");
    expect(p.structures.vat.timer).toBe(VAT.levels[1]!.batchSeconds);
  });

  it("a built vat completes the build quest on load if the event was missed", () => {
    const p = ready();
    advanceStructure(p, "vat");
    expect(p.quests["q-build-farm"]).toBeUndefined();
    createWorld(FACILITY, p);
    expect(isDone(p, "q-build-farm")).toBe(true);
  });
});
