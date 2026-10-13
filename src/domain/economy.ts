import { UPGRADES, type UpgradeId } from "../content/upgrades";
import type { ProgressState } from "./progress";

export interface PlayerStats {
  moveSpeed: number;
  captureRadius: number;
  capturePower: number;
  tentacles: number;
  cargoCapacity: number;
  maxHealth: number;
  yieldMultiplier: number;
}

/** Single place where upgrade levels become stats, so multipliers can't compound by accident. */
export function computeStats(p: ProgressState): PlayerStats {
  const v = (id: UpgradeId) => UPGRADES[id].base + UPGRADES[id].perLevel * p.upgrades[id];
  return {
    moveSpeed: v("moveSpeed"),
    captureRadius: v("captureRadius"),
    capturePower: v("capturePower"),
    tentacles: 2,
    cargoCapacity: v("cargoCapacity"),
    maxHealth: 100,
    yieldMultiplier: 1,
  };
}

export function maxLevel(id: UpgradeId): number {
  return UPGRADES[id].costs.length;
}

/** Cost of the next level, or null at the cap. */
export function nextCost(p: ProgressState, id: UpgradeId): number | null {
  return UPGRADES[id].costs[p.upgrades[id]] ?? null;
}

export type PurchaseResult = { ok: true } | { ok: false; reason: "maxed" | "unaffordable" };

/** Atomic: either the level increments and the cost is deducted, or nothing changes. */
export function purchaseUpgrade(p: ProgressState, id: UpgradeId): PurchaseResult {
  const cost = nextCost(p, id);
  if (cost === null) return { ok: false, reason: "maxed" };
  const currency = UPGRADES[id].currency;
  if (p.banked[currency] < cost) return { ok: false, reason: "unaffordable" };
  p.banked[currency] -= cost;
  p.upgrades[id] += 1;
  return { ok: true };
}
