import type { Requirements } from "../domain/requirements";

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
export const WARDEN = {
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
} as const;
