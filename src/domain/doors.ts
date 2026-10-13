import { CURRENCIES, CURRENCY_LABEL } from "../content/currencies";
import type { DoorDef } from "../content/map";
import { QUEST_BY_ID } from "../content/quests";
import { levelForXp } from "./levels";
import type { ProgressState } from "./progress";
import { isDone } from "./quests";

export interface Requirement {
  label: string;
  met: boolean;
  /** e.g. "3 / 5" or "120 / 250". */
  progress: string;
}

export function isUnlocked(p: ProgressState, door: DoorDef): boolean {
  return p.unlockedDoors.includes(door.id);
}

/** Every requirement with its current progress, for the door card. */
export function doorRequirements(p: ProgressState, door: DoorDef): Requirement[] {
  const r = door.requirements;
  const out: Requirement[] = [];
  if (r.level !== undefined) {
    const level = levelForXp(p.xp);
    out.push({ label: `Reach level ${r.level}`, met: level >= r.level, progress: `Lv ${level} / ${r.level}` });
  }
  for (const id of r.quests ?? []) {
    const q = QUEST_BY_ID.get(id);
    const met = isDone(p, id);
    out.push({ label: q ? `Quest: ${q.title}` : id, met, progress: met ? "Done" : "Not done" });
  }
  for (const c of CURRENCIES) {
    const cost = r.cost?.[c];
    if (!cost) continue;
    const have = p.banked[c];
    out.push({
      label: `Pay ${cost} ${CURRENCY_LABEL[c].toLowerCase()}`,
      met: have >= cost,
      progress: `${Math.floor(Math.min(have, cost))} / ${cost}`,
    });
  }
  return out;
}

export type UnlockResult = { ok: true } | { ok: false; reason: "already" | "requirements" };

/** One transaction: nothing is deducted unless every requirement is met. */
export function unlockDoor(p: ProgressState, door: DoorDef): UnlockResult {
  if (isUnlocked(p, door)) return { ok: false, reason: "already" };
  if (!doorRequirements(p, door).every((req) => req.met)) return { ok: false, reason: "requirements" };
  for (const c of CURRENCIES) {
    const cost = door.requirements.cost?.[c];
    if (cost) p.banked[c] -= cost;
  }
  p.unlockedDoors.push(door.id);
  return { ok: true };
}
