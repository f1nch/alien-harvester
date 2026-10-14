/** Chill in freezing rooms (zones with `cold: true`). Simulation time only; never saved. */
export const COLD = {
  /** Seconds in the cold, away from a heat vent, to go from no chill to full. */
  fillSeconds: 14,
  /** Seconds to thaw completely somewhere warm. */
  warmSeconds: 4,
  /** Seconds to thaw completely standing on a heat vent. */
  ventSeconds: 1,
  /** Penalties at full chill, in percent. */
  speedPenalty: 30,
  powerPenalty: 25,
  /** Chill is applied to stats in steps this size, so stats aren't recomputed every tick. */
  statStep: 0.05,
} as const;
