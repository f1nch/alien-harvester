import { WARDEN } from "../../content/reactor";
import { dist2, hasLineOfSight, pointInRect, resolveCircle } from "../geometry";
import type { TargetEntity, World } from "../world";
import { damagePlayer } from "./combat";

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
  const p = w.player;
  const d2 = dist2(t.x, t.z, p.x, p.z);
  // Engages a player in its hall (or just past its edge, so the doorway isn't a safe spot),
  // and always fights back against whoever is holding it.
  const engaged = (t.held || pointInRect(p.x, p.z, t.zoneRect, ENGAGE_PAD)) && p.invulnerable <= 0;
  const speedScale = t.held ? WARDEN.heldSlow : 1;
  b.chargeCooldown = Math.max(0, b.chargeCooldown - dt);

  switch (b.state) {
    case "slamWindup":
      b.timer -= dt;
      if (b.timer <= 0) {
        // Pillars and walls are real cover.
        const hit = d2 <= WARDEN.slamRadius ** 2 && hasLineOfSight(t.x, t.z, p.x, p.z, w.obstacles) && damagePlayer(w, WARDEN.slamDamage, t);
        w.events.push({ type: "strike", by: t, hit });
        enter(b, "recover", WARDEN.recover);
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
      const step = WARDEN.chargeSpeed * speedScale * dt;
      const bx = t.x + b.dirX * step;
      const bz = t.z + b.dirZ * step;
      t.x = bx;
      t.z = bz;
      resolveCircle(t, BOSS_RADIUS, t.zoneRect, w.obstacles);
      const blocked = Math.abs(t.x - bx) + Math.abs(t.z - bz) > 1e-3;
      b.travelled += step;
      if (!b.chargeHit && dist2(t.x, t.z, p.x, p.z) <= WARDEN.chargeHitRadius ** 2) {
        b.chargeHit = true;
        const hit = damagePlayer(w, WARDEN.chargeDamage, t);
        w.events.push({ type: "strike", by: t, hit });
      }
      if (blocked) {
        // Rammed a wall or pillar: the big opening that rewards baiting the charge.
        enter(b, "stunned", WARDEN.stunAfterImpact);
        w.events.push({ type: "bossStunned" });
      } else if (b.travelled >= WARDEN.chargeDistance) {
        enter(b, "stunned", WARDEN.stunAfterCharge);
      }
      return;
    }

    case "stunned":
    case "recover":
      b.timer -= dt;
      if (b.timer <= 0) {
        b.chargeCooldown = Math.max(b.chargeCooldown, b.state === "stunned" ? WARDEN.chargeCooldown : 0);
        enter(b, engaged ? "chase" : "idle", 0);
      }
      return;

    case "idle":
    case "chase": {
      if (!engaged) {
        b.state = "idle";
        // Drift back toward its post.
        stepToward(w, t, t.homeX, t.homeZ, WARDEN.walkSpeed * 0.6 * speedScale, dt);
        return;
      }
      b.state = "chase";
      t.heading = Math.atan2(p.x - t.x, p.z - t.z);
      if (d2 <= WARDEN.slamTrigger ** 2) {
        enter(b, "slamWindup", WARDEN.slamWindup);
        return;
      }
      if (b.chargeCooldown <= 0 && d2 >= WARDEN.chargeMin ** 2 && d2 <= WARDEN.chargeMax ** 2) {
        const d = Math.sqrt(d2);
        b.dirX = (p.x - t.x) / d;
        b.dirZ = (p.z - t.z) / d;
        enter(b, "chargeWindup", WARDEN.chargeWindup);
        return;
      }
      stepToward(w, t, p.x, p.z, WARDEN.walkSpeed * speedScale, dt);
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
