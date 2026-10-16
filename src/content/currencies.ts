export const CURRENCIES = ["biomass", "genetic", "parts", "mutagen", "crystals", "alloy", "amber", "shards", "pearls", "glass", "spores", "moonstone", "bogiron", "silk"] as const;
export type Currency = (typeof CURRENCIES)[number];
export type Wallet = Record<Currency, number>;
export type Reward = Partial<Wallet>;

export const CURRENCY_LABEL: Record<Currency, string> = {
  biomass: "Biomass",
  genetic: "Genetic material",
  parts: "Machine parts",
  mutagen: "Mutagen",
  crystals: "Cryo crystals",
  alloy: "Alloy",
  amber: "Hive amber",
  shards: "Relic shards",
  pearls: "Tide pearls",
  glass: "Ember glass",
  spores: "Glow spores",
  moonstone: "Moonstone",
  bogiron: "Bog iron",
  silk: "Sky silk",
};

/** The later portal worlds' currencies (Pyrra to Aether): HUD chips show each where it's paid. */
export const LATE_CURRENCIES = ["glass", "spores", "moonstone", "bogiron", "silk"] as const satisfies readonly Currency[];

/**
 * Wallet amounts are kept to whole cents. Yield bonuses produce fractions, and
 * unrounded float sums (10.999…) would make exact-cost purchases unaffordable.
 */
export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

export function emptyWallet(): Wallet {
  return { biomass: 0, genetic: 0, parts: 0, mutagen: 0, crystals: 0, alloy: 0, amber: 0, shards: 0, pearls: 0, glass: 0, spores: 0, moonstone: 0, bogiron: 0, silk: 0 };
}
export type LateCurrency = (typeof LATE_CURRENCIES)[number];
