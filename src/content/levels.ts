/** Cumulative XP needed to reach each level; index 0 is level 1. Provisional tuning. */
export const LEVEL_XP: readonly number[] = [0, 60, 180, 380, 700, 1150, 1750, 2550, 3600, 5000];

/**
 * Levels never run out: past the table, each level needs this much more XP than the one
 * before. XP payouts grow 1.6x per biome, so this works out at a few levels per biome.
 */
export const LEVEL_SPAN_GROWTH = 1.35;

/** Bound for validating untrusted saves; far past anything reachable. */
export const MAX_LEVEL = 1000;
