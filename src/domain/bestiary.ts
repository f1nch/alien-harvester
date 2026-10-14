import { roundCents } from "../content/currencies";
import type { TargetTypeId } from "../content/targets";
import type { ProgressState } from "./progress";

/** Lifetime captures per creature type that pay out, and what each pays. */
export const BESTIARY_MILESTONES = [
  { count: 10, mutagen: 2 },
  { count: 50, mutagen: 5 },
  { count: 200, mutagen: 10 },
] as const;

/** Capture power bonus per milestone reached, in percent. */
export const BESTIARY_POWER_PERCENT = 1;

/** Creatures only: supply pods aren't anyone. */
export function inBestiary(type: TargetTypeId): boolean {
  return type !== "pod";
}

export function milestonesReached(count: number): number {
  return BESTIARY_MILESTONES.filter((m) => count >= m.count).length;
}

/** Summed over every type; feeds capture power in computeStats. */
export function bestiaryPowerPercent(p: ProgressState): number {
  let n = 0;
  for (const count of Object.values(p.bestiary)) n += milestonesReached(count ?? 0);
  return n * BESTIARY_POWER_PERCENT;
}

/**
 * Counts one capture. When it reaches a milestone, pays its mutagen in the same step
 * and returns it (null otherwise).
 */
export function recordCapture(p: ProgressState, type: TargetTypeId): (typeof BESTIARY_MILESTONES)[number] | null {
  if (!inBestiary(type)) return null;
  const count = (p.bestiary[type] ?? 0) + 1;
  p.bestiary[type] = count;
  const hit = BESTIARY_MILESTONES.find((m) => m.count === count) ?? null;
  if (hit) p.banked.mutagen = roundCents(p.banked.mutagen + hit.mutagen);
  return hit;
}
