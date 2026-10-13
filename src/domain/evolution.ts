import { EVOLUTIONS, type EvolutionDef } from "../content/evolution";
import type { ProgressState } from "./progress";
import { allMet, evaluate, payCost, type Requirement } from "./requirements";

/** The next evolution available to this player, or null at the final form. */
export function nextEvolution(p: ProgressState): EvolutionDef | null {
  return EVOLUTIONS[p.evolution] ?? null;
}

export function evolutionRequirements(p: ProgressState): Requirement[] {
  const next = nextEvolution(p);
  return next ? evaluate(p, next.requirements) : [];
}

export type EvolveResult = { ok: true; tier: number } | { ok: false; reason: "final" | "requirements" };

/**
 * One transaction: the cost is deducted and the tier raised together, or
 * nothing changes. XP levels never trigger this on their own.
 */
export function evolve(p: ProgressState): EvolveResult {
  const next = nextEvolution(p);
  if (!next) return { ok: false, reason: "final" };
  if (!allMet(p, next.requirements)) return { ok: false, reason: "requirements" };
  payCost(p, next.requirements);
  p.evolution = next.tier;
  return { ok: true, tier: next.tier };
}
