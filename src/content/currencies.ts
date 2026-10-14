export const CURRENCIES = ["biomass", "genetic", "parts", "mutagen", "crystals", "alloy", "amber"] as const;
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
};

/**
 * Wallet amounts are kept to whole cents. Yield bonuses produce fractions, and
 * unrounded float sums (10.999…) would make exact-cost purchases unaffordable.
 */
export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

export function emptyWallet(): Wallet {
  return { biomass: 0, genetic: 0, parts: 0, mutagen: 0, crystals: 0, alloy: 0, amber: 0 };
}
