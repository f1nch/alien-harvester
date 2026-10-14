import { describe, expect, it } from "vitest";
import { FACILITY } from "../src/content/map";
import { UPGRADE_IDS, UPGRADES } from "../src/content/upgrades";
import { computeStats, purchaseUpgrade, respecUpgrades, spentOnUpgrades, upgradeValue } from "../src/domain/economy";
import { evolve } from "../src/domain/evolution";
import { newProgress } from "../src/domain/progress";
import { buyUpgrade, respec } from "../src/game/actions";
import { stepWorld } from "../src/game/step";
import { updateDeposit } from "../src/game/systems/deposit";
import { createWorld, SIM_DT } from "../src/game/world";
import { defaultSettings, parseSave, toSaveFile } from "../src/persistence/schema";
import { testWorld } from "./helpers";

const rich = () => {
  const p = newProgress(FACILITY);
  p.banked = { biomass: 1e6, genetic: 1e6, parts: 0, mutagen: 0 };
  return p;
};

describe("new upgrade tracks", () => {
  it("each track feeds exactly one stat", () => {
    const p = rich();
    const base = computeStats(p);
    expect(base).toMatchObject({ tentacles: 2, maxHealth: 100, regeneration: 2, yieldPercent: 100 });
    purchaseUpgrade(p, "tentacles");
    purchaseUpgrade(p, "maxHealth");
    purchaseUpgrade(p, "regeneration");
    purchaseUpgrade(p, "resourceYield");
    // Regeneration is per 100 max health: 3 at 120 health heals 3.6/s.
    expect(computeStats(p)).toMatchObject({ tentacles: 3, maxHealth: 120, regeneration: 3.6, yieldPercent: 110 });
    // Untouched stats unchanged.
    expect(computeStats(p).capturePower).toBe(base.capturePower);
  });

  it("charges genetic material where the track says so", () => {
    const p = newProgress(FACILITY);
    p.banked.biomass = 1000;
    expect(purchaseUpgrade(p, "tentacles")).toEqual({ ok: false, reason: "unaffordable" });
    p.banked.genetic = 25;
    expect(purchaseUpgrade(p, "tentacles").ok).toBe(true);
    expect(p.banked).toMatchObject({ biomass: 1000, genetic: 0 });
  });

  it("tentacles stay small: one level before evolving, three after; evolution bonus stacks", () => {
    const p = rich();
    expect(purchaseUpgrade(p, "tentacles").ok).toBe(true);
    expect(purchaseUpgrade(p, "tentacles")).toEqual({ ok: false, reason: "maxed" });
    p.quests["q-genetic"] = { count: 25, done: true };
    p.mutationsBought = 10;
    expect(evolve(p).ok).toBe(true);
    purchaseUpgrade(p, "tentacles");
    purchaseUpgrade(p, "tentacles");
    expect(computeStats(p).tentacles).toBe(2 + 1 + 3);
    expect(upgradeValue(p, "tentacles")).toBe(6);
  });

  it("a bigger health pool comes filled in at base, but not in the field", () => {
    const w = createWorld(FACILITY, rich());
    w.player.x = FACILITY.base.x;
    w.player.z = FACILITY.base.z;
    w.progress.player.health = 50;
    buyUpgrade(w, "maxHealth");
    expect(w.stats.maxHealth).toBe(120);
    expect(w.progress.player.health).toBe(70);
    w.player.x = 5;
    w.player.z = 5;
    buyUpgrade(w, "maxHealth");
    expect(w.stats.maxHealth).toBe(140);
    expect(w.progress.player.health).toBe(70);
  });

  it("regeneration uses the track's rate", () => {
    const w = testWorld([]);
    w.progress.upgrades.regeneration = 3;
    w.stats = computeStats(w.progress);
    w.player.x = 10;
    w.player.z = 10;
    w.progress.player.health = 20;
    w.player.sinceHit = 99;
    for (let i = 0; i < 30; i++) stepWorld(w);
    expect(w.progress.player.health).toBeCloseTo(25, 1);
  });

  it("yield multiplies banked rewards once, at deposit", () => {
    const w = testWorld([]);
    w.progress.upgrades.resourceYield = 2;
    w.stats = computeStats(w.progress);
    w.progress.cargo.push({ type: "technician", weight: 3, reward: { biomass: 10, genetic: 5 } });
    w.player.x = w.map.base.x;
    w.player.z = w.map.base.z;
    for (let i = 0; i < 10; i++) updateDeposit(w, SIM_DT);
    expect(w.progress.banked.biomass).toBeCloseTo(12);
    expect(w.progress.banked.genetic).toBeCloseTo(6);
  });

  it("saves from before these tracks load with them at level 0", () => {
    const old = JSON.parse(JSON.stringify(toSaveFile(newProgress(FACILITY), defaultSettings())));
    for (const id of ["tentacles", "maxHealth", "regeneration", "resourceYield"]) delete old.progress.upgrades[id];
    old.progress.upgrades.capturePower = 3;
    const parsed = parseSave(old)!;
    expect(parsed.progress.upgrades).toMatchObject({ capturePower: 3, tentacles: 0, maxHealth: 0, regeneration: 0, resourceYield: 0 });
  });

  it("every track has costs for every level its highest cap allows", () => {
    for (const id of UPGRADE_IDS) {
      const d = UPGRADES[id];
      expect(d.costs.length).toBeGreaterThanOrEqual(d.capByTier[d.capByTier.length - 1]!);
    }
  });
});

