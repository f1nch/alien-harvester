import { ENDLESS, EVOLUTIONS, endlessTiers, formName, MAX_TIER, type EvolutionDef } from "../content/evolution";
import { tidy } from "./biome";
import { ENDLESS_TENTACLE_TIERS } from "./economy";
import type { ProgressState } from "./progress";
import { allMet, evaluate, payCost, type Requirement, type Requirements } from "./requirements";

/** The evolution that reaches `tier`: a hand-made one, or an endless tier built from ENDLESS. */
export function evolutionTo(tier: number): EvolutionDef | null {
  if (!Number.isInteger(tier) || tier < 1 || tier > MAX_TIER) return null;
  const made = EVOLUTIONS[tier - 1];
  if (made) return made;
  const n = endlessTiers(tier) - 1; // 0 for the first endless tier
  const grow = ENDLESS.costGrowth ** n;
  const tentacle = endlessTiers(tier) <= ENDLESS_TENTACLE_TIERS ? 1 : 0;
  return {
    tier,
    name: formName(tier),
    description: `Bigger and spikier: +${ENDLESS.powerPercent}% capture power, +${ENDLESS.healthPercent}% maximum health, +2 cargo levels${tentacle ? " and a tentacle" : ""}.`,
    requirements: {
      depth: tier - 1,
      mutationLevels: ENDLESS.mutationBase + ENDLESS.mutationsPerTier * n,
      cost: { genetic: tidy(ENDLESS.geneticBase * grow), alloy: tidy(ENDLESS.alloyBase * grow) },
    },
    tentacleBonus: tentacle,
  };
}

/** The next evolution available to this player, or null at the final form. */
export function nextEvolution(p: ProgressState): EvolutionDef | null {
  return evolutionTo(p.evolution + 1);
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
