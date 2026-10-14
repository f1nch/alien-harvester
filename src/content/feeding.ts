/**
 * Tuning for the moment-to-moment loop features (docs/EXPANSION_DESIGN.md, Phase A).
 * All timers are simulation seconds; nothing here runs while the game isn't.
 */

/** Feeding frenzy: quick back-to-back captures fill a combo; a full combo starts a frenzy. */
export const FRENZY = {
  /** Captures needed in a row to start a frenzy. */
  combo: 8,
  /** The combo drops if nothing is captured for this long. */
  comboWindow: 4,
  /** Frenzy length. */
  seconds: 6,
  /** Capture power bonus during a frenzy, in percent. */
  powerPercent: 100,
} as const;

/** Prized specimens: a rare glowing target that bolts, worth chasing. */
export const PRIZED = {
  /** Seconds of play between prized specimens. */
  interval: 90,
  /** How long one stays before slipping away. */
  seconds: 30,
  fleeSpeed: 2.8,
  fleeRadius: 6,
  /** Banked on capture on top of the normal cargo: this many extra payouts' worth. */
  bonusPayouts: 7,
  mutagen: 3,
} as const;

export type BoostId = "magnet" | "haste" | "overdrive";

/** Short power-ups found in supply pods. */
export const BOOSTS: Record<BoostId, { name: string; stat: "captureRadius" | "moveSpeed" | "capturePower"; percent: number }> = {
  magnet: { name: "Magnet", stat: "captureRadius", percent: 50 },
  haste: { name: "Haste", stat: "moveSpeed", percent: 30 },
  overdrive: { name: "Overdrive", stat: "capturePower", percent: 50 },
};

export const POD = {
  /** Chance a pod also holds a power-up. */
  boostChance: 0.4,
  boostSeconds: 15,
} as const;
