import type { Currency } from "./currencies";

export type UpgradeId = "capturePower" | "cargoCapacity" | "captureRadius" | "moveSpeed";

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
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
