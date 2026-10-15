import type { Requirements } from "../domain/requirements";
import type { TargetTypeId } from "./targets";

/** The reactor console: repairing it is the MVP's completion condition. */
export const REACTOR = {
  name: "Reactor console",
  x: 0,
  z: 93.5,
  halfSize: 0.9,
  /** The repair card shows within this distance. */
  interactRadius: 3,
  repair: {
    quests: ["q-boss"],
    cost: { parts: 15, biomass: 300 },
  } satisfies Requirements,
} as const;

/** Tuning for the reactor warden's attacks. Every attack is telegraphed before it lands. */
export const WARDEN: Readonly<BossTuning> = {
  /** Uses the slam when the player is this close. */
  slamTrigger: 3,
  slamRadius: 3.2,
  slamDamage: 28,
  slamWindup: 1.1,
  /** Considers a charge when the player is between these distances. */
  chargeMin: 4.5,
  chargeMax: 13,
  chargeWindup: 1.3,
  chargeSpeed: 9,
  chargeDistance: 12,
  chargeDamage: 34,
  /** Hit radius around the warden while charging. */
  chargeHitRadius: 1.4,
  chargeCooldown: 4,
  /** Stunned after a charge; longer if it rammed something. */
  stunAfterCharge: 1,
  stunAfterImpact: 2.6,
  recover: 1.4,
  walkSpeed: 1.1,
  /** Movement multiplier while tentacles hold it (it's too big to pin). */
  heldSlow: 0.5,
  /** Capture progress multiplier while stunned. */
  stunnedCaptureBonus: 2,
};

/** Every number a boss fight uses. Bosses without their own use the warden's. */
export interface BossTuning {
  slamTrigger: number;
  slamRadius: number;
  slamDamage: number;
  slamWindup: number;
  /** Chill (0..1) the slam adds when it lands: the cryo sentinel's freezing pulse. */
  slamChill?: number;
  chargeMin: number;
  chargeMax: number;
  chargeWindup: number;
  chargeSpeed: number;
  chargeDistance: number;
  chargeDamage: number;
  chargeHitRadius: number;
  chargeCooldown: number;
  stunAfterCharge: number;
  stunAfterImpact: number;
  recover: number;
  walkSpeed: number;
  heldSlow: number;
  stunnedCaptureBonus: number;
  /** The boss's signature move, on top of the slam and charge. The warden has none. */
  special?: BossSpecial;
}

/** Shared by every signature move: when the boss may use it. */
interface SpecialBase {
  /** Shown on the boss bar while it winds up. */
  label: string;
  /** Used only when the player is between these distances. */
  minRange: number;
  maxRange: number;
  /** Seconds between uses. */
  cooldown: number;
  /** Seconds the boss spends casting it (rooted, telegraphing). */
  cast: number;
}

/**
 * Signature moves. Every one is telegraphed on the ground before it lands, and the
 * telegraphed spots are locked when they appear, so moving away always works.
 */
export type BossSpecial =
  /** Ice spikes fall around the player, one aimed at them; each chills where it lands. */
  | (SpecialBase & { kind: "icefall"; count: number; radius: number; spread: number; delay: number; stagger: number; damage: number; chill: number })
  /** Chains extra, shorter charges, each re-aimed, with a short windup; stunned only after the last. */
  | (SpecialBase & { kind: "frenzy"; extraCharges: number; windup: number; distance: number })
  /** Shells land in a line from the boss through the player and beyond, one after another. */
  | (SpecialBase & { kind: "barrage"; count: number; radius: number; spacing: number; delay: number; stagger: number; damage: number })
  /** Calls brood creatures to its side (never more than `max` of them alive at once). */
  | (SpecialBase & { kind: "brood"; type: TargetTypeId; count: number; max: number })
  /** Dives out of reach, tunnels after the player, erupts under them, and is briefly stunned. */
  | (SpecialBase & { kind: "burrow"; speed: number; maxSeconds: number; eruptWindup: number; radius: number; damage: number; stun: number })
  /** Slams a fan of arms down along lanes aimed at the player. */
  | (SpecialBase & { kind: "lash"; lanes: number; spread: number; length: number; halfWidth: number; delay: number; damage: number });
