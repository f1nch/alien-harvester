import { describe, expect, it } from "vitest";
import { FACILITY } from "../src/content/map";
import { PERK_IDS, PERKS, type PerkId } from "../src/content/perks";
import { computeStats } from "../src/domain/economy";
import { choosePerk, claimFallback, isLegal, rollPerkChoice } from "../src/domain/perks";
import { newProgress } from "../src/domain/progress";
import { mulberry32 } from "../src/domain/rng";
import { pickPerk } from "../src/game/actions";
import { createWorld, gainXp, questEvent } from "../src/game/world";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";

const roundTrip = (p: ReturnType<typeof newProgress>) =>
  parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))))!.progress;

describe("perk choices", () => {
  it("each level-up queues one choice of three distinct legal perks", () => {
    const w = createWorld(FACILITY, newProgress(FACILITY), 42);
    gainXp(w, 60); // level 2
    expect(w.progress.pendingPerks).toHaveLength(1);
    const c = w.progress.pendingPerks[0]!;
    expect(c.level).toBe(2);
    expect(c.options).toHaveLength(3);
    expect(new Set(c.options).size).toBe(3);
    expect(c.options.every((id) => isLegal(w.progress, id))).toBe(true);
  });

  it("several levels at once queue several choices, oldest first", () => {
    const w = createWorld(FACILITY, newProgress(FACILITY), 7);
    gainXp(w, 700); // levels 2–5
    expect(w.progress.pendingPerks.map((c) => c.level)).toEqual([2, 3, 4, 5]);
  });

  it("quest XP earns choices too", () => {
    const w = createWorld(FACILITY, newProgress(FACILITY), 1);
    w.progress.xp = 55;
    w.progress.quests["q-first-catch"] = { count: 4, done: false };
    // Completing q-first-catch grants 10 XP: 55 → 65 crosses level 2.
    questEvent(w, { kind: "capture", target: "worker" });
    expect(w.progress.quests["q-first-catch"]!.done).toBe(true);
    expect(w.progress.pendingPerks.map((c) => c.level)).toEqual([2]);
  });

  it("options survive save and reload unchanged, so reloading never rerolls", () => {
    const w = createWorld(FACILITY, newProgress(FACILITY), 99);
    gainXp(w, 180);
    const saved = JSON.stringify(w.progress.pendingPerks);
    expect(JSON.stringify(roundTrip(w.progress).pendingPerks)).toBe(saved);
  });

  it("never offers maxed perks or perks whose door is still locked", () => {
    const p = newProgress(FACILITY);
    p.perks.cargo = 3;
    p.perks.radius = 2;
    for (let s = 0; s < 200; s++) {
      const c = rollPerkChoice(p, 3, mulberry32(s));
      expect(c.options).not.toContain("cargo");
      expect(c.options).not.toContain("radius");
      expect(c.options).not.toContain("geneSample");
    }
    p.unlockedDoors.push("door-service");
    const seen = new Set<PerkId>();
    for (let s = 0; s < 200; s++) for (const id of rollPerkChoice(p, 3, mulberry32(s)).options) seen.add(id);
    expect(seen.has("geneSample")).toBe(true);
  });

  it("offers fewer than three only when fewer are legal (one-time grants keep it non-empty)", () => {
    const p = newProgress(FACILITY);
    for (const id of PERK_IDS) {
      const max = PERKS[id].maxStacks;
      if (max !== null) p.perks[id] = max;
    }
    expect(rollPerkChoice(p, 5, mulberry32(1)).options).toEqual(["biomassCache"]);
  });
});

describe("choosing", () => {
  const withChoice = (options: PerkId[], level = 4) => {
    const p = newProgress(FACILITY);
    p.pendingPerks.push({ level, options });
    return p;
  };

  it("applies the perk and removes the choice in one step; it can't be claimed twice", () => {
    const p = withChoice(["cargo", "power", "speed"]);
    expect(choosePerk(p, 0)).toEqual({ ok: true, perk: "cargo" });
    expect(p.perks.cargo).toBe(1);
    expect(p.pendingPerks).toHaveLength(0);
    expect(choosePerk(p, 0)).toEqual({ ok: false, reason: "none" });
  });

  it("grants scale with the level the choice was earned at", () => {
    const p = withChoice(["biomassCache", "power", "speed"], 6);
    choosePerk(p, 0);
    expect(p.banked.biomass).toBe(30 + 15 * 6);
  });

  it("rejects an option an earlier pick already maxed, and offers a fallback if all are", () => {
    const p = newProgress(FACILITY);
    p.perks.cargo = 2;
    p.pendingPerks.push({ level: 2, options: ["cargo"] }, { level: 3, options: ["cargo"] });
    expect(choosePerk(p, 0).ok).toBe(true);
    expect(choosePerk(p, 0)).toEqual({ ok: false, reason: "illegal" });
    expect(claimFallback(p)).toEqual({ ok: true, perk: "biomassCache" });
    expect(p.pendingPerks).toHaveLength(0);
    expect(p.banked.biomass).toBe(30 + 15 * 3);
  });

  it("fallback is refused while a legal option exists", () => {
    const p = withChoice(["cargo", "power", "speed"]);
    expect(claimFallback(p)).toEqual({ ok: false, reason: "illegal" });
  });
});

