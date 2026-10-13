import { LEVEL_XP, MAX_LEVEL } from "../content/levels";
import type { ProgressState } from "./progress";

export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]!) level = i + 1;
  return level;
}

/** XP progress within the current level, for HUD bars. */
export function levelProgress(xp: number): { level: number; into: number; span: number | null } {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return { level, into: xp - LEVEL_XP[MAX_LEVEL - 1]!, span: null };
  const lo = LEVEL_XP[level - 1]!;
  return { level, into: xp - lo, span: LEVEL_XP[level]! - lo };
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
