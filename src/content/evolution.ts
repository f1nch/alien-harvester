import type { Requirements } from "../domain/requirements";

export interface EvolutionDef {
  /** Tier reached by this evolution (the starting form is tier 0). */
  tier: number;
  name: string;
  description: string;
  requirements: Requirements;
  /** Extra tentacles granted at this tier, on top of the base count. */
  tentacleBonus: number;
}

/** Hand-made evolutions. Index i evolves tier i into tier i + 1. */
export const EVOLUTIONS: readonly EvolutionDef[] = [
  {
    tier: 1,
    name: "Stalker form",
    description: "A larger, spined body with a third capture tentacle. Raises every mutation cap.",
    requirements: {
      quests: ["q-genetic"],
      mutationLevels: 10,
      cost: { genetic: 30, biomass: 150 },
    },
    tentacleBonus: 1,
  },
];

/**
 * Endless evolution (docs/EXPANSION_DESIGN.md, Phase C): each tier past the hand-made
 * ones needs the floor before it reached, genetic material and alloy, and more mutation
 * levels. Costs grow per tier at the rate income grows per floor, so each tier takes
 * about as long as the one before. Built by domain/evolution#evolutionTo.
 */
export const ENDLESS = {
  geneticBase: 80,
  alloyBase: 10,
  costGrowth: 1.6,
  mutationBase: 22,
  mutationsPerTier: 12,
  /**
   * Per endless tier, added up (not compounded) onto the upgrade track's value:
   * evolving stays a clear step without running away from the per-depth scaling.
   */
  powerPercent: 25,
  healthPercent: 20,
  /** Hard cap on tentacles in total. Endless tiers only add the ones that always fit (domain/economy). */
  maxTentacles: 8,
} as const;

/** Names cycle past the list, with a numeral per lap. */
const ENDLESS_NAMES = ["Ravager form", "Devourer form", "Leviathan form", "Abyssal form"] as const;

/** Hand-made tiers plus one per floor: tier t (t ≥ 2) needs depth t − 1, and depth stops at 300. */
export const MAX_TIER = 301;

/** How many endless tiers (past the hand-made ones) a form has. */
export function endlessTiers(tier: number): number {
  return Math.max(0, tier - EVOLUTIONS.length);
}

const ROMAN: Array<[number, string]> = [[100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

function numeral(n: number): string {
  let out = "";
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

export function formName(tier: number): string {
  if (tier === 0) return "Larval form";
  const made = EVOLUTIONS[tier - 1];
  if (made) return made.name;
  const i = tier - EVOLUTIONS.length - 1;
  const lap = Math.floor(i / ENDLESS_NAMES.length);
  const name = ENDLESS_NAMES[i % ENDLESS_NAMES.length]!;
  return lap === 0 ? name : `${name} ${numeral(lap + 1)}`;
}

export const FORM_NAMES: readonly string[] = Array.from({ length: MAX_TIER + 1 }, (_, t) => formName(t));
