import type { Currency } from "./currencies";

export type UpgradeId = "capturePower" | "cargoCapacity" | "captureRadius" | "moveSpeed";

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  unit: string;
  base: number;
  perLevel: number;
  currency: Currency;
  /** Tuned cost for buying level i+1. Length is the level cap. */
  costs: readonly number[];
}

// Costs are provisional, aimed at an upgrade every 1–4 minutes early on
// (one cargo run of workers banks roughly 30 biomass).
export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  capturePower: {
    id: "capturePower",
    name: "Capture power",
    unit: "/s",
    base: 10,
    perLevel: 3,
    currency: "biomass",
    costs: [15, 35, 65, 110, 170, 250, 350, 480],
  },
  cargoCapacity: {
    id: "cargoCapacity",
    name: "Cargo capacity",
    unit: "",
    base: 20,
    perLevel: 8,
    currency: "biomass",
    costs: [20, 45, 80, 130, 195, 280, 390, 520],
  },
  captureRadius: {
    id: "captureRadius",
    name: "Capture radius",
    unit: "m",
    base: 1.9,
    perLevel: 0.3,
    currency: "biomass",
    costs: [30, 75, 150, 260, 400],
  },
  moveSpeed: {
    id: "moveSpeed",
    name: "Movement speed",
    unit: "m/s",
    base: 3,
    perLevel: 0.3,
    currency: "biomass",
    costs: [25, 60, 120, 210, 330],
  },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
