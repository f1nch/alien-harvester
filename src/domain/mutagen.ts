import { FRENZY, POD, PRIZED } from "../content/feeding";
import { MUTAGEN, type MutagenId } from "../content/mutagen";
import { roundCents } from "../content/currencies";
import { perkBonuses } from "./perks";
import type { ProgressState } from "./progress";

export function mutagenLevel(p: ProgressState, id: MutagenId): number {
  return p.mutagenLevels[id] ?? 0;
}

export function nextMutagenCost(p: ProgressState, id: MutagenId): number | null {
  return MUTAGEN[id].costs[mutagenLevel(p, id)] ?? null;
}

export type MutagenResult = { ok: true } | { ok: false; reason: "maxed" | "unaffordable" };

/** Atomic: the level rises and the mutagen is paid together, or nothing changes. */
export function buyMutagen(p: ProgressState, id: MutagenId): MutagenResult {
  const cost = nextMutagenCost(p, id);
  if (cost === null) return { ok: false, reason: "maxed" };
  if (p.banked.mutagen < cost) return { ok: false, reason: "unaffordable" };
  p.banked.mutagen = roundCents(p.banked.mutagen - cost);
  p.mutagenLevels[id] = mutagenLevel(p, id) + 1;
  return { ok: true };
}

/** The loop tuning after mutagen mutations and loop perks. */
export interface FeedingTuning {
  frenzySeconds: number;
  comboWindow: number;
  prizedInterval: number;
  boostChance: number;
  boostSeconds: number;
  cravingSlots: number;
}

export function feedingTuning(p: ProgressState): FeedingTuning {
  const lvl = (id: MutagenId) => mutagenLevel(p, id);
  const perk = perkBonuses(p).loop;
  return {
    frenzySeconds: FRENZY.seconds + lvl("frenzyTime") + perk.frenzySeconds,
    comboWindow: FRENZY.comboWindow + 0.75 * lvl("comboWindow") + perk.comboWindow,
    prizedInterval: PRIZED.interval - 12 * lvl("prizedRate"),
    boostChance: Math.min(1, POD.boostChance + 0.1 * lvl("podLuck") + perk.boostChance / 100),
    boostSeconds: POD.boostSeconds + 3 * lvl("podLuck"),
    cravingSlots: 3 + lvl("extraCraving"),
  };
}
