import { PRIZED } from "../../content/feeding";
import { hasLineOfSight, resolveCircle } from "../geometry";
import { spawnTarget, TARGET_RADIUS, type World } from "../world";
import { updateBoss } from "./boss";
import { updateGuard } from "./combat";
import { pickGoal, wanderStep } from "./wander";

/** Wander for passive targets; flee-type targets run from a visible player; guards fight. */
export function updateTargets(w: World, dt: number): void {
  const { player: p } = w;
  for (const t of w.targets) {
    t.prevX = t.x;
    t.prevZ = t.z;
    // Guards keep thinking while held: they can't move, but they can still strike.
    if (t.def.behavior === "guard") {
      updateGuard(w, t, dt);
      continue;
    }
    if (t.def.behavior === "boss") {
      updateBoss(w, t, dt);
      continue;
    }
    if (t.def.behavior === "static") continue;
    if (t.held) {
      t.fleeing = false;
      continue;
    }

    // Prized specimens bolt from the player whatever they normally do.
    if (t.def.behavior === "flee" || t.prized) {
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      const r = t.prized ? PRIZED.fleeRadius : t.def.fleeRadius ?? 0;
      if (d < r && d > 1e-6 && hasLineOfSight(p.x, p.z, t.x, t.z, w.obstacles)) {
        const step = (t.prized ? PRIZED.fleeSpeed : t.def.fleeSpeed ?? t.def.speed) * dt;
        t.x += (dx / d) * step;
        t.z += (dz / d) * step;
        t.heading = Math.atan2(dx, dz);
        t.fleeing = true;
        t.idle = 0;
        // Pushing against walls slides along them, so cornering a runner works.
        resolveCircle(t, TARGET_RADIUS, t.zoneRect, w.obstacles);
        continue;
      }
      if (t.fleeing) {
        t.fleeing = false;
        pickGoal(w, t);
      }
    }

    wanderStep(w, t, dt);
  }
}

/** Respawn cooldowns only tick inside the simulation, never from wall-clock time. */
export function updateSpawns(w: World, dt: number): void {
  const cds = w.progress.spawnCooldowns;
  for (const id in cds) {
    const cd = cds[id]!;
    if (cd <= 0) continue;
    const next = cd - dt;
    if (next <= 0) spawnTarget(w, id);
    else cds[id] = next;
  }
}
