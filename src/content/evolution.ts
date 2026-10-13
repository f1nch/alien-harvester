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

/** Index i evolves tier i into tier i + 1. */
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

export const FORM_NAMES: readonly string[] = ["Larval form", ...EVOLUTIONS.map((e) => e.name)];

export const MAX_TIER = EVOLUTIONS.length;
