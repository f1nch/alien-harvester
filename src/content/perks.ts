import type { Currency } from "./currencies";

export type PerkId =
  | "cargo"
  | "power"
  | "speed"
  | "radius"
  | "health"
  | "regen"
  | "yield"
  | "biomassCache"
  | "geneSample"
  | "farm"
  | "frenzy"
  | "combo"
  | "bounty"
  | "pods"
  | "warmBlood";

/** Loop-feature tuning a perk can add to (summed with mutagen mutations in domain/mutagen#feedingTuning). */
export type LoopStat = "frenzySeconds" | "comboWindow" | "cravingMutagen" | "boostChance" | "chillResist";

export type PerkEffect =
  /** Percent bonus to a stat, added to other perks on the same stat (never compounded). */
  | { kind: "percent"; stat: "cargoCapacity" | "capturePower" | "moveSpeed" | "captureRadius" | "maxHealth"; percent: number }
  /** Flat bonus to a stat. */
  | { kind: "flat"; stat: "regeneration" | "yieldPercent" | "farmPercent"; amount: number }
  /** One-time grant, scaled by the level the choice was earned at. */
  | { kind: "grant"; currency: Currency; base: number; perLevel: number }
  /** Adds to a loop feature: seconds, mutagen per craving, or percent. */
  | { kind: "loop"; stat: LoopStat; amount: number };

export interface PerkDef {
  id: PerkId;
  name: string;
  icon: string;
  effect: PerkEffect;
  /** Maximum times this perk can be taken; null for repeatable one-time grants. */
  maxStacks: number | null;
  /** Only offered once the current floor has an open door (genetic material matters by then). */
  requiresDoor?: boolean;
  /** Only offered once the biomass vat is built. */
  requiresVat?: boolean;
  /** Only offered from this depth on (e.g. cold resistance once cold floors exist). */
  requiresDepth?: number;
}

/** Persistent IDs: saves reference them. */
export const PERKS: Record<PerkId, PerkDef> = {
  cargo: { id: "cargo", name: "Expanded hold", icon: "▣", effect: { kind: "percent", stat: "cargoCapacity", percent: 10 }, maxStacks: 3 },
  power: { id: "power", name: "Strong grip", icon: "✷", effect: { kind: "percent", stat: "capturePower", percent: 8 }, maxStacks: 3 },
  speed: { id: "speed", name: "Swift", icon: "➶", effect: { kind: "percent", stat: "moveSpeed", percent: 5 }, maxStacks: 3 },
  // Small cap to keep capture reach readable on a phone screen.
  radius: { id: "radius", name: "Long reach", icon: "◎", effect: { kind: "percent", stat: "captureRadius", percent: 5 }, maxStacks: 2 },
  health: { id: "health", name: "Tough hide", icon: "♥", effect: { kind: "percent", stat: "maxHealth", percent: 10 }, maxStacks: 3 },
  regen: { id: "regen", name: "Rapid mending", icon: "✚", effect: { kind: "flat", stat: "regeneration", amount: 1 }, maxStacks: 3 },
  yield: { id: "yield", name: "Efficient digestion", icon: "%", effect: { kind: "flat", stat: "yieldPercent", amount: 5 }, maxStacks: 2 },
  biomassCache: { id: "biomassCache", name: "Biomass cache", icon: "◆", effect: { kind: "grant", currency: "biomass", base: 30, perLevel: 15 }, maxStacks: null },
  geneSample: {
    id: "geneSample", name: "Gene sample", icon: "✦",
    effect: { kind: "grant", currency: "genetic", base: 5, perLevel: 3 }, maxStacks: null,
    requiresDoor: true,
  },
  farm: { id: "farm", name: "Fertile vats", icon: "⚗", effect: { kind: "flat", stat: "farmPercent", amount: 10 }, maxStacks: 3, requiresVat: true },
  // Phase C: perks for the loop features. They stack with the mutagen mutations.
  frenzy: { id: "frenzy", name: "Ravenous", icon: "✺", effect: { kind: "loop", stat: "frenzySeconds", amount: 1.5 }, maxStacks: 3 },
  combo: { id: "combo", name: "Quick jaws", icon: "⟳", effect: { kind: "loop", stat: "comboWindow", amount: 0.5 }, maxStacks: 3 },
  bounty: { id: "bounty", name: "Bounty hunter", icon: "☍", effect: { kind: "loop", stat: "cravingMutagen", amount: 1 }, maxStacks: 2 },
  pods: { id: "pods", name: "Lucky find", icon: "✧", effect: { kind: "loop", stat: "boostChance", amount: 10 }, maxStacks: 2 },
  warmBlood: {
    id: "warmBlood", name: "Warm blood", icon: "♨",
    effect: { kind: "loop", stat: "chillResist", amount: 10 }, maxStacks: 3,
    requiresDepth: 1,
  },
};

export const PERK_IDS = Object.keys(PERKS) as PerkId[];

export const CHOICES_PER_LEVEL = 3;

export function isPerkId(v: unknown): v is PerkId {
  return typeof v === "string" && Object.hasOwn(PERKS, v);
}
