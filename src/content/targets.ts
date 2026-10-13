import type { Reward } from "./currencies";

export type TargetTypeId = "worker";

export interface TargetDef {
  id: TargetTypeId;
  name: string;
  /** Capture work required; progress rate is capturePower / resistance. */
  resistance: number;
  /** Cargo units occupied. Independent of payout. */
  weight: number;
  reward: Reward;
  xp: number;
  /** Wander speed in metres/second. */
  speed: number;
  respawnSeconds: number;
}

export const TARGETS: Record<TargetTypeId, TargetDef> = {
  worker: {
    id: "worker",
    name: "Worker",
    resistance: 20,
    weight: 2,
    reward: { biomass: 3 },
    xp: 5,
    speed: 0.9,
    respawnSeconds: 7,
  },
};

export function isTargetType(id: unknown): id is TargetTypeId {
  return typeof id === "string" && Object.hasOwn(TARGETS, id);
}
