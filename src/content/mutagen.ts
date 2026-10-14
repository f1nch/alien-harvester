/**
 * Mutagen mutations: small capped tracks bought with mutagen (from cravings, prized
 * specimens and bestiary milestones). They tune the loop features, never core stats,
 * and a respec doesn't refund them.
 */
export type MutagenId = "frenzyTime" | "comboWindow" | "prizedRate" | "podLuck" | "extraCraving";

export interface MutagenDef {
  id: MutagenId;
  name: string;
  /** What one level does, for the panel. */
  perLevel: string;
  costs: readonly number[];
}

export const MUTAGEN: Record<MutagenId, MutagenDef> = {
  frenzyTime: { id: "frenzyTime", name: "Gorging", perLevel: "+1 s feeding frenzy", costs: [4, 8, 14, 22] },
  comboWindow: { id: "comboWindow", name: "Appetite", perLevel: "+0.75 s to keep a combo going", costs: [4, 8, 14, 22] },
  prizedRate: { id: "prizedRate", name: "Keen scent", perLevel: "Prized specimens 12 s sooner", costs: [5, 10, 16, 25] },
  podLuck: { id: "podLuck", name: "Scavenger", perLevel: "+10% power-up chance, +3 s power-ups", costs: [5, 10, 16, 25] },
  extraCraving: { id: "extraCraving", name: "Hunger", perLevel: "A fourth craving", costs: [25] },
};

export const MUTAGEN_IDS = Object.keys(MUTAGEN) as MutagenId[];

export function isMutagenId(id: unknown): id is MutagenId {
  return typeof id === "string" && Object.hasOwn(MUTAGEN, id);
}
