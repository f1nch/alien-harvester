import { describe, expect, it } from "vitest";
import { FRENZY, PRIZED } from "../src/content/feeding";
import { FACILITY } from "../src/content/map";
import { MUTAGEN } from "../src/content/mutagen";
import { BESTIARY_MILESTONES, bestiaryPowerPercent, recordCapture } from "../src/domain/bestiary";
import { applyCravingEvent, applyCravingEvents, describeCraving, fillCravings, reachableTypes, type Craving } from "../src/domain/cravings";
import { computeStats } from "../src/domain/economy";
import { buyMutagen, feedingTuning } from "../src/domain/mutagen";
import { newProgress } from "../src/domain/progress";
import { buyMutagenMutation } from "../src/game/actions";
import { stepWorld } from "../src/game/step";
import { refreshStats, SIM_DT, type World } from "../src/game/world";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";
import { testWorld } from "./helpers";
import { UPGRADES } from "../src/content/upgrades";
import { BIOMES } from "../src/content/biomes";
import { leaveBiome } from "../src/game/actions";
import { createWorld } from "../src/game/world";
import { biomeAt } from "../src/domain/biome";
import { cargoWeight } from "../src/domain/progress";
import { updateCapture } from "../src/game/systems/capture";
import { updateFeeding, onTripBanked } from "../src/game/systems/feeding";

/** Run the sim for some seconds with the player standing still. */
function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) stepWorld(w);
}

/** A ring of stationary workers within reach, and a creature strong enough to eat them fast. */
function feedingWorld(n: number): World {
  const spots: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) spots.push([Math.cos(i) * 1.2, Math.sin(i) * 1.2]);
  const w = testWorld(spots);
  w.progress.upgrades.capturePower = 8;
  w.progress.upgrades.tentacles = 1;
  w.progress.upgrades.cargoCapacity = 8;
  refreshStats(w);
  // Keep the prized specimen out of the way unless a test wants it.
  w.feeding.prizedTimer = 1e9;
  return w;
}

describe("feeding frenzy", () => {
  it("a full combo starts a frenzy that doubles capture power, then ends", () => {
    const w = feedingWorld(FRENZY.combo);
    const base = w.stats.capturePower;
    let started = false;
    for (let i = 0; i < 30 * 20 && !started; i++) {
      stepWorld(w);
      started = w.events.some((e) => e.type === "frenzyStart");
      w.events.length = 0;
    }
    expect(started).toBe(true);
    expect(w.feeding.frenzy).toBeGreaterThan(0);
    expect(w.stats.capturePower).toBeCloseTo(base * (100 + FRENZY.powerPercent) / 100);
    run(w, FRENZY.seconds + 0.1);
    expect(w.feeding.frenzy).toBe(0);
    expect(w.stats.capturePower).toBeCloseTo(base);
  });

  it("the combo drops if captures are too far apart", () => {
    const w = feedingWorld(1);
    run(w, 3);
    expect(w.feeding.combo).toBe(1);
    run(w, FRENZY.comboWindow + 0.1);
    expect(w.feeding.combo).toBe(0);
  });
});

describe("supply pods", () => {
  it("never move, pay a light drop, and can hold a power-up", () => {
    const w = testWorld([[1, 0]], [], "pod");
    w.feeding.prizedTimer = 1e9;
    w.rng = () => 0; // always the first boost
    const pod = w.targets[0]!;
    const start = { x: pod.x, z: pod.z };
    run(w, 0.2);
    expect({ x: pod.x, z: pod.z }).toEqual(start);
    const base = w.stats.captureRadius;
    run(w, 3);
    expect(w.progress.cargo).toEqual([{ type: "pod", weight: 1, reward: { biomass: 8, genetic: 1 } }]);
    expect(w.feeding.boosts.magnet).toBeGreaterThan(0);
    expect(w.stats.captureRadius).toBeCloseTo(base * 1.5);
    expect(w.progress.bestiary.pod).toBeUndefined();
    run(w, feedingTuning(w.progress).boostSeconds + 0.1);
    expect(w.feeding.boosts.magnet).toBeUndefined();
    expect(w.stats.captureRadius).toBeCloseTo(base);
  });
});

