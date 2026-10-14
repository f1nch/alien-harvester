/**
 * Ocean currents on worlds whose map has `currents` (content/maren.ts). They push the
 * creature along while it's inside one, pulsing with the tide. The tide follows total
 * play time (progress.playSeconds), so it needs no state of its own and never drifts
 * from what was saved.
 */
export const TIDE = {
  /** Seconds for one full ebb and flow. */
  periodSeconds: 40,
  /** Current strength at slack and at full flood, as a share of each current's speed. */
  low: 0.35,
  high: 1,
} as const;

/** How hard the currents run right now (TIDE.low..TIDE.high), from play time. */
export function tideStrength(playSeconds: number): number {
  const wave = 0.5 + 0.5 * Math.sin((playSeconds / TIDE.periodSeconds) * Math.PI * 2);
  return TIDE.low + (TIDE.high - TIDE.low) * wave;
}
