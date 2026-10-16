import { WARDEN, type BossTuning } from "./reactor";
import type { Reward } from "./currencies";
import { LATE_TARGETS, type LateTargetId } from "./lateTargets";

export type TargetTypeId =
  | "worker" | "runner" | "technician" | "guard" | "armoredGuard" | "boss" | "pod"
  // Cryo labs
  | "cryoScientist" | "frostRunner" | "patrolDrone" | "cryoSentinel"
  // Specimen vaults
  | "handler" | "lurker" | "chimera" | "specimenTank" | "alphaSpecimen"
  // Hangar
  | "dockhand" | "mechanic" | "loaderMech" | "fuelCell" | "overseerMech"
  // Vesh (portal world 1)
  | "hiveForager" | "skitter" | "hiveWarrior" | "broodSac" | "hiveQueen"
  // Ashkar (portal world 2)
  | "sandSkink" | "duneRunner" | "relicGolem" | "burialUrn" | "sandWyrm"
  // Maren (portal world 3)
  | "reefCrab" | "skimmer" | "lancerEel" | "pearlClam" | "tideKraken"
  // Pyrra, Thessa, Kharon, Gloam and Aether (portal worlds 4 to 8): content/lateTargets.ts
  | LateTargetId;

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
  /**
   * Loot, not a creature (supply pods): may hold a power-up, and skips combos, cravings
   * and the bestiary. Static creatures (specimen tanks) are not loot.
   */
  loot?: boolean;
  /**
   * Drawn as another species' model, recoloured: the later worlds' kin of earlier creatures.
   * `size` scales the whole model.
   */
  appearance?: { like: TargetTypeId; tint: [number, number, number]; glow?: [number, number, number]; size?: number };
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
      special: {
        kind: "icefall", label: "Icefall incoming", minRange: 0, maxRange: 12, cooldown: 7, cast: 0.8,
        count: 4, radius: 1.6, spread: 2.6, delay: 1.3, stagger: 0.25, damage: 20, chill: 0.35,
      },
    },
  },
  // --- Specimen vaults (floor B3). Depth-0 equivalents, like Cryo labs.
  // Handler: a keeper in a padded suit with a catch-pole. Steady genetic material.
  handler: {
    id: "handler",
    name: "Handler",
    behavior: "wander",
    resistance: 36,
    weight: 3,
    reward: { biomass: 5, genetic: 2 },
    xp: 15,
    speed: 0.9,
    respawnSeconds: 12,
  },
  // Lurker: an escaped experiment, quick and shy, slipping between the tanks.
  lurker: {
    id: "lurker",
    name: "Lurker",
    behavior: "flee",
    resistance: 28,
    weight: 2,
    reward: { biomass: 6, genetic: 2 },
    xp: 13,
    speed: 1.3,
    fleeSpeed: 3.1,
    fleeRadius: 5,
    respawnSeconds: 10,
  },
  // Chimera: a failed hybrid that fights back with a lunging bite.
  chimera: {
    id: "chimera",
    name: "Chimera",
    behavior: "guard",
    resistance: 62,
    weight: 4,
    reward: { biomass: 10, genetic: 3, parts: 1 },
    xp: 26,
    speed: 1.1,
    combat: {
      detectRadius: 7.5,
      leashRadius: 10,
      chaseSpeed: 2.6,
      attackRange: 1.7,
      damage: 17,
      windupSeconds: 0.55,
      cooldownSeconds: 1.7,
      heldCreepSpeed: 0.7,
    },
    respawnSeconds: 18,
  },
  // Specimen tank: a sealed tank with something rich in genes floating inside. Heavy, slow
  // to crack, and it never moves.
  specimenTank: {
    id: "specimenTank",
    name: "Specimen tank",
    behavior: "static",
    resistance: 80,
    weight: 4,
    reward: { biomass: 6, genetic: 7 },
    xp: 20,
    speed: 0,
    respawnSeconds: 45,
  },
  // The alpha specimen: the facility's prize experiment. Fast, with quick charges.
  alphaSpecimen: {
    id: "alphaSpecimen",
    name: "Alpha specimen",
    behavior: "boss",
    resistance: 1250,
    weight: 0,
    reward: { genetic: 35, biomass: 160, parts: 5 },
    xp: 500,
    speed: 1.2,
    multiGrab: true,
    captureDecaySeconds: 20,
    respawnSeconds: 180,
    bossTuning: {
      ...WARDEN,
      slamDamage: 24,
      chargeWindup: 1.25,
      chargeSpeed: 10,
      chargeDamage: 32,
      chargeCooldown: 3.6,
      walkSpeed: 1.3,
      special: {
        kind: "frenzy", label: "Frenzy: it won't stop", minRange: 2, maxRange: 13, cooldown: 9, cast: 1.25,
        extraCharges: 2, windup: 0.8, distance: 6.5,
      },
    },
  },
  // --- Hangar (floor B4). Depth-0 equivalents. Machine parts are the floor's currency.
  // Dockhand: ground crew in hi-vis, hauling salvage.
  dockhand: {
    id: "dockhand",
    name: "Dockhand",
    behavior: "wander",
    resistance: 30,
    weight: 2,
    reward: { biomass: 5, parts: 1 },
    xp: 12,
    speed: 0.9,
    respawnSeconds: 10,
  },
  // Mechanic: quick and wary, pockets full of spare parts.
  mechanic: {
    id: "mechanic",
    name: "Mechanic",
    behavior: "flee",
    resistance: 28,
    weight: 2,
    reward: { biomass: 4, parts: 2 },
    xp: 13,
    speed: 1.2,
    fleeSpeed: 3,
    fleeRadius: 4.8,
    respawnSeconds: 10,
  },
  // Loader mech: a lifting exoskeleton that swings its forks at you. Heavy and slow.
  loaderMech: {
    id: "loaderMech",
    name: "Loader mech",
    behavior: "guard",
    resistance: 66,
    weight: 4,
    reward: { biomass: 10, parts: 3 },
    xp: 26,
    speed: 0.9,
    combat: {
      detectRadius: 7,
      leashRadius: 10,
      chaseSpeed: 2.2,
      attackRange: 2,
      damage: 19,
      windupSeconds: 0.7,
      cooldownSeconds: 2,
      heldCreepSpeed: 0.5,
    },
    respawnSeconds: 18,
  },
  // Fuel cell: a sealed canister of starship fuel. It never moves; crack it open for parts.
  fuelCell: {
    id: "fuelCell",
    name: "Fuel cell",
    behavior: "static",
    resistance: 70,
    weight: 3,
    reward: { biomass: 6, parts: 4, alloy: 1 },
    xp: 18,
    speed: 0,
    respawnSeconds: 45,
  },
  // The overseer mech guards the portal chamber: slow, armoured, with a long, heavy charge.
  overseerMech: {
    id: "overseerMech",
    name: "Overseer mech",
    behavior: "boss",
    resistance: 1350,
    weight: 0,
    reward: { parts: 16, biomass: 180, genetic: 14, alloy: 3 },
    xp: 550,
    speed: 0.9,
    multiGrab: true,
    captureDecaySeconds: 20,
    respawnSeconds: 180,
    bossTuning: {
      ...WARDEN,
      slamRadius: 3.6,
      slamDamage: 30,
      slamWindup: 1.2,
      chargeWindup: 1.5,
      chargeSpeed: 9.5,
      chargeDistance: 14,
      chargeDamage: 38,
      walkSpeed: 0.95,
      special: {
        kind: "barrage", label: "Barrage incoming", minRange: 0, maxRange: 16, cooldown: 7.5, cast: 1,
        count: 7, radius: 1.5, spacing: 2, delay: 1.1, stagger: 0.22, damage: 26,
      },
    },
  },
  // --- Vesh, the hive jungle (portal world 1). Depth-0 equivalents. Hive amber is its currency.
  // Hive forager: a six-legged worker carrying amber back to the hive.
  hiveForager: {
    id: "hiveForager",
    name: "Hive forager",
    behavior: "wander",
    resistance: 34,
    weight: 2,
    reward: { biomass: 5, amber: 1 },
    xp: 13,
    speed: 0.9,
    respawnSeconds: 10,
  },
  // Skitter: a small, quick swarmer. Light to carry and quick to catch, if you can corner it.
  skitter: {
    id: "skitter",
    name: "Skitter",
    behavior: "flee",
    resistance: 18,
    weight: 1,
    reward: { biomass: 3, amber: 0.5 },
    xp: 8,
    speed: 1.6,
    fleeSpeed: 3.4,
    fleeRadius: 5,
    respawnSeconds: 7,
  },
  // Hive warrior: armoured, with scything forelimbs. Fights back.
  hiveWarrior: {
    id: "hiveWarrior",
    name: "Hive warrior",
    behavior: "guard",
    resistance: 70,
    weight: 4,
    reward: { biomass: 10, amber: 2, parts: 1 },
    xp: 27,
    speed: 1.1,
    combat: {
      detectRadius: 7.5,
      leashRadius: 10,
      chaseSpeed: 2.7,
      attackRange: 1.8,
      damage: 20,
      windupSeconds: 0.55,
      cooldownSeconds: 1.6,
      heldCreepSpeed: 0.7,
    },
    respawnSeconds: 18,
  },
  // Brood sac: a pulsing egg sac stuck to the nursery floor. Never moves; rich in amber.
  broodSac: {
    id: "broodSac",
    name: "Brood sac",
    behavior: "static",
    resistance: 75,
    weight: 3,
    reward: { genetic: 4, amber: 3 },
    xp: 18,
    speed: 0,
    respawnSeconds: 45,
  },
  // The hive queen: vast and slow to turn, with a crushing slam and a long charge.
  hiveQueen: {
    id: "hiveQueen",
    name: "Hive queen",
    behavior: "boss",
    resistance: 1450,
    weight: 0,
    reward: { amber: 25, biomass: 200, genetic: 18, parts: 6 },
    xp: 600,
    speed: 0.9,
    multiGrab: true,
    captureDecaySeconds: 20,
    respawnSeconds: 180,
    bossTuning: {
      ...WARDEN,
      slamRadius: 4,
      slamDamage: 32,
      slamWindup: 1.25,
      chargeWindup: 1.4,
      chargeSpeed: 9,
      chargeDamage: 36,
      walkSpeed: 0.9,
      special: {
        kind: "brood", label: "Calling her brood", minRange: 0, maxRange: 14, cooldown: 12, cast: 1.4,
        type: "hiveWarrior", count: 2, max: 3, calls: 3,
      },
    },
  },
  // --- Ashkar, the desert ruins (portal world 2). Depth-0 equivalents. Relic shards are its currency.
  // Sand skink: a big, slow lizard sunning itself, with shards glinting in its scales.
  sandSkink: {
    id: "sandSkink",
    name: "Sand skink",
    behavior: "wander",
    resistance: 33,
    weight: 2,
    reward: { biomass: 5, shards: 1 },
    xp: 13,
    speed: 0.9,
    respawnSeconds: 10,
  },
  // Dune runner: a hooded scavenger who bolts the moment it sees you.
  duneRunner: {
    id: "duneRunner",
    name: "Dune runner",
    behavior: "flee",
    resistance: 26,
    weight: 2,
    reward: { biomass: 6, shards: 0.5 },
    xp: 12,
    speed: 1.3,
    fleeSpeed: 3.2,
    fleeRadius: 5,
    respawnSeconds: 9,
  },
  // Relic golem: an animated stone guardian. Slow, but its fist reaches far and hits hard.
  relicGolem: {
    id: "relicGolem",
    name: "Relic golem",
    behavior: "guard",
    resistance: 75,
    weight: 4,
    reward: { biomass: 10, shards: 2, parts: 1 },
    xp: 28,
    speed: 0.9,
    combat: {
      detectRadius: 7,
      leashRadius: 10,
      chaseSpeed: 2.2,
      attackRange: 2.1,
      damage: 22,
      windupSeconds: 0.75,
      cooldownSeconds: 2,
      heldCreepSpeed: 0.5,
    },
    respawnSeconds: 18,
  },
  // Burial urn: a sealed urn full of grave goods. Never moves; crack it open for shards.
  burialUrn: {
    id: "burialUrn",
    name: "Burial urn",
    behavior: "static",
    resistance: 70,
    weight: 3,
    reward: { genetic: 3, shards: 3 },
    xp: 18,
    speed: 0,
    respawnSeconds: 45,
  },
  // The sand wyrm: a vast burrowing worm. Its charges are long and fast.
  sandWyrm: {
    id: "sandWyrm",
    name: "Sand wyrm",
    behavior: "boss",
    resistance: 1550,
    weight: 0,
    reward: { shards: 25, biomass: 220, genetic: 20, parts: 7 },
    xp: 650,
    speed: 1,
    multiGrab: true,
    captureDecaySeconds: 20,
    respawnSeconds: 180,
    bossTuning: {
      ...WARDEN,
      slamRadius: 3.8,
      slamDamage: 34,
      slamWindup: 1.2,
      chargeWindup: 1.3,
      chargeSpeed: 11,
      chargeDistance: 15,
      chargeDamage: 40,
      walkSpeed: 1,
      special: {
        kind: "burrow", label: "Burrowing: keep moving", minRange: 0, maxRange: 16, cooldown: 9, cast: 0.9,
        speed: 5, maxSeconds: 4, eruptWindup: 1.1, radius: 2.6, damage: 38, stun: 2.2,
      },
    },
  },
  // --- Maren, the drowned platforms (portal world 3). Depth-0 equivalents. Tide pearls are its currency.
  // Reef crab: a big, sideways-scuttling crab with a pearl tucked under its shell.
  reefCrab: {
    id: "reefCrab",
    name: "Reef crab",
    behavior: "wander",
    resistance: 35,
    weight: 2,
    reward: { biomass: 5, pearls: 1 },
    xp: 13,
    speed: 0.9,
    respawnSeconds: 10,
  },
  // Skimmer: a small, darting fish-thing that skips across the shallows.
  skimmer: {
    id: "skimmer",
    name: "Skimmer",
    behavior: "flee",
    resistance: 22,
    weight: 1,
    reward: { biomass: 3, pearls: 0.5 },
    xp: 9,
    speed: 1.6,
    fleeSpeed: 3.5,
    fleeRadius: 5,
    respawnSeconds: 7,
  },
  // Lancer eel: coils, then lunges a long way with its spiked jaw. Fights back.
  lancerEel: {
    id: "lancerEel",
    name: "Lancer eel",
    behavior: "guard",
    resistance: 72,
    weight: 3,
    reward: { biomass: 9, pearls: 2, parts: 1 },
    xp: 28,
    speed: 1.2,
    combat: {
      detectRadius: 7.5,
      leashRadius: 10,
      chaseSpeed: 2.6,
      attackRange: 2.2,
      damage: 21,
      windupSeconds: 0.6,
      cooldownSeconds: 1.8,
      heldCreepSpeed: 0.7,
    },
    respawnSeconds: 18,
  },
  // Pearl clam: a giant clam clamped to the bed. Never moves; prise it open for pearls.
  pearlClam: {
    id: "pearlClam",
    name: "Pearl clam",
    behavior: "static",
    resistance: 72,
    weight: 3,
    reward: { genetic: 3, pearls: 3 },
    xp: 18,
    speed: 0,
    respawnSeconds: 45,
  },
  // The tide kraken: a vast tentacled thing that slams the deck and lunges across it.
  tideKraken: {
    id: "tideKraken",
    name: "Tide kraken",
    behavior: "boss",
    resistance: 1650,
    weight: 0,
    reward: { pearls: 25, biomass: 240, genetic: 22, parts: 8 },
    xp: 700,
    speed: 0.9,
    multiGrab: true,
    captureDecaySeconds: 20,
    respawnSeconds: 180,
    bossTuning: {
      ...WARDEN,
      slamRadius: 4.2,
      slamDamage: 36,
      slamWindup: 1.25,
      chargeWindup: 1.35,
      chargeSpeed: 9.5,
      chargeDistance: 13,
      chargeDamage: 42,
      walkSpeed: 0.9,
      special: {
        kind: "lash", label: "Tentacle lash", minRange: 0, maxRange: 11, cooldown: 7, cast: 1.3,
        lanes: 3, spread: 0.5, length: 11, halfWidth: 0.9, delay: 1.3, damage: 34,
      },
    },
  },
  // Supply pod: a crate of stolen stock. Quick to crack open, light, and it may hold a
  // short power-up (content/feeding.ts). Not a creature, so the bestiary ignores it.
  pod: {
    id: "pod",
    name: "Supply pod",
    behavior: "static",
    loot: true,
    resistance: 12,
    weight: 1,
    reward: { biomass: 8, genetic: 1 },
    xp: 4,
    speed: 0,
    respawnSeconds: 120,
  },
  ...LATE_TARGETS,
};

export function isTargetType(id: unknown): id is TargetTypeId {
  return typeof id === "string" && Object.hasOwn(TARGETS, id);
}
