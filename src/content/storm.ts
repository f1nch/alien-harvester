/**
 * Sandstorms on worlds whose map has `storms` (content/ashkar.ts). A storm cycle runs on
 * simulation time only and is never saved: a reload starts calm. While a storm blows,
 * standing in an exposed zone (and out of the shade) cuts capture reach.
 */
export const STORM = {
  /** Seconds of calm between storms. */
  calmSeconds: 32,
  /** The first calm after arriving (or reloading) is longer, to find your feet. */
  firstCalmSeconds: 60,
  /** Seconds of warning (the sky darkens) before a storm hits. */
  warnSeconds: 5,
  /** Seconds a storm blows. */
  blowSeconds: 12,
  /** Seconds for the storm to build up or die down. */
  rampSeconds: 2,
  /** Capture reach lost at full storm, in percent, before storm resistance. */
  reachPenalty: 30,
  /** The penalty is applied to stats in steps this size, so stats aren't recomputed every tick. */
  statStep: 0.1,
} as const;
