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
  | "geneSample";

export type PerkEffect =
  /** Percent bonus to a stat, added to other perks on the same stat (never compounded). */
  | { kind: "percent"; stat: "cargoCapacity" | "capturePower" | "moveSpeed" | "captureRadius" | "maxHealth"; percent: number }
  /** Flat bonus to a stat. */
  | { kind: "flat"; stat: "regeneration" | "yieldPercent"; amount: number }
  /** One-time grant, scaled by the level the choice was earned at. */
  | { kind: "grant"; currency: Currency; base: number; perLevel: number };

export interface PerkDef {
  id: PerkId;
  name: string;
  icon: string;
  effect: PerkEffect;
  /** Maximum times this perk can be taken; null for repeatable one-time grants. */
  maxStacks: number | null;
  /** Door that must be open before this perk can be offered. */
  requiresDoor?: string;
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
    requiresDoor: "door-service",
  },
};

export const PERK_IDS = Object.keys(PERKS) as PerkId[];

export const CHOICES_PER_LEVEL = 3;

export function isPerkId(v: unknown): v is PerkId {
  return typeof v === "string" && Object.hasOwn(PERKS, v);
}
