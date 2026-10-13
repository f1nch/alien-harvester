import { describe, expect, it } from "vitest";
import { CONTAINMENT } from "../src/content/rooms";
import { UPGRADE_IDS, UPGRADES } from "../src/content/upgrades";
import { computeStats, purchaseUpgrade } from "../src/domain/economy";
import { newProgress } from "../src/domain/progress";
import { stepWorld } from "../src/game/step";
import { updateDeposit } from "../src/game/systems/deposit";
import { createWorld, SIM_DT } from "../src/game/world";
import { testWorld } from "./helpers";

describe("deposit", () => {
  it("banks exactly the cargo's rewards and empties the hold", () => {
    const w = testWorld([]);
    for (let i = 0; i < 7; i++) w.progress.cargo.push({ type: "worker", weight: 2, reward: { biomass: 3 } });
    w.player.x = w.room.base.x;
    w.player.z = w.room.base.z;
    for (let i = 0; i < 30; i++) updateDeposit(w, SIM_DT);
    expect(w.progress.cargo).toHaveLength(0);
    expect(w.progress.banked.biomass).toBe(21);
    expect(w.events.filter((e) => e.type === "depositComplete")).toHaveLength(1);
  });

  it("does nothing outside the base", () => {
    const w = testWorld([]);
    w.progress.cargo.push({ type: "worker", weight: 2, reward: { biomass: 3 } });
    for (let i = 0; i < 30; i++) updateDeposit(w, SIM_DT);
    expect(w.progress.cargo).toHaveLength(1);
    expect(w.progress.banked.biomass).toBe(0);
  });
});

describe("upgrades", () => {
  it("deducts and levels atomically, refusing when unaffordable", () => {
    const p = newProgress(CONTAINMENT);
    p.banked.biomass = 14;
    expect(purchaseUpgrade(p, "capturePower")).toEqual({ ok: false, reason: "unaffordable" });
    expect(p.banked.biomass).toBe(14);
    expect(p.upgrades.capturePower).toBe(0);
    p.banked.biomass = 15;
    expect(purchaseUpgrade(p, "capturePower")).toEqual({ ok: true });
    expect(p.banked.biomass).toBe(0);
    expect(p.upgrades.capturePower).toBe(1);
    expect(computeStats(p).capturePower).toBe(13);
  });

  it("stops at the level cap", () => {
    const p = newProgress(CONTAINMENT);
    p.banked.biomass = 1e9;
    const id = "moveSpeed";
    for (let i = 0; i < 20; i++) purchaseUpgrade(p, id);
    expect(p.upgrades[id]).toBe(UPGRADES[id].costs.length);
    expect(purchaseUpgrade(p, id)).toEqual({ ok: false, reason: "maxed" });
  });

  it("has strictly increasing costs on every track", () => {
    for (const id of UPGRADE_IDS) {
      const c = UPGRADES[id].costs;
      for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThan(c[i - 1]!);
    }
  });
});

describe("pacing smoke test", () => {
  it("a greedy bot captures within 20s and affords an upgrade within 2 minutes", () => {
    // Crude bot: walk toward the nearest worker; go home when full.
    const room = CONTAINMENT;
    const w = createWorld(room, newProgress(room));

    let firstCapture = -1;
    let firstAffordable = -1;
    for (let tick = 0; tick < 120 * 30; tick++) {
      const p = w.player;
      let gx = room.base.x;
      let gz = room.base.z;
      if (!w.cargoFull) {
        let best = Infinity;
        for (const t of w.targets) {
          const d = (t.x - p.x) ** 2 + (t.z - p.z) ** 2;
          if (d < best) [best, gx, gz] = [d, t.x, t.z];
        }
      }
      const dx = gx - p.x;
      const dz = gz - p.z;
      const len = Math.hypot(dx, dz);
      const near = !w.cargoFull && len < 1.2;
      w.input.x = near || len < 0.01 ? 0 : dx / len;
      w.input.z = near || len < 0.01 ? 0 : dz / len;
      stepWorld(w);
      if (firstCapture < 0 && w.progress.xp > 0) firstCapture = tick * SIM_DT;
      if (firstAffordable < 0 && w.progress.banked.biomass >= Math.min(...UPGRADE_IDS.map((id) => UPGRADES[id].costs[0]!)))
        firstAffordable = tick * SIM_DT;
    }
    expect(firstCapture).toBeGreaterThanOrEqual(0);
    expect(firstCapture).toBeLessThan(20);
    expect(firstAffordable).toBeGreaterThanOrEqual(0);
    expect(firstAffordable).toBeLessThan(120);
  });
});
