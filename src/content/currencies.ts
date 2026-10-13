export const CURRENCIES = ["biomass", "genetic", "parts"] as const;
export type Currency = (typeof CURRENCIES)[number];
export type Wallet = Record<Currency, number>;
export type Reward = Partial<Wallet>;

export const CURRENCY_LABEL: Record<Currency, string> = {
  biomass: "Biomass",
  genetic: "Genetic material",
  parts: "Reactor parts",
};

export function emptyWallet(): Wallet {
  return { biomass: 0, genetic: 0, parts: 0 };
}