describe("perk stats", () => {
  it("same-stat percentages add instead of compounding, applied after upgrades", () => {
    const p = newProgress(FACILITY);
    p.upgrades.cargoCapacity = 2; // 36
    p.perks.cargo = 3; // +30%
    expect(computeStats(p).cargoCapacity).toBe(Math.floor(36 * 1.3));
    p.perks.power = 2;
    expect(computeStats(p).capturePower).toBeCloseTo(10 * 1.16);
  });

  it("flat bonuses add to regeneration and yield", () => {
    const p = newProgress(FACILITY);
    p.perks.regen = 2;
    p.perks.yield = 1;
    expect(computeStats(p)).toMatchObject({ regeneration: 4, yieldPercent: 105 });
  });

  it("picking a health perk fills the extra health", () => {
    const p = newProgress(FACILITY);
    p.pendingPerks.push({ level: 3, options: ["health", "power", "speed"] });
    const w = createWorld(FACILITY, p);
    w.progress.player.health = 50;
    expect(pickPerk(w, 0).ok).toBe(true);
    expect(w.stats.maxHealth).toBe(110);
    expect(w.progress.player.health).toBe(60);
  });
});

describe("perk saves", () => {
  it("migrates v5 saves, backfilling one choice per level already reached, deterministically", () => {
    const v5 = JSON.parse(JSON.stringify(toSaveFile(newProgress(FACILITY), defaultSettings())));
    v5.schemaVersion = 5;
    v5.progress.xp = 400; // level 4
    delete v5.progress.perks;
    delete v5.progress.pendingPerks;
    const a = parseSave(structuredClone(v5))!;
    const b = parseSave(structuredClone(v5))!;
    expect(a.schemaVersion).toBe(SCHEMA_VERSION);
    expect(a.progress.pendingPerks.map((c) => c.level)).toEqual([2, 3, 4]);
    expect(a.progress.pendingPerks).toEqual(b.progress.pendingPerks);
    // The marker never survives into a written save.
    expect(JSON.stringify(toSaveFile(a.progress, a.settings))).not.toContain("Backfill");
  });

  it("current saves are never backfilled again", () => {
    const p = newProgress(FACILITY);
    p.xp = 400;
    expect(roundTrip(p).pendingPerks).toEqual([]);
  });

  it("drops removed perks, clamps stacks, rejects malformed data", () => {
    const s = toSaveFile(newProgress(FACILITY), defaultSettings()) as any;
    s.progress.xp = 200; // level 3, so choices for levels 2 and 3 are real
    s.progress.perks = { cargo: 9, gone: 2 };
    s.progress.pendingPerks = [{ level: 2, options: ["gone", "power", "power"] }, { level: 3, options: ["gone"] }];
    const parsed = parseSave(s)!;
    expect(parsed.progress.perks).toEqual({ cargo: 3 });
    expect(parsed.progress.pendingPerks).toEqual([
      { level: 2, options: ["power"] },
      { level: 3, options: ["biomassCache"] },
    ]);
    s.progress.perks = { cargo: 1.5 };
    expect(parseSave(s)).toBeNull();
  });

  it("perks that raise capacity are applied before cargo is validated on load", () => {
    const p = newProgress(FACILITY);
    p.perks.cargo = 3; // capacity 26
    for (let i = 0; i < 13; i++) p.cargo.push({ type: "worker", weight: 2, reward: { biomass: 3 } });
    expect(roundTrip(p).cargo).toHaveLength(13);
  });
});


describe("perk review regressions", () => {
  it("offers the fallback when earlier picks leave fewer than three legal options", () => {
    const p = newProgress(FACILITY);
    p.perks.cargo = 3;
    p.pendingPerks.push({ level: 3, options: ["cargo", "power", "speed"] });
    expect(claimFallback(p)).toEqual({ ok: true, perk: "biomassCache" });
  });

  it("rejects pending choices with impossible levels", () => {
    const s = toSaveFile(newProgress(FACILITY), defaultSettings()) as any;
    s.progress.pendingPerks = [{ level: -5, options: ["biomassCache"] }];
    expect(parseSave(s)).toBeNull();
    s.progress.pendingPerks = [{ level: 999, options: ["biomassCache"] }];
    expect(parseSave(s)).toBeNull();
  });

  it("current-version saves never backfill, whatever extra keys they carry", () => {
    const s = toSaveFile(newProgress(FACILITY), defaultSettings()) as any;
    s.progress.xp = 400;
    s.progress.__perkBackfill = true;
    expect(parseSave(s)!.progress.pendingPerks).toEqual([]);
  });

  it("choices earned while settling quests at load are the same on every load", () => {
    const p = newProgress(FACILITY);
    p.xp = 55;
    for (const id of ["q-first-catch", "q-first-bank"]) p.quests[id] = { count: 999, done: true };
    p.upgrades.capturePower = 1; // q-first-upgrade settles on load: +20 XP crosses level 2
    const a = createWorld(FACILITY, structuredClone(p), 1).progress.pendingPerks;
    const b = createWorld(FACILITY, structuredClone(p), 999).progress.pendingPerks;
    expect(a).toHaveLength(1);
    expect(a).toEqual(b);
  });
});
