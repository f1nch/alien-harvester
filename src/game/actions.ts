import type { DoorDef } from "../content/map";
import type { UpgradeId } from "../content/upgrades";
import { unlockDoor, type UnlockResult } from "../domain/doors";
import { purchaseUpgrade, respecUpgrades, type PurchaseResult, type RespecResult } from "../domain/economy";
import { evolve, type EvolveResult } from "../domain/evolution";
import { choosePerk, claimFallback, type ChooseResult } from "../domain/perks";
import { dist2 } from "./geometry";
import { inBase } from "./systems/deposit";
import { questEvent, refreshObstacles, refreshStats, type World } from "./world";

/** Player-initiated actions. Each applies its domain transaction, then quest and event bookkeeping. */

export function buyUpgrade(w: World, id: UpgradeId): PurchaseResult {
  const maxBefore = w.stats.maxHealth;
  const r = purchaseUpgrade(w.progress, id);
  if (!r.ok) return r;
  refreshStats(w);
  // At base (where healing is fast anyway) the extra health comes filled in. Elsewhere it
  // doesn't, so buying and refunding health can't be used as a free heal in the field.
  if (inBase(w)) w.progress.player.health += Math.max(0, w.stats.maxHealth - maxBefore);
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

/** Take an option from the oldest pending perk choice (or the fallback if none are legal). */
export function pickPerk(w: World, optionIndex: number | "fallback"): ChooseResult {
  const maxBefore = w.stats.maxHealth;
  const r = optionIndex === "fallback" ? claimFallback(w.progress) : choosePerk(w.progress, optionIndex);
  if (!r.ok) return r;
  refreshStats(w);
  // Perks are free and can't be refunded, so a bigger health pool simply comes filled in.
  w.progress.player.health += Math.max(0, w.stats.maxHealth - maxBefore);
  w.events.push({ type: "perkChosen", perk: r.perk });
  return r;
}

export type RespecActionResult = RespecResult | { ok: false; reason: "notAtBase" | "cargoAboard" };

/** True when a respec is currently allowed (at base, empty hold, nothing being captured). */
export function respecBlocker(w: World): "notAtBase" | "cargoAboard" | null {
  if (!inBase(w)) return "notAtBase";
  // A smaller hold or fewer tentacles must never strand cargo or reserved captures.
  if (w.progress.cargo.length > 0 || w.tentacles.some(Boolean)) return "cargoAboard";
  return null;
}

/** Free mutation reset with full refund of what was actually paid. */
export function respec(w: World): RespecActionResult {
  const blocked = respecBlocker(w);
  if (blocked) return { ok: false, reason: blocked };
  const r = respecUpgrades(w.progress);
  if (!r.ok) return r;
  refreshStats(w);
  w.progress.player.health = Math.min(w.progress.player.health, w.stats.maxHealth);
  return r;
}

export function evolveCreature(w: World): EvolveResult {
  const r = evolve(w.progress);
  if (!r.ok) return r;
  // New tentacle count and raised caps take effect immediately.
  refreshStats(w);
  w.events.push({ type: "evolved", tier: r.tier });
  questEvent(w, { kind: "evolve" });
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
