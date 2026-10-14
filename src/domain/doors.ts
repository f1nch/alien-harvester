import type { DoorDef } from "../content/map";
import type { ProgressState } from "./progress";
import { scaleRequirements } from "./biome";
import { allMet, evaluate, payCost, type Requirement, type Requirements } from "./requirements";

export type { Requirement } from "./requirements";

export function isUnlocked(p: ProgressState, door: DoorDef): boolean {
  return p.unlockedDoors.includes(door.id);
}

/** Every requirement with its current progress, for the door card. */
export function doorRequirements(p: ProgressState, door: DoorDef): Requirement[] {
  return evaluate(p, scaledDoor(p, door));
}

/** Door prices grow with depth, like everything else in the biome. */
function scaledDoor(p: ProgressState, door: DoorDef): Requirements {
  return scaleRequirements(door.requirements, p.depth);
}

export type UnlockResult = { ok: true } | { ok: false; reason: "already" | "requirements" };

/** One transaction: nothing is deducted unless every requirement is met. */
export function unlockDoor(p: ProgressState, door: DoorDef): UnlockResult {
  if (isUnlocked(p, door)) return { ok: false, reason: "already" };
  const r = scaledDoor(p, door);
  if (!allMet(p, r)) return { ok: false, reason: "requirements" };
  payCost(p, r);
  p.unlockedDoors.push(door.id);
  return { ok: true };
}
