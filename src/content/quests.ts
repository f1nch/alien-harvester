import type { Currency, Reward } from "./currencies";
import type { TargetTypeId } from "./targets";

export type QuestGoal =
  | { kind: "capture"; target: TargetTypeId | readonly TargetTypeId[] | "any"; count: number }
  | { kind: "bank"; currency: Currency; count: number }
  | { kind: "buyUpgrade"; count: number }
  | { kind: "unlockDoor"; door: string }
  | { kind: "evolve"; count: number }
  | { kind: "build"; structure: string }
  | { kind: "defeatBoss" };

export interface QuestDef {
  id: string;
  title: string;
  goal: QuestGoal;
  /** All must be complete before this quest becomes active. */
  prereqs: string[];
  reward: Reward & { xp?: number };
}

/** Persistent IDs: never rename or reuse them, saves reference them. */
export const QUESTS: QuestDef[] = [
  {
    id: "q-first-catch",
    title: "Capture 5 workers",
    goal: { kind: "capture", target: "worker", count: 5 },
    prereqs: [],
    reward: { biomass: 10, xp: 10 },
  },
  {
    id: "q-first-bank",
    title: "Bank 30 biomass at the base",
    goal: { kind: "bank", currency: "biomass", count: 30 },
    prereqs: ["q-first-catch"],
    reward: { biomass: 10, xp: 10 },
  },
  {
    id: "q-first-upgrade",
    title: "Buy a mutation",
    goal: { kind: "buyUpgrade", count: 1 },
    prereqs: ["q-first-bank"],
    reward: { xp: 20 },
  },
  {
    id: "q-open-service",
    title: "Open the service wing",
    goal: { kind: "unlockDoor", door: "door-service" },
    prereqs: ["q-first-upgrade"],
    reward: { biomass: 25, xp: 25 },
  },
  {
    id: "q-runners",
    title: "Catch 8 runners",
    goal: { kind: "capture", target: "runner", count: 8 },
    prereqs: ["q-open-service"],
    reward: { biomass: 40, xp: 40 },
  },
  {
    id: "q-genetic",
    title: "Bank 25 genetic material",
    goal: { kind: "bank", currency: "genetic", count: 25 },
    prereqs: ["q-open-service"],
    reward: { biomass: 50, xp: 60 },
  },
  {
    id: "q-build-farm",
    title: "Build the biomass vat",
    goal: { kind: "build", structure: "vat" },
    prereqs: ["q-open-service"],
    reward: { genetic: 5, xp: 40 },
  },
  {
    id: "q-evolve",
    title: "Evolve",
    goal: { kind: "evolve", count: 1 },
    prereqs: ["q-genetic"],
    reward: { biomass: 100, xp: 100 },
  },
  {
    id: "q-open-security",
    title: "Breach the security sector",
    goal: { kind: "unlockDoor", door: "door-security" },
    prereqs: ["q-genetic"],
    reward: { biomass: 60, xp: 60 },
  },
  {
    id: "q-guards",
    title: "Capture 10 guards",
    goal: { kind: "capture", target: ["guard", "armoredGuard"], count: 10 },
    prereqs: ["q-open-security"],
    reward: { genetic: 15, xp: 120 },
  },
  {
    id: "q-open-reactor",
    title: "Enter the reactor hall",
    goal: { kind: "unlockDoor", door: "door-reactor" },
    prereqs: ["q-evolve", "q-open-security"],
    reward: { xp: 150 },
  },
  {
    id: "q-boss",
    title: "Defeat the reactor warden",
    goal: { kind: "defeatBoss" },
    prereqs: ["q-open-reactor"],
    reward: { parts: 10, xp: 300 },
  },
];

export const QUEST_BY_ID = new Map(QUESTS.map((q) => [q.id, q]));

/** Count needed to complete a goal (binary goals need 1). */
export function goalTarget(goal: QuestGoal): number {
  return "count" in goal ? goal.count : 1;
}
