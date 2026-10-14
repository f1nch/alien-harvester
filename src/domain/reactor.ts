import { SUMMON } from "../content/feeding";
import type { Reward } from "../content/currencies";
import { currentBiome, scaleCost } from "./biome";
import type { ProgressState } from "./progress";
import { allMet, evaluate, payCost, type Requirement } from "./requirements";

/** The current biome's objective (the reactor console in the facility). */
export function reactorRequirements(p: ProgressState): Requirement[] {
  return evaluate(p, currentBiome(p).objective.repair);
}

export type RepairResult = { ok: true } | { ok: false; reason: "done" | "requirements" };

/** Completes the biome's objective. One transaction: cost paid and objective marked done together. */
export function repairReactor(p: ProgressState): RepairResult {
  if (p.reactorRepaired) return { ok: false, reason: "done" };
  const repair = currentBiome(p).objective.repair;
  if (!allMet(p, repair)) return { ok: false, reason: "requirements" };
  payCost(p, repair);
  p.reactorRepaired = true;
  return { ok: true };
}

/** The next reward wave's price: the floor's, growing with each wave already summoned here. */
export function summonCost(p: ProgressState): Reward {
  const base = currentBiome(p).summonCost;
  return p.summon.waves === 0 ? base : scaleCost(base, SUMMON.costGrowth ** p.summon.waves);
}

/** The objective machine's reward wave: what it costs here, with progress. */
export function summonRequirements(p: ProgressState): Requirement[] {
  return evaluate(p, { cost: summonCost(p) });
}

export type SummonResult = { ok: true; count: number } | { ok: false; reason: "notDone" | "active" | "requirements" };

/**
 * Pays for a reward wave. One transaction: the cost is paid and the wave recorded
 * together; the world spawns progress.summon.left creatures from it. One wave at a time.
 */
export function startSummon(p: ProgressState): SummonResult {
  if (!p.reactorRepaired) return { ok: false, reason: "notDone" };
  if (p.summon.left > 0) return { ok: false, reason: "active" };
  const r = { cost: summonCost(p) };
  if (!allMet(p, r)) return { ok: false, reason: "requirements" };
  payCost(p, r);
  p.summon.waves += 1;
  p.summon.left = SUMMON.count;
  return { ok: true, count: SUMMON.count };
}