describe("prized specimens", () => {
  it("one appears on schedule, bolts, and pays a bonus when caught", () => {
    // Out of reach at first: a held target is never picked.
    const w = testWorld([[12, 12]]);
    w.feeding.prizedTimer = 0;
    stepWorld(w);
    const t = w.targets[0]!;
    expect(t.prized).toBe(true);
    t.x = t.prevX = 1.2;
    t.z = t.prevZ = 0;
    const before = { ...w.progress.banked };
    w.events.length = 0;
    run(w, 4);
    expect(w.targets).toHaveLength(0);
    // Bonus: seven payouts banked at once (times yield), plus mutagen.
    expect(w.progress.banked.biomass - before.biomass).toBeCloseTo(3 * PRIZED.bonusPayouts);
    // Exactly the prized mutagen, plus whatever cravings this capture satisfied (judged once).
    const fromCravings = w.events.filter((e) => e.type === "cravingDone").reduce((a, e) => a + (e.type === "cravingDone" ? e.craving.reward : 0), 0);
    expect(w.progress.banked.mutagen).toBe(PRIZED.mutagen + fromCravings);
    // The next one is scheduled a full interval after the catch.
    expect(w.feeding.prizedTimer).toBeGreaterThan(feedingTuning(w.progress).prizedInterval - 4);
  });

  it("slips away when its time is up", () => {
    const w = testWorld([[15, 15]]);
    w.feeding.prizedTimer = 0;
    stepWorld(w);
    expect(w.targets[0]!.prized).toBe(true);
    run(w, PRIZED.seconds + 0.1);
    expect(w.targets[0]!.prized).toBe(false);
  });

  it("is catchable: it runs slower than even a starting creature", () => {
    expect(PRIZED.fleeSpeed).toBeLessThan(UPGRADES.moveSpeed.base);
  });

  it("is never a guard, the warden or a pod", () => {
    for (const type of ["guard", "armoredGuard", "boss", "pod"] as const) {
      const w = testWorld([[12, 12]], [], type);
      w.feeding.prizedTimer = 0;
      stepWorld(w);
      expect(w.targets.some((t) => t.prized)).toBe(false);
    }
  });
});

describe("cravings", () => {
  it("always three, rolled from reachable creatures, and the same after a reload", () => {
    const p = newProgress(FACILITY);
    fillCravings(p);
    expect(p.cravings).toHaveLength(3);
    for (const c of p.cravings) if (c.kind === "capture") expect(reachableTypes(p)).toContain(c.target);
    expect(reachableTypes(p)).toEqual(["worker"]);
    const reloaded = parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))))!.progress;
    fillCravings(reloaded);
    expect(reloaded.cravings.map(describeCraving)).toEqual(p.cravings.map(describeCraving));
  });

  it("a satisfied craving pays mutagen and is replaced at once", () => {
    const p = newProgress(FACILITY);
    p.cravings = [{ kind: "capture", target: "worker", goal: 2, progress: 1, reward: 3 }];
    p.cravingRolls = 5;
    const done = applyCravingEvent(p, { kind: "capture", target: "worker" });
    expect(done).toHaveLength(1);
    expect(p.banked.mutagen).toBe(3);
    expect(p.cravings).toHaveLength(3);
    expect(p.cravingRolls).toBe(8);
  });

  it("judges trips and bursts", () => {
    const p = newProgress(FACILITY);
    const c = (x: Partial<Craving>): Craving => ({ kind: "frenzy", goal: 1, progress: 0, reward: 1, ...x });
    p.cravings = [c({ kind: "bankTrip", goal: 25 }), c({ kind: "cleanTrip" }), c({ kind: "burst", goal: 3, seconds: 12 })];
    applyCravingEvent(p, { kind: "trip", biomass: 30, fullHold: true, hit: true });
    expect(p.cravings.map((x) => x.kind)).not.toContain("bankTrip");
    expect(p.cravings.find((x) => x.kind === "cleanTrip")!.progress).toBe(0);
    applyCravingEvent(p, { kind: "burst", countWithin: (s) => (s === 12 ? 3 : 0) });
    expect(p.cravings.map((x) => x.kind)).not.toContain("burst");
  });

  it("a fourth craving can be bought", () => {
    const w = feedingWorld(1);
    w.progress.banked.mutagen = 100;
    expect(buyMutagenMutation(w, "extraCraving")).toEqual({ ok: true });
    expect(w.progress.cravings).toHaveLength(4);
    expect(w.progress.banked.mutagen).toBe(100 - MUTAGEN.extraCraving.costs[0]!);
    expect(buyMutagenMutation(w, "extraCraving")).toEqual({ ok: false, reason: "maxed" });
  });
});

describe("mutagen mutations", () => {
  it("are atomic and change the loop tuning", () => {
    const p = newProgress(FACILITY);
    p.banked.mutagen = 3;
    expect(buyMutagen(p, "frenzyTime")).toEqual({ ok: false, reason: "unaffordable" });
    expect(p.banked.mutagen).toBe(3);
    p.banked.mutagen = 4;
    expect(buyMutagen(p, "frenzyTime")).toEqual({ ok: true });
    expect(p.banked.mutagen).toBe(0);
    expect(feedingTuning(p).frenzySeconds).toBe(FRENZY.seconds + 1);
  });
});

