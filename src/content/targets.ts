import { WARDEN, type BossTuning } from "./reactor";
import type { Reward } from "./currencies";

export type TargetTypeId =
  | "worker" | "runner" | "technician" | "guard" | "armoredGuard" | "boss" | "pod"
  // Cryo labs
  | "cryoScientist" | "frostRunner" | "patrolDrone" | "cryoSentinel";

/** "static": never moves (supply pods). */
export type TargetBehavior = "wander" | "flee" | "guard" | "boss" | "static";

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
  /** Boss fight numbers; the reactor warden's when absent. */
  bossTuning?: BossTuning;
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
  // --- Cryo labs (floor B2). Numbers are depth-0 equivalents; the floor's depth scales them.
  // Cryo scientist: slow, padded against the cold, carrying crystal samples.
  cryoScientist: {
    id: "cryoScientist",
    name: "Cryo scientist",
    behavior: "wander",
    resistance: 34,
    weight: 3,
    reward: { biomass: 3, crystals: 2 },
    xp: 13,
    speed: 0.7,
    respawnSeconds: 12,
  },
  // Frost runner: quick and skittish, at home on the ice.
  frostRunner: {
    id: "frostRunner",
    name: "Frost runner",
    behavior: "flee",
    resistance: 28,
    weight: 2,
    reward: { biomass: 7, crystals: 1 },
    xp: 11,
    speed: 1.2,
    fleeSpeed: 2.9,
    fleeRadius: 4.5,
    respawnSeconds: 10,
  },
  // Patrol drone: a hovering security unit with a telegraphed shock jab.
  patrolDrone: {
    id: "patrolDrone",
    name: "Patrol drone",
    behavior: "guard",
    resistance: 60,
    weight: 3,
    reward: { biomass: 8, parts: 1, crystals: 1 },
    xp: 22,
    speed: 1.2,
    combat: {
      detectRadius: 7,
      leashRadius: 10,
      chaseSpeed: 2.4,
      attackRange: 1.8,
      damage: 14,
      windupSeconds: 0.5,
      cooldownSeconds: 1.8,
      heldCreepSpeed: 0.6,
    },
    respawnSeconds: 16,
  },
  // The cryo sentinel guards the frozen core. Its slam is a freezing pulse that chills.
  cryoSentinel: {
    id: "cryoSentinel",
    name: "Cryo sentinel",
    behavior: "boss",
    resistance: 1100,
    weight: 0,
    reward: { crystals: 20, biomass: 140, genetic: 12, parts: 4 },
    xp: 450,
    speed: 1,
    multiGrab: true,
    captureDecaySeconds: 20,
    respawnSeconds: 180,
    bossTuning: {
      ...WARDEN,
      slamTrigger: 3.4,
      slamRadius: 3.8,
      slamDamage: 24,
      slamWindup: 1.2,
      slamChill: 0.6,
      chargeWindup: 1.4,
      chargeSpeed: 8,
      chargeDamage: 30,
      walkSpeed: 1,
    },
  },
  // Supply pod: a crate of stolen stock. Quick to crack open, light, and it may hold a
  // short power-up (content/feeding.ts). Not a creature, so the bestiary ignores it.
  pod: {
    id: "pod",
    name: "Supply pod",
    behavior: "static",
    resistance: 12,
    weight: 1,
    reward: { biomass: 8, genetic: 1 },
    xp: 4,
    speed: 0,
    respawnSeconds: 120,
  },
};

export function isTargetType(id: unknown): id is TargetTypeId {
  return typeof id === "string" && Object.hasOwn(TARGETS, id);
}
