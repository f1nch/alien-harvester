import { zoneAt } from "../../content/map";
import { pointInRect } from "../geometry";
import { PLAYER_RADIUS, refreshObstacles, type TargetEntity, type World } from "../world";

/**
 * How far inside the hall the player must be before its doors close: their whole body
 * clear of the doorway, so a closing door never shoves them back out.
 */
export const SEAL_INSET = PLAYER_RADIUS + 0.1;

/** The boss whose hall the player is in, if it's alive (the hall's doors close behind them). */
function bossAhead(w: World): TargetEntity | null {
  const p = w.player;
  if (w.progress.player.health <= 0) return null;
  for (const t of w.targets) {
    if (t.def.behavior !== "boss") continue;
    if (pointInRect(p.x, p.z, t.zoneRect, -SEAL_INSET)) return t;
  }
  return null;
}

/** Open doors into the hall of `boss`. */
function hallDoors(w: World, boss: TargetEntity): string[] {
  const zone = zoneAt(w.map, boss.homeX, boss.homeZ);
  if (!zone) return [];
  const open = new Set(w.progress.unlockedDoors);
  return w.map.doors.filter((d) => (d.from === zone.id || d.to === zone.id) && open.has(d.id)).map((d) => d.id);
}

/**
 * A boss fight is a lockdown: once the player is inside the hall, its doors close until
 * the boss is caught. They open again if the boss is gone or the player leaves the hall
 * any other way (dying sends them home). Transient: never saved; a reload re-seals from
 * where the player stands.
 */
export function updateArena(w: World): void {
  const a = w.arena;
  if (a) {
    const stillOn = w.targets.includes(a.boss) && pointInRect(w.player.x, w.player.z, a.boss.zoneRect) && w.progress.player.health > 0;
    if (stillOn) return;
    w.arena = null;
    refreshObstacles(w);
    w.events.push({ type: "arenaOpened", defeated: !w.targets.includes(a.boss) });
    return;
  }
  const boss = bossAhead(w);
  if (!boss) return;
  const doors = hallDoors(w, boss);
  if (doors.length === 0) return;
  w.arena = { boss, doors };
  refreshObstacles(w);
  w.events.push({ type: "arenaSealed", name: boss.def.name });
}

/** Doors drawn open: unlocked, and not closed by a boss fight. */
export function openDoors(w: World): string[] {
  const sealed = w.arena?.doors;
  return sealed ? w.progress.unlockedDoors.filter((d) => !sealed.includes(d)) : w.progress.unlockedDoors;
}
