import { CURRENCIES, type Currency } from "../content/currencies";
import { goalTarget, QUESTS, type QuestDef } from "../content/quests";
import type { TargetTypeId } from "../content/targets";
import { addXp } from "./levels";
import type { ProgressState } from "./progress";

export type QuestEvent =
  | { kind: "capture"; target: TargetTypeId }
  | { kind: "bank"; currency: Currency; amount: number }
  | { kind: "buyUpgrade" }
  | { kind: "unlockDoor"; door: string }
  | { kind: "evolve" }
  | { kind: "build"; structure: string }
  | { kind: "defeatBoss" };

export interface QuestOutcome {
  completed: QuestDef[];
  levelsGained: number[];
}

export function isDone(p: ProgressState, id: string): boolean {
  return p.quests[id]?.done === true;
}

export function isActive(p: ProgressState, q: QuestDef): boolean {
  return !isDone(p, q.id) && q.prereqs.every((id) => isDone(p, id));
}

export function activeQuests(p: ProgressState): QuestDef[] {
  return QUESTS.filter((q) => isActive(p, q));
}

export function questCount(p: ProgressState, id: string): number {
  return p.quests[id]?.count ?? 0;
}

function contribution(q: QuestDef, e: QuestEvent): number {
  const g = q.goal;
  switch (e.kind) {
    case "capture":
      return g.kind === "capture" && (g.target === "any" || g.target === e.target) ? 1 : 0;
    case "bank":
      return g.kind === "bank" && g.currency === e.currency ? e.amount : 0;
    case "buyUpgrade":
      return g.kind === "buyUpgrade" ? 1 : 0;
    case "unlockDoor":
      return g.kind === "unlockDoor" && g.door === e.door ? 1 : 0;
    case "evolve":
      return g.kind === "evolve" ? 1 : 0;
    case "build":
      return g.kind === "build" && g.structure === e.structure ? 1 : 0;
    case "defeatBoss":
      return g.kind === "defeatBoss" ? 1 : 0;
  }
}

/** Marks a quest complete and grants its reward in one step. Never applies twice. */
function complete(p: ProgressState, q: QuestDef, out: QuestOutcome): void {
  const state = (p.quests[q.id] ??= { count: 0, done: false });
  if (state.done) return;
  state.done = true;
  state.count = goalTarget(q.goal);
  for (const c of CURRENCIES) {
    const amount = q.reward[c];
    if (amount) p.banked[c] += amount;
  }
  if (q.reward.xp) out.levelsGained.push(...addXp(p, q.reward.xp));
  out.completed.push(q);
}

/**
 * Advance active quests. Progress only counts while a quest is active; an
 * event does not also count toward quests that its completion unlocks.
 */
export function applyQuestEvent(p: ProgressState, e: QuestEvent): QuestOutcome {
  const out: QuestOutcome = { completed: [], levelsGained: [] };
  for (const q of activeQuests(p)) {
    const n = contribution(q, e);
    if (n <= 0) continue;
    const state = (p.quests[q.id] ??= { count: 0, done: false });
    state.count = Math.min(goalTarget(q.goal), state.count + n);
    if (state.count >= goalTarget(q.goal)) complete(p, q, out);
  }
  // Quests unlocked just now may already be satisfied by existing state.
  if (out.completed.length) {
    const settled = settleQuests(p);
    out.completed.push(...settled.completed);
    out.levelsGained.push(...settled.levelsGained);
  }
  return out;
}

function stateGoalHolds(p: ProgressState, q: QuestDef): boolean {
  if (questCount(p, q.id) >= goalTarget(q.goal)) return true;
  switch (q.goal.kind) {
    case "unlockDoor":
      return p.unlockedDoors.includes(q.goal.door);
    case "buyUpgrade":
      // Already owning a mutation counts, so buying early (or a maxed migrated save) is never a dead end.
      return Object.values(p.upgrades).some((lvl) => lvl > 0);
    default:
      return false;
  }
}

/**
 * Re-check quests whose goal is a state that already holds (e.g. a door that
 * was opened before the quest became active). Repeats until nothing changes.
 */
export function settleQuests(p: ProgressState): QuestOutcome {
  const out: QuestOutcome = { completed: [], levelsGained: [] };
  let changed = true;
  while (changed) {
    changed = false;
    for (const q of activeQuests(p)) {
      if (stateGoalHolds(p, q)) {
        complete(p, q, out);
        changed = true;
      }
    }
  }
  return out;
}
