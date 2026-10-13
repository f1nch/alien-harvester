import { EVOLUTIONS } from "../content/evolution";
import { CURRENCIES, emptyWallet, roundCents, type Wallet } from "../content/currencies";
import { UPGRADE_IDS, UPGRADES, type UpgradeId } from "../content/upgrades";
import type { ProgressState } from "./progress";

export interface PlayerStats {
  moveSpeed: number;
  captureRadius: number;
  capturePower: number;
  tentacles: number;
  cargoCapacity: number;
  maxHealth: number;
  /** Health per second regenerated out of combat. */
  regeneration: number;
  /** Whole percent of each drop's reward that is banked (100 = no bonus). */
  yieldPercent: number;
}

/**
 * The value an upgrade track currently provides, as shown to the player.
 * Tentacles include evolution bonuses so the panel shows the real count.
 */
export function upgradeValue(p: ProgressState, id: UpgradeId, level = p.upgrades[id]): number {
  const def = UPGRADES[id];
  const v = def.base + def.perLevel * level;
  return id === "tentacles" ? v + tentacleBonus(p.evolution) : v;
}

/**
 * Single place where upgrade levels become stats. Each stat comes from one
 * track and is applied in exactly one system, so multipliers can't compound.
 */
export function computeStats(p: ProgressState): PlayerStats {
  const v = (id: UpgradeId) => upgradeValue(p, id);
  return {
    moveSpeed: v("moveSpeed"),
    captureRadius: v("captureRadius"),
    capturePower: v("capturePower"),
    tentacles: v("tentacles"),
    cargoCapacity: v("cargoCapacity"),
    maxHealth: v("maxHealth"),
    regeneration: v("regeneration"),
    // Applied only in the deposit system.
    yieldPercent: v("resourceYield"),
  };
}

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
  p.banked[currency] = roundCents(p.banked[currency] - cost);
  p.upgrades[id] += 1;
  p.upgradeSpent[id] += cost;
  p.mutationsBought += 1;
  return { ok: true };
}

/** What was actually paid into the current mutations, per currency. */
export function spentOnUpgrades(p: ProgressState): Wallet {
  const spent = emptyWallet();
  for (const id of UPGRADE_IDS) spent[UPGRADES[id].currency] += p.upgradeSpent[id];
  return spent;
}

/** Cost-table total for a level count; used to seed upgradeSpent for saves that predate tracking it. */
export function tableCostForLevels(id: UpgradeId, levels: number): number {
  let n = 0;
  for (let i = 0; i < levels; i++) n += UPGRADES[id].costs[i] ?? 0;
  return n;
}

export type RespecResult = { ok: true; refund: Wallet } | { ok: false; reason: "nothing" };

/**
 * Free respec: every level is removed and its full cost refunded, in one step.
 * Evolution, quests and XP are untouched. Callers enforce where it is allowed.
 */
export function respecUpgrades(p: ProgressState): RespecResult {
  const refund = spentOnUpgrades(p);
  if (UPGRADE_IDS.every((id) => p.upgrades[id] === 0)) return { ok: false, reason: "nothing" };
  for (const c of CURRENCIES) p.banked[c] = roundCents(p.banked[c] + refund[c]);
  for (const id of UPGRADE_IDS) {
    p.upgrades[id] = 0;
    p.upgradeSpent[id] = 0;
  }
  return { ok: true, refund };
}