describe("bestiary", () => {
  it("milestones pay mutagen once and add capture power", () => {
    const p = newProgress(FACILITY);
    const base = computeStats(p).capturePower;
    for (let i = 0; i < 9; i++) recordCapture(p, "worker");
    expect(p.banked.mutagen).toBe(0);
    expect(recordCapture(p, "worker")).toEqual(BESTIARY_MILESTONES[0]);
    expect(p.banked.mutagen).toBe(BESTIARY_MILESTONES[0].mutagen);
    expect(bestiaryPowerPercent(p)).toBe(1);
    expect(computeStats(p).capturePower).toBeCloseTo(base * 1.01);
    expect(recordCapture(p, "worker")).toBeNull();
    expect(recordCapture(p, "pod")).toBeNull();
    expect(p.bestiary.pod).toBeUndefined();
  });
});

describe("saves (v10)", () => {
  it("migrates v9 saves with nothing yet", () => {
    const s = toSaveFile(newProgress(FACILITY), defaultSettings()) as any;
    s.schemaVersion = 9;
    for (const k of ["cravings", "cravingRolls", "mutagenLevels", "bestiary"]) delete s.progress[k];
    delete s.progress.banked.mutagen;
    const parsed = parseSave(s)!;
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.progress).toMatchObject({ cravings: [], cravingRolls: 0, mutagenLevels: {}, bestiary: {} });
    expect(parsed.progress.banked.mutagen).toBe(0);
  });

  it("keeps good cravings, drops odd ones, clamps mutagen levels, resets bursts", () => {
    const p = newProgress(FACILITY);
    p.cravings = [
      { kind: "capture", target: "worker", goal: 12, progress: 5, reward: 3 },
      { kind: "burst", goal: 3, seconds: 12, progress: 2, reward: 4 },
    ];
    p.mutagenLevels = { frenzyTime: 2 };
    p.bestiary = { worker: 42 };
    const s = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    s.progress.cravings.push({ kind: "dance", goal: 1, progress: 0, reward: 1 }, { kind: "capture", target: "boss", goal: 1, progress: 0, reward: 1 });
    s.progress.mutagenLevels.frenzyTime = 99;
    s.progress.mutagenLevels.gone = 1;
    const parsed = parseSave(s)!.progress;
    expect(parsed.cravings).toEqual([
      { kind: "capture", target: "worker", goal: 12, progress: 5, reward: 3 },
      { kind: "burst", goal: 3, seconds: 12, since: 0, progress: 0, reward: 4 },
    ]);
    expect(parsed.mutagenLevels).toEqual({ frenzyTime: MUTAGEN.frenzyTime.costs.length });
    expect(parsed.bestiary).toEqual({ worker: 42 });
  });

  it("rejects malformed new fields", () => {
    for (const patch of [{ cravings: "x" }, { cravingRolls: -1 }, { mutagenLevels: { frenzyTime: 1.5 } }, { bestiary: { worker: -2 } }]) {
      const s = JSON.parse(JSON.stringify(toSaveFile(newProgress(FACILITY), defaultSettings())));
      Object.assign(s.progress, patch);
      expect(parseSave(s)).toBeNull();
    }
  });

  it("round-trips a live world mid-loop", () => {
    const w = feedingWorld(FRENZY.combo);
    run(w, 6);
    const parsed = parseSave(JSON.parse(JSON.stringify(toSaveFile(w.progress, defaultSettings()))))!;
    expect(parsed).not.toBeNull();
    expect(parsed.progress.cravings.map(describeCraving)).toEqual(w.progress.cravings.map(describeCraving));
    expect(parsed.progress.bestiary).toEqual(w.progress.bestiary);
    expect(parsed.progress.banked.mutagen).toBe(w.progress.banked.mutagen);
  });

  it("accepts a bank-trip craving at the deepest depth", () => {
    const p = newProgress(FACILITY);
    p.depth = 300;
    p.cravings = [{ kind: "bankTrip", goal: 2.5e62, progress: 1e60, reward: 3 }];
    expect(parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))))!.progress.cravings).toHaveLength(1);
  });
});

