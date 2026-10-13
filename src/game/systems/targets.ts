import { hasLineOfSight, pointInRect, resolveCircle } from "../geometry";
import { spawnTarget, TARGET_RADIUS, type TargetEntity, type World } from "../world";

/** Wander for passive targets; flee-type targets run from a visible player. Held targets stay put. */
export function updateTargets(w: World, dt: number): void {
  const { player: p } = w;
  for (const t of w.targets) {
    t.prevX = t.x;
    t.prevZ = t.z;
    if (t.held) {
      t.fleeing = false;
      continue;
    }

    if (t.def.behavior === "flee") {
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      const r = t.def.fleeRadius ?? 0;
      if (d < r && d > 1e-6 && hasLineOfSight(p.x, p.z, t.x, t.z, w.obstacles)) {
        const step = (t.def.fleeSpeed ?? t.def.speed) * dt;
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

    if (t.idle > 0) {
      t.idle -= dt;
      continue;
    }
    const dx = t.goalX - t.x;
    const dz = t.goalZ - t.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.1) {
      pickGoal(w, t);
      t.idle = 0.8 + w.rng() * 2.2;
      continue;
    }
    const step = Math.min(d, t.def.speed * dt);
    t.x += (dx / d) * step;
    t.z += (dz / d) * step;
    t.heading = Math.atan2(dx, dz);
    const bx = t.x;
    const bz = t.z;
    resolveCircle(t, TARGET_RADIUS, t.zoneRect, w.obstacles);
    // Blocked by a wall or obstacle: choose somewhere else instead of sliding forever.
    if (Math.abs(bx - t.x) + Math.abs(bz - t.z) > 1e-4) pickGoal(w, t);
  }
}

/** Picks a reachable-looking point near home. Walks straight back home if none found. */
function pickGoal(w: World, t: TargetEntity): void {
  for (let attempt = 0; attempt < 6; attempt++) {
    const a = w.rng() * Math.PI * 2;
    const r = Math.sqrt(w.rng()) * t.wanderRadius;
    const gx = t.homeX + Math.cos(a) * r;
    const gz = t.homeZ + Math.sin(a) * r;
    if (!pointInRect(gx, gz, t.zoneRect) || w.obstacles.some((o) => pointInRect(gx, gz, o, TARGET_RADIUS))) continue;
    t.goalX = gx;
    t.goalZ = gz;
    return;
  }
  t.goalX = t.homeX;
  t.goalZ = t.homeZ;
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
