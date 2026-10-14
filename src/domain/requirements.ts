import { CURRENCIES, CURRENCY_LABEL, roundCents, type Reward } from "../content/currencies";
import { currentBiome } from "./biome";
import { levelForXp } from "./levels";
import type { ProgressState } from "./progress";
import { isDone } from "./quests";

/** Shared gate used by doors and evolution. */
export interface Requirements {
  level?: number;
  /** Floors cleared (endless evolution tiers need the floor before them reached). */
  depth?: number;
  /** Quest IDs that must be complete. */
  quests?: string[];
  /** Lifetime mutation (upgrade) levels bought; a respec does not reduce it. */
  mutationLevels?: number;
  /** Deducted only when everything is met, in the same transaction. */
  cost?: Reward;
}

export interface Requirement {
  label: string;
  met: boolean;
  /** e.g. "3 / 5" or "120 / 250". */
  progress: string;
}

/** Amounts past a million read as e.g. "1.1e+63" rather than float noise. */
export function amountText(n: number): string {
  return n < 1e6 ? String(Math.round(n * 100) / 100) : String(Number(n.toPrecision(3)));
}

export function totalMutationLevels(p: ProgressState): number {
  return p.mutationsBought;
}

/** Every requirement with its current progress, for UI cards. */
export function evaluate(p: ProgressState, r: Requirements): Requirement[] {
  const out: Requirement[] = [];
  if (r.level !== undefined) {
    const level = levelForXp(p.xp);
    out.push({ label: `Reach level ${r.level}`, met: level >= r.level, progress: `Lv ${level} / ${r.level}` });
  }
  if (r.depth !== undefined) {
    out.push({ label: `Reach depth ${r.depth}`, met: p.depth >= r.depth, progress: `Depth ${p.depth} / ${r.depth}` });
  }
  for (const id of r.quests ?? []) {
    const q = currentBiome(p).questById.get(id);
    const met = isDone(p, id);
    out.push({ label: q ? `Quest: ${q.title}` : id, met, progress: met ? "Done" : "Not done" });
  }
  if (r.mutationLevels !== undefined) {
    const n = totalMutationLevels(p);
    out.push({
      label: `Buy ${r.mutationLevels} mutation levels`,
      met: n >= r.mutationLevels,
      progress: `${Math.min(n, r.mutationLevels)} / ${r.mutationLevels}`,
    });
  }
  for (const c of CURRENCIES) {
    const cost = r.cost?.[c];
    if (!cost) continue;
    const have = p.banked[c];
    out.push({
      label: `Pay ${amountText(cost)} ${CURRENCY_LABEL[c].toLowerCase()}`,
      met: have >= cost,
      progress: `${amountText(Math.floor(Math.min(have, cost)))} / ${amountText(cost)}`,
    });
  }
  return out;
}

export function allMet(p: ProgressState, r: Requirements): boolean {
  return evaluate(p, r).every((req) => req.met);
}

/** Deduct the cost. Callers must check allMet first, in the same synchronous step. */
export function payCost(p: ProgressState, r: Requirements): void {
  for (const c of CURRENCIES) {
    const cost = r.cost?.[c];
    if (cost) p.banked[c] = roundCents(p.banked[c] - cost);
  }
}
