import { LEVEL_SPAN_GROWTH, LEVEL_XP, MAX_LEVEL } from "../content/levels";
import type { ProgressState } from "./progress";

/** Thresholds by level - 1, extended on demand (the HUD asks every frame). */
const thresholds: number[] = [...LEVEL_XP];

/** Cumulative XP needed to reach a level (level 1 needs 0). */
export function xpForLevel(level: number): number {
  const i = Math.max(1, Math.min(level, MAX_LEVEL + 1)) - 1;
  while (thresholds.length <= i) {
    const n = thresholds.length;
    const span = Math.round((thresholds[n - 1]! - thresholds[n - 2]!) * LEVEL_SPAN_GROWTH);
    thresholds.push(thresholds[n - 1]! + span);
  }
  return thresholds[i]!;
}

export function levelForXp(xp: number): number {
  // Binary search over the (growing) threshold list.
  let lo = 1, hi = 2;
  while (hi < MAX_LEVEL && xp >= xpForLevel(hi)) { lo = hi; hi = Math.min(MAX_LEVEL, hi * 2); }
  if (xp >= xpForLevel(hi)) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xp >= xpForLevel(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

/** XP progress within the current level, for HUD bars. */
export function levelProgress(xp: number): { level: number; into: number; span: number } {
  const level = levelForXp(xp);
  const lo = xpForLevel(level);
  return { level, into: xp - lo, span: xpForLevel(level + 1) - lo };
}

/** Adds XP and returns each level newly reached, in order (may be several). */
export function addXp(p: ProgressState, amount: number): number[] {
  const before = levelForXp(p.xp);
  p.xp += amount;
  const after = levelForXp(p.xp);
  const gained: number[] = [];
  for (let l = before + 1; l <= after; l++) gained.push(l);
  return gained;
}