describe("review regressions (Phase A)", () => {
  it("one moment pays each craving at most once, and never one it just rolled", () => {
    for (let seed = 0; seed < 200; seed++) {
      const p = newProgress(FACILITY);
      p.cravingRolls = seed;
      p.cravings = [{ kind: "capture", target: "worker", goal: 1, progress: 0, reward: 3 }];
      const done = applyCravingEvents(p, [{ kind: "capture", target: "worker" }, { kind: "prized" }, { kind: "frenzy" }, { kind: "burst", countWithin: () => 99 }]);
      // Only the craving that existed before the moment can pay.
      expect(done).toHaveLength(1);
      expect(p.banked.mutagen).toBe(3);
      expect(p.cravings).toHaveLength(3);
    }
  });

  it("burst cravings only count captures made after they were rolled", () => {
    const p = newProgress(FACILITY);
    p.playSeconds = 100;
    p.cravings = [{ kind: "burst", goal: 3, seconds: 12, since: 100, progress: 0, reward: 4 }];
    const times = [95, 97, 99, 101];
    const countWithin = (s: number, since: number) => times.filter((t) => t >= Math.max(101 - s, since)).length;
    expect(applyCravingEvent(p, { kind: "burst", countWithin })).toEqual([]);
    expect(p.cravings[0]!.progress).toBe(1);
  });

  it("the trip follows the real hold: the drone emptying it starts a fresh trip", () => {
    const w = feedingWorld(2);
    w.feeding.trip.hit = true;
    run(w, 3);
    expect(w.feeding.trip.peak).toBe(cargoWeight(w.progress.cargo));
    // The drone takes the hold in the field.
    w.progress.cargo = [];
    updateFeeding(w, SIM_DT);
    expect(w.feeding.trip).toEqual({ biomass: 0, peak: 0, hit: false });
  });

  it("a hold filled by vat batches counts as full", () => {
    const w = feedingWorld(0);
    const cap = w.stats.cargoCapacity;
    w.progress.cravings = [{ kind: "cleanTrip", goal: 1, progress: 0, reward: 3 }];
    for (let i = 0; i < cap / 2; i++) w.progress.cargo.push({ type: "vat", weight: 2, reward: { biomass: 5 } });
    updateFeeding(w, SIM_DT);
    onTripBanked(w);
    expect(w.progress.banked.mutagen).toBe(3);
  });

  it("pods don't stop the hold reading as full for creatures", () => {
    const w = testWorld([[15, 15], [-15, 15]], [], "worker");
    w.targets[1]!.def = biomeAt(0).targets.pod;
    w.progress.cargo = [];
    const cap = w.stats.cargoCapacity;
    for (let i = 0; i < cap - 1; i++) w.progress.cargo.push({ type: "pod", weight: 1, reward: { biomass: 8 } });
    updateCapture(w, SIM_DT);
    expect(w.cargoFull).toBe(true);
  });

  it("pods count for neither the combo nor the bestiary", () => {
    const w = testWorld([[1, 0]], [], "pod");
    w.feeding.prizedTimer = 1e9;
    run(w, 3);
    expect(w.progress.cargo).toHaveLength(1);
    expect(w.feeding.combo).toBe(0);
    expect(w.progress.bestiary).toEqual({});
  });

  it("a bestiary milestone from a real capture raises capture power at once", () => {
    const w = feedingWorld(1);
    w.progress.bestiary.worker = 9;
    const before = w.stats.capturePower;
    run(w, 3);
    expect(w.progress.bestiary.worker).toBe(10);
    expect(w.stats.capturePower).toBeGreaterThan(before);
  });

  it("dying with cargo ends the trip; a forgiven death keeps it", () => {
    const w = feedingWorld(2);
    run(w, 3);
    const peak = w.feeding.trip.peak;
    expect(peak).toBeGreaterThan(0);
    w.progress.player.health = 0;
    stepWorld(w); // first death is forgiven: cargo and trip kept
    expect(w.feeding.trip.peak).toBe(peak);
    w.player.invulnerable = 0;
    w.progress.player.health = 0;
    stepWorld(w);
    expect(w.feeding.trip.peak).toBe(0);
  });

  it("moving on clears cravings; the new floor rolls them the same way every time", () => {
    const p = newProgress(FACILITY);
    p.evolution = 1;
    for (const d of FACILITY.doors) p.unlockedDoors.push(d.id);
    for (const q of BIOMES[0]!.quests) p.quests[q.id] = { count: 1, done: true };
    p.reactorRepaired = true;
    p.player.x = BIOMES[0]!.exit.x;
    p.player.z = BIOMES[0]!.exit.z;
    const w = createWorld(FACILITY, p);
    expect(w.progress.cravings.length).toBeGreaterThan(0);
    expect(leaveBiome(w).ok).toBe(true);
    expect(w.progress.cravings).toEqual([]);
    const a = structuredClone(w.progress);
    const b = structuredClone(w.progress);
    createWorld(biomeAt(1).def.map, a);
    createWorld(biomeAt(1).def.map, b);
    expect(a.cravings).toHaveLength(3);
    expect(a.cravings).toEqual(b.cravings);
  });
});
