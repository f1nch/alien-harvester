import { WARDEN, type BossTuning } from "../../content/reactor";
import { dist2, hasLineOfSight, pointInRect, resolveCircle } from "../geometry";
import type { TargetEntity, World } from "../world";
import { damagePlayer } from "./combat";
import { addChill } from "./cold";

export type BossState = "idle" | "chase" | "slamWindup" | "chargeWindup" | "charging" | "stunned" | "recover";

export interface BossRuntime {
  state: BossState;
  /** Seconds left in the current state. */
  timer: number;
  /** Charge direction, locked when the windup starts so the telegraphed lane is honest. */
  dirX: number;
  dirZ: number;
  travelled: number;
  chargeCooldown: number;
  /** A charge damages at most once. */
  chargeHit: boolean;
}

export const BOSS_RADIUS = 0.9;
/** How far past its hall's edge the warden still notices the player. */
const ENGAGE_PAD = 4.5;

export function newBossRuntime(): BossRuntime {
  return { state: "idle", timer: 0, dirX: 0, dirZ: 1, travelled: 0, chargeCooldown: 2, chargeHit: false };
}

export function bossTuning(t: TargetEntity): BossTuning {
  return t.def.bossTuning ?? WARDEN;
}

export function bossStunned(t: TargetEntity): boolean {
  return t.boss?.state === "stunned";
}

/**
 * The reactor warden. It only engages a player inside its hall, telegraphs every
 * attack (slam ring, charge lane), and is stunned after charging, longer if it
 * rams a wall or pillar. Held by tentacles it slows but keeps moving.
 */
export function updateBoss(w: World, t: TargetEntity, dt: number): void {
  const b = t.boss!;
  const T = bossTuning(t);
  const p = w.player;
  const d2 = dist2(t.x, t.z, p.x, p.z);
  // Engages a player in its hall (or just past its edge, so the doorway isn't a safe spot),
  // and always fights back against whoever is holding it.
  const engaged = (t.held || pointInRect(p.x, p.z, t.zoneRect, ENGAGE_PAD)) && p.invulnerable <= 0;
  const speedScale = t.held ? T.heldSlow : 1;
  b.chargeCooldown = Math.max(0, b.chargeCooldown - dt);

  switch (b.state) {
    case "slamWindup":
      b.timer -= dt;
      if (b.timer <= 0) {
        // Pillars and walls are real cover.
        const hit = d2 <= T.slamRadius ** 2 && hasLineOfSight(t.x, t.z, p.x, p.z, w.obstacles) && damagePlayer(w, Math.round(T.slamDamage * w.biome.scale.damage), t);
        // A freezing pulse (the cryo sentinel) also chills whoever it hits.
        if (hit && T.slamChill) addChill(w, T.slamChill);
        w.events.push({ type: "strike", by: t, hit });
        enter(b, "recover", T.recover);
      }
      return;

    case "chargeWindup":
      b.timer -= dt;
      t.heading = Math.atan2(b.dirX, b.dirZ);
      if (b.timer <= 0) {
        b.travelled = 0;
        b.chargeHit = false;
        enter(b, "charging", 0);
      }
      return;

    case "charging": {
      const step = T.chargeSpeed * speedScale * dt;
      const bx = t.x + b.dirX * step;
      const bz = t.z + b.dirZ * step;
      t.x = bx;
      t.z = bz;
      resolveCircle(t, BOSS_RADIUS, t.zoneRect, w.obstacles);
      const blocked = Math.abs(t.x - bx) + Math.abs(t.z - bz) > 1e-3;
      b.travelled += step;
      if (!b.chargeHit && dist2(t.x, t.z, p.x, p.z) <= T.chargeHitRadius ** 2) {
        b.chargeHit = true;
        const hit = damagePlayer(w, Math.round(T.chargeDamage * w.biome.scale.damage), t);
        w.events.push({ type: "strike", by: t, hit });
      }
      if (blocked) {
        // Rammed a wall or pillar: the big opening that rewards baiting the charge.
        enter(b, "stunned", T.stunAfterImpact);
        w.events.push({ type: "bossStunned" });
      } else if (b.travelled >= T.chargeDistance) {
        enter(b, "stunned", T.stunAfterCharge);
      }
      return;
    }

    case "stunned":
    case "recover":
      b.timer -= dt;
      if (b.timer <= 0) {
        b.chargeCooldown = Math.max(b.chargeCooldown, b.state === "stunned" ? T.chargeCooldown : 0);
        enter(b, engaged ? "chase" : "idle", 0);
      }
      return;

    case "idle":
    case "chase": {
      if (!engaged) {
        b.state = "idle";
        // Drift back toward its post.
        stepToward(w, t, t.homeX, t.homeZ, T.walkSpeed * 0.6 * speedScale, dt);
        return;
      }
      b.state = "chase";
      t.heading = Math.atan2(p.x - t.x, p.z - t.z);
      if (d2 <= T.slamTrigger ** 2) {
        enter(b, "slamWindup", T.slamWindup);
        return;
      }
      if (b.chargeCooldown <= 0 && d2 >= T.chargeMin ** 2 && d2 <= T.chargeMax ** 2) {
        const d = Math.sqrt(d2);
        b.dirX = (p.x - t.x) / d;
        b.dirZ = (p.z - t.z) / d;
        enter(b, "chargeWindup", T.chargeWindup);
        return;
      }
      stepToward(w, t, p.x, p.z, T.walkSpeed * speedScale, dt);
    }
  }
}

function enter(b: BossRuntime, state: BossState, seconds: number): void {
  b.state = state;
  b.timer = seconds;
}

function stepToward(w: World, t: TargetEntity, tx: number, tz: number, speed: number, dt: number): void {
  const dx = tx - t.x;
  const dz = tz - t.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return;
  const step = Math.min(d, speed * dt);
  t.x += (dx / d) * step;
  t.z += (dz / d) * step;
  t.heading = Math.atan2(dx, dz);
  resolveCircle(t, BOSS_RADIUS, t.zoneRect, w.obstacles);
}
