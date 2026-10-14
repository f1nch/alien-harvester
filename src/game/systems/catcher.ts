import { reachableZones, zoneAt } from "../../content/map";
import { CATCHER } from "../../content/structures";
import { cargoWeight } from "../../domain/progress";
import { catcherLevel, type CatcherState } from "../../domain/structures";
import { dist2, resolveCircle } from "../geometry";
import { nextWaypoint } from "../nav";
import type { TargetEntity, World } from "../world";
import { catcherComplete } from "./capture";
import { bankDrop, nearestPad } from "./deposit";

export type CatcherMode = "idle" | "hunting" | "toPad";

/** Drop the catcher's prey, if any (it was never marked as held, so nothing else to undo). */
export function releaseCatcher(w: World): void {
  w.catcher.target = null;
  w.catcher.progress = 0;
}

/** Fly like the drone: straight within a zone, through doors between zones. */
function moveCatcher(w: World, c: CatcherState, tx: number, tz: number, dt: number): void {
  const wp = nextWaypoint(w.map, w.progress.unlockedDoors, c.x, c.z, tx, tz);
  if (!wp) return;
  const dx = wp.x - c.x;
  const dz = wp.z - c.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) return;
  const step = Math.min(dist, CATCHER.speed * dt);
  c.x += (dx / dist) * step;
  c.z += (dz / dist) * step;
  resolveCircle(c, CATCHER.radius, w.map.bounds, w.droneObstacles);
}

/**
 * Prey it can take: a creature near you, in a room you can reach, that fits its hold and
 * that you aren't already holding. Never bosses, fighters, supply pods or prized
 * specimens (those are yours to catch).
 */
/** Still allowed as prey, wherever it is: not gone, prized, held by you, a fighter, or too heavy. */
function keepable(w: World, t: TargetEntity, free: number): boolean {
  const def = t.def;
  if (!w.targets.includes(t)) return false;
  if (def.behavior === "boss" || def.behavior === "static" || def.combat || def.weight <= 0 || t.prized) return false;
  return def.weight <= free && !w.tentacles.includes(t);
}

function eligible(w: World, t: TargetEntity, free: number, open: Set<string>): boolean {
  if (!keepable(w, t, free)) return false;
  if (dist2(t.x, t.z, w.player.x, w.player.z) > CATCHER.huntRadius ** 2) return false;
  const zone = zoneAt(w.map, t.x, t.z);
  return zone !== null && open.has(zone.id);
}

function pickPrey(w: World, c: CatcherState, free: number): TargetEntity | null {
  const open = reachableZones(w.map, w.progress.unlockedDoors);
  let best: TargetEntity | null = null;
  let bestD = Infinity;
  for (const t of w.targets) {
    if (!eligible(w, t, free, open)) continue;
    const d = dist2(c.x, c.z, t.x, t.z);
    if (d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/**
 * The catcher hunts near you with a share of your capture power, and flies its catch to
 * the nearest pad when its hold is full (or nothing is left to hunt). Its catches go into
 * its own hold, so your death never costs them. Simulation time only.
 */
export function updateCatcher(w: World, dt: number): void {
  const c = w.progress.structures.catcher;
  w.catcherPrev.x = c.x;
  w.catcherPrev.z = c.z;
  if (!c.built) return;
  const lvl = catcherLevel(c);
  const free = lvl.capacity - cargoWeight(c.cargo);
  const k = w.catcher;

  // Lose prey that's gone (captured by you, despawned) or no longer allowed.
  if (k.target && !keepable(w, k.target, free)) releaseCatcher(w);
  if (k.mode !== "toPad" || c.cargo.length === 0) {
    if (!k.target && free > 0) k.target = pickPrey(w, c, free);
    k.mode = k.target ? "hunting" : c.cargo.length > 0 ? "toPad" : "idle";
  }

  switch (k.mode) {
    case "hunting": {
      const t = k.target!;
      if (dist2(c.x, c.z, t.x, t.z) <= CATCHER.reach ** 2) {
        k.progress += ((w.stats.capturePower * lvl.powerPercent) / 100 / t.def.resistance) * dt;
        if (k.progress >= 1) {
          catcherComplete(w, t, c.cargo);
          releaseCatcher(w);
          // Full: head home now rather than hunting something that won't fit.
          if (pickPrey(w, c, lvl.capacity - cargoWeight(c.cargo)) === null) k.mode = "toPad";
        }
      } else {
        k.progress = Math.max(0, k.progress - dt / CATCHER.decaySeconds);
        // Too far from you now: let it go and find something closer.
        if (dist2(t.x, t.z, w.player.x, w.player.z) > (CATCHER.huntRadius + 2) ** 2) releaseCatcher(w);
        else moveCatcher(w, c, t.x, t.z, dt);
      }
      return;
    }
    case "toPad": {
      const pad = nearestPad(w, c.x, c.z);
      if (dist2(c.x, c.z, pad.x, pad.z) <= pad.radius ** 2) {
        for (const drop of c.cargo.splice(0)) bankDrop(w, drop);
        w.events.push({ type: "catcherDeposited" });
        k.mode = "idle";
      } else {
        moveCatcher(w, c, pad.x, pad.z, dt);
      }
      return;
    }
    case "idle":
      // Stay at your shoulder.
      if (dist2(c.x, c.z, w.player.x, w.player.z) > 2.2 ** 2) moveCatcher(w, c, w.player.x + 1.2, w.player.z - 0.8, dt);
      return;
  }
}
