import type { Reward } from "./currencies";

export type TargetTypeId = "worker" | "runner" | "technician" | "guard" | "armoredGuard" | "boss";

export type TargetBehavior = "wander" | "flee" | "guard" | "boss";

/** Hostile behaviour tuning. Attacks are telegraphed: windup, then a strike that only lands if the player is still in range. */
export interface CombatDef {
  /** Notices the player within this distance (with line of sight). */
  detectRadius: number;
  /** Gives up and walks home when this far from its spawn point. */
  leashRadius: number;
  chaseSpeed: number;
  /** Strike reach, measured centre to centre. */
  attackRange: number;
  damage: number;
  windupSeconds: number;
  cooldownSeconds: number;
  /** Struggles toward its captor while held, so standing still while capturing is risky. */
  heldCreepSpeed: number;
}

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
  combat?: CombatDef;
  /** Several tentacles may hold it at once, stacking their capture power. */
  multiGrab?: boolean;
  /** Seconds for full capture progress to decay once out of reach (default 1). */
  captureDecaySeconds?: number;
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
  guard: {
    id: "guard",
    name: "Guard",
    behavior: "guard",
    resistance: 50,
    weight: 3,
    reward: { biomass: 9, genetic: 1 },
    xp: 18,
    speed: 0.8,
    combat: {
      detectRadius: 6,
      leashRadius: 9,
      chaseSpeed: 1.9,
      attackRange: 1.7,
      damage: 12,
      windupSeconds: 0.6,
      cooldownSeconds: 2,
      heldCreepSpeed: 0.4,
    },
    respawnSeconds: 15,
  },
  armoredGuard: {
    id: "armoredGuard",
    name: "Armored guard",
    behavior: "guard",
    resistance: 95,
    weight: 4,
    reward: { biomass: 8, parts: 1 },
    xp: 30,
    speed: 0.6,
    combat: {
      detectRadius: 5,
      leashRadius: 8,
      chaseSpeed: 1.3,
      attackRange: 1.7,
      damage: 22,
      windupSeconds: 0.9,
      cooldownSeconds: 2.6,
      heldCreepSpeed: 0.25,
    },
    respawnSeconds: 22,
  },
  // The reactor warden. Weightless so it never competes for cargo space; one kill is
  // enough for progression, and it returns after a while for optional farming.
  boss: {
    id: "boss",
    name: "Reactor warden",
    behavior: "boss",
    resistance: 900,
    weight: 0,
    reward: { parts: 5, biomass: 120, genetic: 10 },
    xp: 400,
    speed: 1.1,
    multiGrab: true,
    captureDecaySeconds: 20,
    respawnSeconds: 180,
  },
};

export function isTargetType(id: unknown): id is TargetTypeId {
  return typeof id === "string" && Object.hasOwn(TARGETS, id);
}
