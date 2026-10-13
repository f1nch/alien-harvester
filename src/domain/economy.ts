import { EVOLUTIONS } from "../content/evolution";
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
    tentacles: BASE_TENTACLES + tentacleBonus(p.evolution),
    cargoCapacity: v("cargoCapacity"),
    maxHealth: 100,
    yieldMultiplier: 1,
  };
}

const BASE_TENTACLES = 2;

function tentacleBonus(tier: number): number {
  let n = 0;
  for (const e of EVOLUTIONS) if (e.tier <= tier) n += e.tentacleBonus;
  return n;
}

/** Level cap for a track at an evolution tier (highest defined cap past the last tier). */
export function capAtTier(id: UpgradeId, tier: number): number {
  const caps = UPGRADES[id].capByTier;
  return Math.min(caps[Math.min(tier, caps.length - 1)]!, UPGRADES[id].costs.length);
}

/** Current level cap given the player's evolution. */
export function maxLevel(p: ProgressState, id: UpgradeId): number {
  return capAtTier(id, p.evolution);
}

/** True when the track is capped now but evolving would allow more levels. */
export function cappedByEvolution(p: ProgressState, id: UpgradeId): boolean {
  return p.upgrades[id] >= maxLevel(p, id) && p.upgrades[id] < UPGRADES[id].costs.length;
}

/** Cost of the next level, or null at the current cap. */
export function nextCost(p: ProgressState, id: UpgradeId): number | null {
  if (p.upgrades[id] >= maxLevel(p, id)) return null;
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
