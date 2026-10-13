import { dist2, hasLineOfSight, pointInRect } from "../geometry";
import type { TargetEntity, World } from "../world";
import { inBase } from "./deposit";
import { moveToward, pickGoal, wanderStep } from "./wander";

/** Health restored per second while standing in the base. */
export const BASE_HEAL_PER_SEC = 35;
/** Slow regeneration elsewhere, after a short delay without being hit. */
export const REGEN_PER_SEC = 2;
export const REGEN_DELAY = 4;
/** Grace period after respawning, so the player can't be hit while getting their bearings. */
export const RESPAWN_INVULNERABLE = 2.5;

/**
 * Guard state machine: patrol → chase (sees player) → windup → strike → recover.
 * A guard pulled beyond its leash walks home and ignores the player until it
 * gets there. Held guards can't move but still wind up and strike.
 */
export function updateGuard(w: World, t: TargetEntity, dt: number): void {
  const c = t.def.combat!;
  const p = w.player;
  const toPlayer2 = dist2(t.x, t.z, p.x, p.z);
  const fromHome2 = dist2(t.x, t.z, t.homeX, t.homeZ);

  switch (t.ai) {
    case "windup": {
      t.heading = Math.atan2(p.x - t.x, p.z - t.z);
      t.aiTimer -= dt;
      if (t.aiTimer > 0) return;
      // The strike only lands if the player is still in reach and in sight: dodging the windup works.
      const inReach = toPlayer2 <= c.attackRange * c.attackRange && hasLineOfSight(t.x, t.z, p.x, p.z, w.obstacles);
      const hit = inReach && damagePlayer(w, c.damage, t);
      w.events.push({ type: "strike", by: t, hit });
      t.ai = "recover";
      t.aiTimer = c.cooldownSeconds;
      return;
    }
    case "recover":
      t.aiTimer -= dt;
      if (t.aiTimer <= 0) t.ai = "chase";
      return;
    case "return":
      if (t.held) return;
      t.aiTimer -= dt;
      // Arrived, or the straight path home is blocked (e.g. by a barricade): resume patrolling
      // from here rather than staying passive forever.
      if (fromHome2 < 1 || t.aiTimer <= 0) {
        t.ai = "patrol";
        pickGoal(w, t);
        return;
      }
      moveToward(w, t, t.homeX, t.homeZ, c.chaseSpeed, dt);
      return;
    case "patrol":
    case "chase": {
      if (fromHome2 > c.leashRadius * c.leashRadius && !t.held) {
        startReturn(t);
        return;
      }
      if (canSeePlayer(w, t)) {
        t.ai = "chase";
        if (toPlayer2 <= (c.attackRange * 0.9) ** 2) {
          t.ai = "windup";
          t.aiTimer = c.windupSeconds;
          return;
        }
        // Held guards struggle toward their captor: back off while capturing to stay safe.
        moveToward(w, t, p.x, p.z, t.held ? c.heldCreepSpeed : c.chaseSpeed, dt);
        return;
      }
      if (t.ai === "chase") {
        // Lost sight: go back to patrolling around home.
        t.ai = "patrol";
        pickGoal(w, t);
      }
      if (!t.held) wanderStep(w, t, dt);
    }
  }
}

function canSeePlayer(w: World, t: TargetEntity): boolean {
  const c = t.def.combat!;
  const p = w.player;
  if (p.invulnerable > 0) return false;
  if (dist2(t.x, t.z, p.x, p.z) > c.detectRadius * c.detectRadius) return false;
  // Guards defend their own zone (plus their reach past its edge, so doorways aren't blind
  // spots). A held guard always knows who is holding it.
  if (!t.held && !pointInRect(p.x, p.z, t.zoneRect, c.attackRange + 0.5)) return false;
  return hasLineOfSight(t.x, t.z, p.x, p.z, w.obstacles);
}

/** Head home, giving up after a while if the way is blocked. */
function startReturn(t: TargetEntity): void {
  const c = t.def.combat!;
  t.ai = "return";
  t.aiTimer = (2 * c.leashRadius) / c.chaseSpeed;
}

/** Returns true if damage was applied. */
export function damagePlayer(w: World, amount: number, by: TargetEntity): boolean {
  if (w.player.invulnerable > 0) return false;
  w.progress.player.health = Math.max(0, w.progress.player.health - amount);
  w.player.sinceHit = 0;
  w.events.push({ type: "playerHit", damage: amount, by });
  return true;
}

/** Healing, regeneration, and death. Runs after everything that can deal damage. */
export function updatePlayerHealth(w: World, dt: number): void {
  const p = w.player;
  const prog = w.progress.player;
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.sinceHit += dt;
  if (prog.health <= 0) {
    die(w);
    return;
  }
  const max = w.stats.maxHealth;
  if (inBase(w)) prog.health = Math.min(max, prog.health + BASE_HEAL_PER_SEC * dt);
  else if (p.sinceHit >= REGEN_DELAY) prog.health = Math.min(max, prog.health + REGEN_PER_SEC * dt);
}

/**
 * Return to base with full health. Unbanked cargo is lost; banked resources,
 * upgrades, quests and XP are kept. The first death is forgiven (cargo kept).
 */
export function die(w: World): void {
  const prog = w.progress;
  // The tutorial exemption is only spent when there is cargo to save.
  const forgiven = !prog.firstDeathForgiven && prog.cargo.length > 0;
  const lost = forgiven ? [] : prog.cargo.splice(0);
  if (forgiven) prog.firstDeathForgiven = true;

  // Cancel all capture progress.
  for (let i = 0; i < w.tentacles.length; i++) {
    const t = w.tentacles[i];
    if (t) {
      t.held = false;
      t.progress = 0;
      t.outOfReach = 0;
    }
    w.tentacles[i] = null;
  }
  // Guards lose interest and head home.
  for (const t of w.targets) if (t.def.behavior === "guard" && t.ai !== "patrol") startReturn(t);

  const p = w.player;
  p.x = p.prevX = w.map.base.x;
  p.z = p.prevZ = w.map.base.z;
  p.vx = p.vz = 0;
  p.invulnerable = RESPAWN_INVULNERABLE;
  p.sinceHit = 99;
  prog.player.x = p.x;
  prog.player.z = p.z;
  prog.player.health = w.stats.maxHealth;
  w.depositBudget = 0;
  w.events.push({ type: "died", lost, forgiven });
}
