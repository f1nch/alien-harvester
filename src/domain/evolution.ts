import { EVOLUTIONS, type EvolutionDef } from "../content/evolution";
import type { ProgressState } from "./progress";
import { allMet, evaluate, payCost, type Requirement, type Requirements } from "./requirements";

/** The next evolution available to this player, or null at the final form. */
export function nextEvolution(p: ProgressState): EvolutionDef | null {
  return EVOLUTIONS[p.evolution] ?? null;
}

/** An evolution's requirements here: its quest gate only applies on the facility floor (depth 0), where those quests live. */
function requirementsAt(p: ProgressState, def: EvolutionDef): Requirements {
  if (p.depth === 0 || !def.requirements.quests) return def.requirements;
  const { quests: _facilityOnly, ...rest } = def.requirements;
  return rest;
}

export function evolutionRequirements(p: ProgressState): Requirement[] {
  const next = nextEvolution(p);
  return next ? evaluate(p, requirementsAt(p, next)) : [];
}

export type EvolveResult = { ok: true; tier: number } | { ok: false; reason: "final" | "requirements" };

/**
 * One transaction: the cost is deducted and the tier raised together, or
 * nothing changes. XP levels never trigger this on their own.
 */
export function evolve(p: ProgressState): EvolveResult {
  const next = nextEvolution(p);
  if (!next) return { ok: false, reason: "final" };
  const reqs = requirementsAt(p, next);
  if (!allMet(p, reqs)) return { ok: false, reason: "requirements" };
  payCost(p, reqs);
  p.evolution = next.tier;
  return { ok: true, tier: next.tier };
}
