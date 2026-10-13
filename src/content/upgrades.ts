import type { Currency } from "./currencies";

export type UpgradeId =
  | "capturePower"
  | "cargoCapacity"
  | "captureRadius"
  | "moveSpeed"
  | "tentacles"
  | "maxHealth"
  | "regeneration"
  | "resourceYield";

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  unit: string;
  base: number;
  perLevel: number;
  currency: Currency;
  /** Tuned cost for buying level i+1, across every evolution tier. */
  costs: readonly number[];
  /** Level cap at each evolution tier (index = tier). Evolving raises the cap. */
  capByTier: readonly number[];
}

// Costs are provisional, aimed at an upgrade every 1–4 minutes early on
// (one cargo run of workers banks roughly 30 biomass). Levels past the
// tier-0 cap only become purchasable after evolving.
export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  capturePower: {
    id: "capturePower",
    name: "Capture power",
    unit: "/s",
    base: 10,
    perLevel: 3,
    currency: "biomass",
    costs: [15, 35, 65, 110, 170, 250, 350, 480, 650, 850, 1100, 1400],
    capByTier: [8, 12],
  },
  cargoCapacity: {
    id: "cargoCapacity",
    name: "Cargo capacity",
    unit: "",
    base: 20,
    perLevel: 8,
    currency: "biomass",
    costs: [20, 45, 80, 130, 195, 280, 390, 520, 700, 900, 1150, 1450],
    capByTier: [8, 12],
  },
  captureRadius: {
    id: "captureRadius",
    name: "Capture radius",
    unit: "m",
    base: 1.9,
    perLevel: 0.3,
    currency: "biomass",
    costs: [30, 75, 150, 260, 400, 600, 850],
    capByTier: [5, 7],
  },
  moveSpeed: {
    id: "moveSpeed",
    name: "Movement speed",
    unit: "m/s",
    base: 3,
    perLevel: 0.3,
    currency: "biomass",
    costs: [25, 60, 120, 210, 330, 500, 700],
    capByTier: [5, 7],
  },
  // Milestone-style: few, expensive levels. Displayed value includes evolution bonuses.
  tentacles: {
    id: "tentacles",
    name: "Tentacles",
    unit: "",
    base: 2,
    perLevel: 1,
    currency: "genetic",
    costs: [25, 70, 140],
    capByTier: [1, 3],
  },
  maxHealth: {
    id: "maxHealth",
    name: "Maximum health",
    unit: "",
    base: 100,
    perLevel: 20,
    currency: "biomass",
    costs: [40, 90, 160, 250, 360, 500, 680, 900],
    capByTier: [5, 8],
  },
  regeneration: {
    id: "regeneration",
    name: "Regeneration",
    unit: "/s",
    base: 2,
    perLevel: 1,
    currency: "biomass",
    costs: [50, 110, 190, 290, 420, 600],
    capByTier: [4, 6],
  },
  // Percent of each drop's reward that is banked. Applied once, at deposit.
  resourceYield: {
    id: "resourceYield",
    name: "Resource yield",
    unit: "%",
    base: 100,
    perLevel: 10,
    currency: "genetic",
    costs: [20, 45, 80, 130, 200],
    capByTier: [3, 5],
  },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
