import type { Reward } from "./currencies";

export type TargetTypeId = "worker" | "runner" | "technician";

export type TargetBehavior = "wander" | "flee";

export interface TargetDef {
  id: TargetTypeId;
  name: string;
  behavior: TargetBehavior;
  /** Capture work required; progress rate is capturePower / resistance. */
  resistance: number;
  /** Cargo units occupied. Independent of payout. */
  weight: number;
  reward: Reward;
  xp: number;
  /** Wander speed in metres/second. */
  speed: number;
  /** Speed while fleeing the player (flee behaviour only). */
  fleeSpeed?: number;
  /** Distance at which a fleeing target notices the player. */
  fleeRadius?: number;
  respawnSeconds: number;
}

export const TARGETS: Record<TargetTypeId, TargetDef> = {
  worker: {
    id: "worker",
    name: "Worker",
    behavior: "wander",
    resistance: 20,
    weight: 2,
    reward: { biomass: 3 },
    xp: 5,
    speed: 0.9,
    respawnSeconds: 7,
  },
  runner: {
    id: "runner",
    name: "Runner",
    behavior: "flee",
    resistance: 24,
    weight: 2,
    reward: { biomass: 6 },
    xp: 9,
    speed: 1.1,
    fleeSpeed: 2.5,
    fleeRadius: 4,
    respawnSeconds: 9,
  },
  technician: {
    id: "technician",
    name: "Technician",
    behavior: "wander",
    resistance: 40,
    weight: 3,
    reward: { biomass: 2, genetic: 2 },
    xp: 12,
    speed: 0.7,
    respawnSeconds: 12,
  },
};

export function isTargetType(id: unknown): id is TargetTypeId {
  return typeof id === "string" && Object.hasOwn(TARGETS, id);
}