describe("respec", () => {
  it("refunds exactly what was spent and resets every level", () => {
    const p = rich();
    for (const id of ["capturePower", "capturePower", "tentacles", "maxHealth", "resourceYield"] as const) purchaseUpgrade(p, id);
    const spent = spentOnUpgrades(p);
    expect(spent).toEqual({ biomass: 15 + 35 + 40, genetic: 25 + 20, parts: 0, mutagen: 0 });
    const r = respecUpgrades(p);
    expect(r).toEqual({ ok: true, refund: spent });
    expect(p.banked).toEqual({ biomass: 1e6, genetic: 1e6, parts: 0, mutagen: 0 });
    expect(UPGRADE_IDS.every((id) => p.upgrades[id] === 0)).toBe(true);
  });

  it("does nothing when there is nothing to refund", () => {
    expect(respecUpgrades(newProgress(FACILITY))).toEqual({ ok: false, reason: "nothing" });
  });

  it("only works at base, keeps evolution, and clamps health to the new maximum", () => {
    const p = rich();
    p.evolution = 1;
    for (let i = 0; i < 3; i++) purchaseUpgrade(p, "maxHealth");
    const w = createWorld(FACILITY, p);
    w.progress.player.health = 160;
    w.player.x = 5;
    w.player.z = 5;
    expect(respec(w)).toEqual({ ok: false, reason: "notAtBase" });
    w.player.x = FACILITY.base.x;
    w.player.z = FACILITY.base.z;
    expect(respec(w).ok).toBe(true);
    expect(w.progress.evolution).toBe(1);
    expect(w.stats.maxHealth).toBe(100);
    expect(w.progress.player.health).toBe(100);
    expect(w.stats.tentacles).toBe(3);
  });
});

describe("economy review regressions", () => {
  it("ten +10% deposits of 1 bank exactly 11, so an 11-cost purchase is affordable", () => {
    const w = testWorld([]);
    w.progress.upgrades.resourceYield = 1;
    w.stats = computeStats(w.progress);
    w.player.x = w.map.base.x;
    w.player.z = w.map.base.z;
    for (let i = 0; i < 10; i++) w.progress.cargo.push({ type: "worker", weight: 2, reward: { biomass: 1 } });
    for (let i = 0; i < 30; i++) updateDeposit(w, SIM_DT);
    expect(w.progress.banked.biomass).toBe(11);
  });

  it("respec is refused while cargo is aboard or a tentacle is capturing", () => {
    const p = rich();
    purchaseUpgrade(p, "cargoCapacity");
    const w = createWorld(FACILITY, p);
    w.player.x = FACILITY.base.x;
    w.player.z = FACILITY.base.z;
    w.progress.cargo.push({ type: "worker", weight: 2, reward: { biomass: 3 } });
    expect(respec(w)).toEqual({ ok: false, reason: "cargoAboard" });
    w.progress.cargo = [];
    w.tentacles = [w.targets[0]!, null];
    expect(respec(w)).toEqual({ ok: false, reason: "cargoAboard" });
    w.tentacles = [null, null];
    expect(respec(w).ok).toBe(true);
  });

  it("the evolution gate counts lifetime purchases, so respec can't refund it", () => {
    const p = rich();
    for (let i = 0; i < 5; i++) purchaseUpgrade(p, "capturePower");
    for (let i = 0; i < 5; i++) purchaseUpgrade(p, "cargoCapacity");
    expect(p.mutationsBought).toBe(10);
    respecUpgrades(p);
    expect(p.mutationsBought).toBe(10);
    purchaseUpgrade(p, "moveSpeed");
    expect(p.mutationsBought).toBe(11);
  });

  it("refunds what was actually paid, even if prices change later", () => {
    const p = rich();
    purchaseUpgrade(p, "capturePower");
    p.upgradeSpent.capturePower = 7; // as if the price was 7 when bought
    const before = p.banked.biomass;
    respecUpgrades(p);
    expect(p.banked.biomass).toBe(before + 7);
  });

  it("migrates v4 saves by seeding spend from the cost tables", () => {
    const v4 = JSON.parse(JSON.stringify(toSaveFile(newProgress(FACILITY), defaultSettings())));
    v4.schemaVersion = 4;
    v4.progress.upgrades.capturePower = 2;
    v4.progress.upgrades.tentacles = 1;
    delete v4.progress.upgradeSpent;
    delete v4.progress.mutationsBought;
    const parsed = parseSave(v4)!;
    expect(parsed.progress.upgradeSpent.capturePower).toBe(15 + 35);
    expect(parsed.progress.upgradeSpent.tentacles).toBe(25);
    expect(parsed.progress.mutationsBought).toBe(3);
  });
});
