import { ENDLESS, EVOLUTIONS, endlessTiers, MAX_TIER } from "../content/evolution";
import { tidy } from "./biome";
import { bestiaryPowerPercent } from "./bestiary";
import { perkBonuses } from "./perks";
import { CURRENCIES, emptyWallet, roundCents, type Currency, type Wallet } from "../content/currencies";
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
  /** Vat production speed multiplier (1 = base). */
  farmRate: number;
  /** Percent less chill built up in freezing rooms (Thermal fat). */
  chillResist: number;
}

/**
 * The value an upgrade track currently provides, as shown to the player.
 * Includes evolution bonuses (tentacles, and the endless tiers' capture power and
 * health multipliers) so the panel shows the real value.
 */
export function upgradeValue(p: ProgressState, id: UpgradeId, level = p.upgrades[id]): number {
  const def = UPGRADES[id];
  const table = def.costs.length;
  // Linear through the hand-tuned table, then compounding for tracks that keep scaling.
  const v = def.growth && level > table
    ? (def.base + def.perLevel * table) * def.growth.valueFactor ** (level - table)
    : def.base + def.perLevel * level;
  const tiers = endlessTiers(p.evolution);
  if (id === "capturePower") return (v * (100 + ENDLESS.powerPercent * tiers)) / 100;
  if (id === "maxHealth") return (v * (100 + ENDLESS.healthPercent * tiers)) / 100;
  if (id === "tentacles") return Math.min(ENDLESS.maxTentacles, v + tentacleBonus(p.evolution));
  return v;
}

/** Short-lived percentage boosts (feeding frenzy, supply-pod power-ups). Never saved. */
export type StatBoost = Partial<Record<"capturePower" | "captureRadius" | "moveSpeed", number>>;
const NO_BOOST: StatBoost = {};

/**
 * Single place where progression becomes stats. Order is fixed:
 *   1. upgrade track value (base + levels, plus evolution bonuses),
 *   2. perk percentages for that stat, summed then applied once,
 *   3. flat perk bonuses.
 * Each stat is then applied in exactly one system, so nothing compounds by accident.
 */
export function computeStats(p: ProgressState, boost: StatBoost = NO_BOOST): PlayerStats {
  const v = (id: UpgradeId) => upgradeValue(p, id);
  const perk = perkBonuses(p);
  // Multiply before dividing so e.g. 20 * 107 / 100 can't become 21.3999… and floor wrong.
  const pct = (value: number, percent: number) => (value * (100 + percent)) / 100;
  const maxHealth = Math.round(pct(v("maxHealth"), perk.percent.maxHealth));
  // Bestiary milestones and short boosts join the perk percentages (summed, applied once).
  const power = perk.percent.capturePower + bestiaryPowerPercent(p) + (boost.capturePower ?? 0);
  return {
    moveSpeed: pct(v("moveSpeed"), perk.percent.moveSpeed + (boost.moveSpeed ?? 0)),
    captureRadius: pct(v("captureRadius"), perk.percent.captureRadius + (boost.captureRadius ?? 0)),
    capturePower: pct(v("capturePower"), power),
    tentacles: v("tentacles"),
    // Whole units: cargo weights are integers.
    cargoCapacity: Math.floor(pct(v("cargoCapacity"), perk.percent.cargoCapacity)),
    maxHealth,
    // Per 100 max health, so healing keeps pace as health scales in deeper biomes.
    regeneration: ((v("regeneration") + perk.regeneration) * maxHealth) / 100,
    // Applied only in the deposit system.
    yieldPercent: v("resourceYield") + perk.yieldPercent,
    farmRate: (100 + perk.farmPercent) / 100,
    chillResist: Math.min(90, v("thermalFat") + perk.loop.chillResist),
  };
}

/**
 * How many endless tiers add a tentacle: as many as fit under the cap with every
 * hand-made bonus and every tentacle upgrade, so a tentacle level bought later is never wasted.
 */
export const ENDLESS_TENTACLE_TIERS = ENDLESS.maxTentacles - UPGRADES.tentacles.base
  - EVOLUTIONS.reduce((n, e) => n + e.tentacleBonus, 0) - UPGRADES.tentacles.costs.length * UPGRADES.tentacles.perLevel;

function tentacleBonus(tier: number): number {
  let n = 0;
  for (const e of EVOLUTIONS) if (e.tier <= tier) n += e.tentacleBonus;
  return n + Math.min(endlessTiers(tier), ENDLESS_TENTACLE_TIERS);
}

/**
 * Level cap for a track at an evolution tier and depth: the tier's table cap (highest
 * defined cap past the last tier), plus perTier levels per endless tier, plus
 * capPerDepth per biome cleared for scaling tracks.
 */
export function capAt(id: UpgradeId, tier: number, depth: number): number {
  const def = UPGRADES[id];
  const caps = def.capByTier;
  const tierCap = Math.min(caps[Math.min(tier, caps.length - 1)]!, def.costs.length)
    + (def.perTier ? def.perTier.levels * endlessTiers(tier) : 0);
  return def.growth ? tierCap + def.growth.capPerDepth * depth : tierCap;
}

