import { currentBiome } from "./biome";
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
