import type { DoorDef } from "../content/map";
import type { UpgradeId } from "../content/upgrades";
import { unlockDoor, type UnlockResult } from "../domain/doors";
import { purchaseUpgrade, type PurchaseResult } from "../domain/economy";
import { dist2 } from "./geometry";
import { questEvent, refreshObstacles, refreshStats, type World } from "./world";

/** Player-initiated actions. Each applies its domain transaction, then quest and event bookkeeping. */

export function buyUpgrade(w: World, id: UpgradeId): PurchaseResult {
  const r = purchaseUpgrade(w.progress, id);
  if (!r.ok) return r;
  refreshStats(w);
  w.events.push({ type: "purchased" });
  questEvent(w, { kind: "buyUpgrade" });
  return r;
}

export function openDoor(w: World, door: DoorDef): UnlockResult {
  const r = unlockDoor(w.progress, door);
  if (!r.ok) return r;
  refreshObstacles(w);
  w.events.push({ type: "doorUnlocked", door: door.id });
  questEvent(w, { kind: "unlockDoor", door: door.id });
  return r;
}

/** Distance within which the door card appears. */
export const DOOR_INTERACT_RADIUS = 3.2;

/** The locked door the player is standing next to, if any. */
export function nearbyLockedDoor(w: World): DoorDef | null {
  const r2 = DOOR_INTERACT_RADIUS * DOOR_INTERACT_RADIUS;
  for (const d of w.map.doors) {
    if (w.progress.unlockedDoors.includes(d.id)) continue;
    const cx = (d.rect.minX + d.rect.maxX) / 2;
    const cz = (d.rect.minZ + d.rect.maxZ) / 2;
    if (dist2(w.player.x, w.player.z, cx, cz) <= r2) return d;
  }
  return null;
}
