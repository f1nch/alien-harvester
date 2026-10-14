import { CURRENCY_LABEL, roundCents } from "../content/currencies";
import { CHOICES_PER_LEVEL, PERK_IDS, PERKS, type PerkDef, type PerkId } from "../content/perks";
import type { ProgressState } from "./progress";
import { scaleAt, tidy } from "./biome";

/** A level-up choice. Options are rolled once and saved, so reloading never rerolls them. */
export interface PerkChoice {
  level: number;
  options: PerkId[];
}

export function perkStacks(p: ProgressState, id: PerkId): number {
  return p.perks[id] ?? 0;
}

/** Whether a perk may be offered or taken right now. */
export function isLegal(p: ProgressState, id: PerkId): boolean {
  const def = PERKS[id];
  if (def.requiresDoor && !p.unlockedDoors.includes(def.requiresDoor)) return false;
  if (def.requiresVat && !p.structures.vat.built) return false;
  return def.maxStacks === null || perkStacks(p, id) < def.maxStacks;
}

/** Roll up to three distinct legal perks. Uses the caller's RNG so tests can be deterministic. */
export function rollPerkChoice(p: ProgressState, level: number, rng: () => number): PerkChoice {
  const pool = PERK_IDS.filter((id) => isLegal(p, id));
  const options: PerkId[] = [];
  while (options.length < CHOICES_PER_LEVEL && pool.length > 0) {
    const i = Math.floor(rng() * pool.length);
    options.push(pool.splice(i, 1)[0]!);
  }
  return { level, options };
}

/** Queue one choice per level gained, in order. */
export function queuePerkChoices(p: ProgressState, levels: readonly number[], rng: () => number): void {
  for (const level of levels) p.pendingPerks.push(rollPerkChoice(p, level, rng));
}

/** One-off grants grow with level and, like every payout, with depth. */
export function grantAmount(def: PerkDef, level: number, depth: number): number {
  if (def.effect.kind !== "grant") return 0;
  const amount = def.effect.base + def.effect.perLevel * level;
  return depth === 0 ? amount : tidy(amount * scaleAt(depth).reward);
}

export function describePerk(def: PerkDef, level: number, depth: number): string {
  const e = def.effect;
  switch (e.kind) {
    case "percent": {
      const stat = {
        cargoCapacity: "cargo capacity", capturePower: "capture power", moveSpeed: "movement speed",
        captureRadius: "capture radius", maxHealth: "maximum health",
      }[e.stat];
      return `+${e.percent}% ${stat}`;
    }
    case "flat":
      if (e.stat === "regeneration") return `+${e.amount}% of max health/s regeneration`;
      if (e.stat === "farmPercent") return `+${e.amount}% vat production`;
      return `+${e.amount}% resource yield`;
    case "grant":
      return `Gain ${grantAmount(def, level, depth)} ${CURRENCY_LABEL[e.currency].toLowerCase()} now`;
  }
}

export type ChooseResult =
  | { ok: true; perk: PerkId }
  | { ok: false; reason: "none" | "badOption" | "illegal" };

/**
 * Take one option from the oldest pending choice. One transaction: the choice
 * is removed and the perk applied together, so it can't be claimed twice.
 */
export function choosePerk(p: ProgressState, optionIndex: number): ChooseResult {
  const choice = p.pendingPerks[0];
  if (!choice) return { ok: false, reason: "none" };
  const id = choice.options[optionIndex];
  if (!id) return { ok: false, reason: "badOption" };
  // An earlier queued pick may have maxed this perk since it was offered.
  if (!isLegal(p, id)) return { ok: false, reason: "illegal" };
  p.pendingPerks.shift();
  applyPerk(p, id, choice.level);
  return { ok: true, perk: id };
}

/**
 * Fallback when earlier picks maxed some options so fewer than three are legal:
 * take a biomass cache instead. Options are never replaced (that would be a reroll).
 */
export function claimFallback(p: ProgressState): ChooseResult {
  const choice = p.pendingPerks[0];
  if (!choice) return { ok: false, reason: "none" };
  if (choice.options.filter((id) => isLegal(p, id)).length >= CHOICES_PER_LEVEL) return { ok: false, reason: "illegal" };
  p.pendingPerks.shift();
  applyPerk(p, "biomassCache", choice.level);
  return { ok: true, perk: "biomassCache" };
}

function applyPerk(p: ProgressState, id: PerkId, level: number): void {
  const def = PERKS[id];
  if (def.effect.kind === "grant") {
    const c = def.effect.currency;
    p.banked[c] = roundCents(p.banked[c] + grantAmount(def, level, p.depth));
  }
  p.perks[id] = perkStacks(p, id) + 1;
}

/** Summed perk bonuses per stat, for computeStats. Same-stat bonuses add, never compound. */
export function perkBonuses(p: ProgressState): {
  percent: Record<"cargoCapacity" | "capturePower" | "moveSpeed" | "captureRadius" | "maxHealth", number>;
  regeneration: number;
  yieldPercent: number;
  farmPercent: number;
} {
  const out = {
    percent: { cargoCapacity: 0, capturePower: 0, moveSpeed: 0, captureRadius: 0, maxHealth: 0 },
    regeneration: 0,
    yieldPercent: 0,
    farmPercent: 0,
  };
  for (const id of PERK_IDS) {
    const n = perkStacks(p, id);
    if (!n) continue;
    const e = PERKS[id].effect;
    if (e.kind === "percent") out.percent[e.stat] += e.percent * n;
    else if (e.kind === "flat") out[e.stat] += e.amount * n;
  }
  return out;
}
