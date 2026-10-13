import type { DoorDef } from "../content/map";
import type { ProgressState } from "./progress";
import { allMet, evaluate, payCost, type Requirement } from "./requirements";

export type { Requirement } from "./requirements";

export function isUnlocked(p: ProgressState, door: DoorDef): boolean {
  return p.unlockedDoors.includes(door.id);
}

/** Every requirement with its current progress, for the door card. */
export function doorRequirements(p: ProgressState, door: DoorDef): Requirement[] {
  return evaluate(p, door.requirements);
}

export type UnlockResult = { ok: true } | { ok: false; reason: "already" | "requirements" };

/** One transaction: nothing is deducted unless every requirement is met. */
export function unlockDoor(p: ProgressState, door: DoorDef): UnlockResult {
  if (isUnlocked(p, door)) return { ok: false, reason: "already" };
  if (!allMet(p, door.requirements)) return { ok: false, reason: "requirements" };
  payCost(p, door.requirements);
  p.unlockedDoors.push(door.id);
  return { ok: true };
}
