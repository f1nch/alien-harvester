import { REACTOR } from "../content/reactor";
import type { ProgressState } from "./progress";
import { allMet, evaluate, payCost, type Requirement } from "./requirements";

export function reactorRequirements(p: ProgressState): Requirement[] {
  return evaluate(p, REACTOR.repair);
}

export type RepairResult = { ok: true } | { ok: false; reason: "done" | "requirements" };

/** The MVP's completion. One transaction: cost paid and reactor marked repaired together. */
export function repairReactor(p: ProgressState): RepairResult {
  if (p.reactorRepaired) return { ok: false, reason: "done" };
  if (!allMet(p, REACTOR.repair)) return { ok: false, reason: "requirements" };
  payCost(p, REACTOR.repair);
  p.reactorRepaired = true;
  return { ok: true };
}