/** Current level cap given the player's evolution and depth. */
export function maxLevel(p: ProgressState, id: UpgradeId): number {
  return capAt(id, p.evolution, p.depth);
}

/**
 * At the cap: what would raise it. "evolve" when the next form allows more levels,
 * "nextBiome" for scaling tracks, null when the track is finished for good.
 */
export function capRaise(p: ProgressState, id: UpgradeId): "evolve" | "nextBiome" | null {
  const lvl = p.upgrades[id];
  if (lvl < maxLevel(p, id)) return null;
  if (p.evolution < MAX_TIER && capAt(id, p.evolution + 1, p.depth) > lvl) {
    // An endless tier t needs depth t − 1: until then, going deeper is the way.
    const endless = p.evolution + 1 > EVOLUTIONS.length;
    return !endless || p.depth >= p.evolution ? "evolve" : "nextBiome";
  }
  return UPGRADES[id].growth ? "nextBiome" : null;
}

/** Price of buying level i+1: the table, then compounding for tracks that go past it. */
export function levelCost(id: UpgradeId, i: number): number | null {
  const def = UPGRADES[id];
  const table = def.costs.length;
  if (i < table) return def.costs[i]!;
  const factor = def.growth?.costFactor ?? def.perTier?.costFactor;
  if (factor === undefined) return null;
  return tidy(def.costs[table - 1]! * factor ** (i - table + 1));
}

/** The second price for buying level i+1 (alloy on deep capture power), if any. */
export function levelExtraCost(id: UpgradeId, i: number): { currency: Currency; amount: number } | null {
  const x = UPGRADES[id].extraCost;
  if (!x || i < x.fromLevel) return null;
  return { currency: x.currency, amount: tidy(x.base * x.costFactor ** (i - x.fromLevel)) };
}

/** Second price of the next level, or null when there is none (or at the cap). */
export function nextExtraCost(p: ProgressState, id: UpgradeId): { currency: Currency; amount: number } | null {
  if (p.upgrades[id] >= maxLevel(p, id)) return null;
  return levelExtraCost(id, p.upgrades[id]);
}

/** Cost of the next level, or null at the current cap. */
export function nextCost(p: ProgressState, id: UpgradeId): number | null {
  if (p.upgrades[id] >= maxLevel(p, id)) return null;
  return levelCost(id, p.upgrades[id]);
}

/** Everything the next level costs across currencies (its price plus any second price), or null at the cap. */
export function upgradePrice(p: ProgressState, id: UpgradeId): Wallet | null {
  const cost = nextCost(p, id);
  if (cost === null) return null;
  const need = emptyWallet();
  need[UPGRADES[id].currency] += cost;
  const extra = levelExtraCost(id, p.upgrades[id]);
  if (extra) need[extra.currency] += extra.amount;
  return need;
}

export function canAfford(p: ProgressState, need: Wallet): boolean {
  return CURRENCIES.every((c) => p.banked[c] >= need[c]);
}

export type PurchaseResult = { ok: true } | { ok: false; reason: "maxed" | "unaffordable" };

/** Atomic: either the level increments and the cost is deducted, or nothing changes. */
export function purchaseUpgrade(p: ProgressState, id: UpgradeId): PurchaseResult {
  const cost = nextCost(p, id);
  const need = upgradePrice(p, id);
  if (cost === null || !need) return { ok: false, reason: "maxed" };
  if (!canAfford(p, need)) return { ok: false, reason: "unaffordable" };
  const extra = levelExtraCost(id, p.upgrades[id]);
  for (const c of CURRENCIES) if (need[c]) p.banked[c] = roundCents(p.banked[c] - need[c]);
  p.upgrades[id] += 1;
  p.upgradeSpent[id] += cost;
  if (extra) p.upgradeExtraSpent[id] += extra.amount;
  p.mutationsBought += 1;
  return { ok: true };
}

/** What was actually paid into the current mutations, per currency. */
export function spentOnUpgrades(p: ProgressState): Wallet {
  const spent = emptyWallet();
  for (const id of UPGRADE_IDS) {
    spent[UPGRADES[id].currency] += p.upgradeSpent[id];
    const x = UPGRADES[id].extraCost;
    if (x) spent[x.currency] += p.upgradeExtraSpent[id];
  }
  return spent;
}

/** Second-price total for a level count (dev tools re-seed upgradeExtraSpent with it). */
export function extraCostForLevels(id: UpgradeId, levels: number): number {
  let n = 0;
  for (let i = 0; i < levels && Number.isFinite(n); i++) n += levelExtraCost(id, i)?.amount ?? 0;
  return n;
}

/** Price total for a level count; used to seed upgradeSpent for saves that predate tracking it. */
export function tableCostForLevels(id: UpgradeId, levels: number): number {
  let n = 0;
  for (let i = 0; i < levels && Number.isFinite(n); i++) n += levelCost(id, i) ?? 0;
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
    p.upgradeExtraSpent[id] = 0;
  }
  return { ok: true, refund };
}
