import { pointInRect, resolveCircle } from "../geometry";
import { TARGET_RADIUS, type TargetEntity, type World } from "../world";

/** Amble between random points near home, pausing at each. Stays inside the home zone. */
export function wanderStep(w: World, t: TargetEntity, dt: number): void {
  if (t.idle > 0) {
    t.idle -= dt;
    return;
  }
  const dx = t.goalX - t.x;
  const dz = t.goalZ - t.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.1) {
    pickGoal(w, t);
    t.idle = 0.8 + w.rng() * 2.2;
    return;
  }
  if (moveToward(w, t, t.goalX, t.goalZ, t.def.speed, dt)) pickGoal(w, t);
}

/**
 * Step toward a point, colliding with walls and staying in the home zone.
 * Returns true if the move was blocked (pushed back by a solid).
 */
export function moveToward(w: World, t: TargetEntity, gx: number, gz: number, speed: number, dt: number): boolean {
  const dx = gx - t.x;
  const dz = gz - t.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return false;
  const step = Math.min(d, speed * dt);
  t.x += (dx / d) * step;
  t.z += (dz / d) * step;
  t.heading = Math.atan2(dx, dz);
  const bx = t.x;
  const bz = t.z;
  resolveCircle(t, TARGET_RADIUS, t.zoneRect, w.obstacles);
  return Math.abs(bx - t.x) + Math.abs(bz - t.z) > 1e-4;
}

/** Picks a reachable-looking point near home. Walks straight back home if none found. */
export function pickGoal(w: World, t: TargetEntity): void {
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
