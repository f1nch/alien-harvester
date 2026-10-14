import type { Reward } from "./currencies";

export interface VatLevel {
  /** Simulation seconds to produce one batch. */
  batchSeconds: number;
  /** Batches held before production stops. */
  storage: number;
  /** Cost to reach this level (level 1 is the build cost). */
  cost: Reward;
}

/** Foreground production: only simulation ticks advance it, never wall-clock time. */
export const VAT = {
  id: "vat",
  name: "Biomass vat",
  /** Solid footprint once built. */
  halfSize: 0.7,
  /** Player collects batches within this distance. */
  collectRadius: 2.2,
  /** Seconds per batch moved into the player's cargo while in range. */
  collectInterval: 0.25,
  levels: [
    { batchSeconds: 12, storage: 6, cost: { biomass: 120, genetic: 10 } },
    { batchSeconds: 9, storage: 8, cost: { biomass: 220 } },
    { batchSeconds: 7, storage: 10, cost: { biomass: 380, genetic: 15 } },
  ] satisfies VatLevel[],
  /** One batch as a cargo drop. */
  batch: { weight: 2, reward: { biomass: 5 } satisfies Reward },
} as const;

export interface DroneLevel {
  capacity: number;
  cost: Reward;
}

/** Delivery helper: moves existing cargo to the base. It never creates resources. */
export const DRONE = {
  id: "drone",
  name: "Delivery drone",
  speed: 3.6,
  radius: 0.4,
  /** Transfers happen within this distance of the player or the vat. */
  reach: 1.6,
  /** Cargo units moved per second during a transfer. */
  transferRate: 20,
  levels: [
    { capacity: 10, cost: { biomass: 150, genetic: 15 } },
    { capacity: 15, cost: { biomass: 120 } },
    { capacity: 20, cost: { biomass: 220 } },
    { capacity: 25, cost: { biomass: 350 } },
  ] satisfies DroneLevel[],
} as const;

export interface RefineryLevel extends VatLevel {}

/**
 * Turns banked biomass and machine parts into alloy, one batch at a time, while you play.
 * Each batch pays its input from the bank when it starts; with too little banked it waits.
 * Finished batches are collected like the vat's (as cargo, banked at a pad).
 */
export const REFINERY = {
  id: "refinery",
  name: "Refinery",
  halfSize: 0.8,
  collectRadius: 2.2,
  collectInterval: 0.25,
  levels: [
    { batchSeconds: 20, storage: 4, cost: { biomass: 300, parts: 15, crystals: 25 } },
    { batchSeconds: 15, storage: 6, cost: { biomass: 450, crystals: 40 } },
    { batchSeconds: 11, storage: 8, cost: { biomass: 700, parts: 30, crystals: 60 } },
  ] satisfies RefineryLevel[],
  /** Paid from the bank as each batch starts (scales with depth, like payouts). */
  input: { biomass: 30, parts: 2 } satisfies Reward,
  batch: { weight: 2, reward: { alloy: 1 } satisfies Reward },
} as const;

export interface CatcherLevel {
  /** Cargo it holds before flying home. */
  capacity: number;
  /** Its grip, as a percent of your capture power. */
  powerPercent: number;
  cost: Reward;
}

/**
 * Hunting helper: catches creatures near you with a share of your capture power and
 * carries them to the nearest pad. Captures make cargo exactly as yours do.
 */
export const CATCHER = {
  id: "catcher",
  name: "Catcher",
  speed: 4.2,
  radius: 0.4,
  /** Grips a creature within this distance. */
  reach: 1.4,
  /** Hunts creatures within this distance of you. */
  huntRadius: 7,
  /** Seconds for full progress to fade once its prey slips away. */
  decaySeconds: 1.5,
  levels: [
    { capacity: 4, powerPercent: 30, cost: { biomass: 250, crystals: 20 } },
    { capacity: 6, powerPercent: 35, cost: { biomass: 400, crystals: 35 } },
    { capacity: 8, powerPercent: 40, cost: { biomass: 650, crystals: 55 } },
  ] satisfies CatcherLevel[],
} as const;

/** A second deposit pad, built once per floor at that floor's site. Warm in a cold room. */
export const OUTPOST = {
  id: "outpost",
  name: "Forward base",
  radius: 2,
} as const;

export type StructureId = typeof VAT.id | typeof DRONE.id | typeof REFINERY.id | typeof CATCHER.id | typeof OUTPOST.id;
