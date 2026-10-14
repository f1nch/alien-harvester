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

export type StructureId = typeof VAT.id | typeof DRONE.id;
