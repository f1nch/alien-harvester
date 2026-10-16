import { WARDEN, type BossSpecial, type BossTuning } from "../../content/reactor";
import type { Rect } from "../../content/map";
import { dist2, hasLineOfSight, pointInRect, resolveCircle } from "../geometry";
import { spawnBrood, TARGET_RADIUS, type TargetEntity, type World } from "../world";
import { damagePlayer } from "./combat";
import { addChill } from "./cold";

export type BossState =
  | "idle" | "chase" | "slamWindup" | "chargeWindup" | "charging" | "stunned" | "recover"
  /** Rooted while its signature move winds up. */
  | "casting"
  /** Under the floor (the sand wyrm): out of reach, tunnelling toward the player. */
  | "burrowed"
  /** About to burst out where its eruption ring is drawn. Still out of reach. */
  | "erupting";

export type HazardStyle = "ice" | "shell" | "lash" | "erupt" | "spore" | "magma";

/** Where a signature move will land. Locked when it appears, so it can always be dodged. */
export type Hazard =
  | { shape: "circle"; style: HazardStyle; x: number; z: number; radius: number; timer: number; total: number; damage: number; chill?: number; cast: number }
  | { shape: "lane"; style: HazardStyle; x: number; z: number; dirX: number; dirZ: number; length: number; halfWidth: number; timer: number; total: number; damage: number; cast: number };

export interface BossRuntime {
  state: BossState;
  /** Seconds left in the current state. */
  timer: number;
  /** Length of the current state, for telegraphs that fill as it runs out. */
  total: number;
  /** Charge direction, locked when the windup starts so the telegraphed lane is honest. */
  dirX: number;
  dirZ: number;
  travelled: number;
  /** How far the current charge runs (a frenzy's are shorter). */
  chargeLength: number;
  chargeCooldown: number;
  /** A charge damages at most once. */
  chargeHit: boolean;
  /** Seconds until the signature move is ready; only runs while the fight is on. */
  specialCooldown: number;
  /** True from the start of a signature move until the boss is back on its feet. */
  specialActive: boolean;
  /** Frenzy charges still to come after the current one. */
  chain: number;
  /** Telegraphed strikes still to land. */
  hazards: Hazard[];
  /** Numbers each signature move; a move hurts at most once however many of its strikes cover the player. */
  casts: number;
  /** The last cast that hurt the player. */
  castHit: number;
  /** Times it has called its brood (the hive queen), never reset while it lives. */
  broodCalls: number;
}

export const BOSS_RADIUS = 0.9;
/** How far past its hall's edge the warden still notices the player. */
const ENGAGE_PAD = 4.5;
/** Seconds into a fight before the first signature move. */
const FIRST_SPECIAL = 4;

export function newBossRuntime(): BossRuntime {
  return {
    state: "idle", timer: 0, total: 0, dirX: 0, dirZ: 1, travelled: 0, chargeLength: WARDEN.chargeDistance, chargeCooldown: 2, chargeHit: false,
    specialCooldown: FIRST_SPECIAL, specialActive: false, chain: 0, hazards: [], casts: 0, castHit: -1, broodCalls: 0,
  };
}

export function bossTuning(t: TargetEntity): BossTuning {
  return t.def.bossTuning ?? WARDEN;
}

export function bossStunned(t: TargetEntity): boolean {
  return t.boss?.state === "stunned";
}

/** Below the floor: tentacles can't reach it. */
export function bossUntargetable(t: TargetEntity): boolean {
  return t.boss?.state === "burrowed" || t.boss?.state === "erupting";
}

/**
 * A floor boss. It only engages a player inside its hall, telegraphs every attack
 * (slam ring, charge lane, its signature move's strikes), and is stunned after
 * charging, longer if it rams a wall or pillar. Held by tentacles it slows but keeps moving.
 */
export function updateBoss(w: World, t: TargetEntity, dt: number): void {
  const b = t.boss!;
  const T = bossTuning(t);
  const p = w.player;
  landHazards(w, t, dt);
  const d2 = dist2(t.x, t.z, p.x, p.z);
  // Engages a player in its hall (or just past its edge, so the doorway isn't a safe spot),
  // and always fights back against whoever is holding it.
  const engaged = (t.held || pointInRect(p.x, p.z, t.zoneRect, ENGAGE_PAD)) && p.invulnerable <= 0;
  const speedScale = t.held ? T.heldSlow : 1;
  b.chargeCooldown = Math.max(0, b.chargeCooldown - dt);
  if (engaged) b.specialCooldown = Math.max(0, b.specialCooldown - dt);

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
        // Rammed a wall or pillar: the big opening that rewards baiting the charge. Ends a frenzy too.
        b.chain = 0;
        enter(b, "stunned", T.stunAfterImpact);
        w.events.push({ type: "bossStunned" });
      } else if (b.travelled >= b.chargeLength) {
        if (b.chain > 0 && T.special?.kind === "frenzy") {
          // Frenzy: wheel round and go again, with a shorter windup.
          b.chain--;
          aimCharge(b, t, p.x, p.z, T.special.distance);
          enter(b, "chargeWindup", T.special.windup);
        } else enter(b, "stunned", T.stunAfterCharge);
      }
      return;
    }

    case "casting": {
      b.timer -= dt;
      const S = T.special!;
      if (S.kind === "brood" || S.kind === "burrow" || S.kind === "pull") t.heading = Math.atan2(p.x - t.x, p.z - t.z);
      if (S.kind === "pull") pullPlayer(w, t, S);
      if (b.timer > 0) return;
      if (S.kind === "brood") {
        b.broodCalls++;
        callBrood(w, t, S);
        enter(b, "recover", T.recover);
      } else if (S.kind === "burrow") {
        enter(b, "burrowed", S.maxSeconds);
      } else enter(b, "recover", T.recover);
      return;
    }

    case "burrowed": {
      const S = T.special as Extract<BossSpecial, { kind: "burrow" }>;
      b.timer -= dt;
      // Tunnels under walls and pillars, but never leaves its hall.
      const dx = p.x - t.x;
      const dz = p.z - t.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const step = Math.min(d, S.speed * dt);
        t.x += (dx / d) * step;
        t.z += (dz / d) * step;
        t.heading = Math.atan2(dx, dz);
        clampInto(t, t.zoneRect, BOSS_RADIUS);
      }
      if (d <= 0.6 || b.timer <= 0) {
        // The eruption ring is drawn where it is now; the player has the windup to get out.
        b.hazards.push({ shape: "circle", style: "erupt", x: t.x, z: t.z, radius: S.radius, timer: S.eruptWindup, total: S.eruptWindup, damage: S.damage, cast: ++b.casts });
        enter(b, "erupting", S.eruptWindup);
      }
      return;
    }

    case "erupting": {
      b.timer -= dt;
      if (b.timer > 0) return;
      const S = T.special as Extract<BossSpecial, { kind: "burrow" }>;
      // Surface clear of any pillar it tunnelled under. Bursting out leaves it dazed: the opening.
      resolveCircle(t, BOSS_RADIUS, t.zoneRect, w.obstacles);
      enter(b, "stunned", S.stun);
      w.events.push({ type: "bossStunned" });
      return;
    }

    case "stunned":
    case "recover":
      b.timer -= dt;
      if (b.timer <= 0) {
        b.chargeCooldown = Math.max(b.chargeCooldown, b.state === "stunned" ? T.chargeCooldown : 0);
        b.specialActive = false;
        enter(b, engaged ? "chase" : "idle", 0);
      }
      return;

    case "idle":
    case "chase": {
      b.specialActive = false;
      if (!engaged) {
        b.state = "idle";
        // The player left: the brood scatter rather than linger to be picked off from the doorway.
        disperseBrood(w);
        // Drift back toward its post.
        stepToward(w, t, t.homeX, t.homeZ, T.walkSpeed * 0.6 * speedScale, dt);
        return;
      }
      b.state = "chase";
      t.heading = Math.atan2(p.x - t.x, p.z - t.z);
      const S = T.special;
      if (S && b.specialCooldown <= 0 && d2 >= S.minRange ** 2 && d2 <= S.maxRange ** 2 && specialReady(w, b, S)) {
        startSpecial(w, t, S);
        return;
      }
      if (d2 <= T.slamTrigger ** 2) {
        enter(b, "slamWindup", T.slamWindup);
        return;
      }
      if (b.chargeCooldown <= 0 && d2 >= T.chargeMin ** 2 && d2 <= T.chargeMax ** 2) {
        aimCharge(b, t, p.x, p.z, T.chargeDistance);
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
  b.total = seconds;
}

function aimCharge(b: BossRuntime, t: TargetEntity, x: number, z: number, length: number): void {
  b.chargeLength = length;
  const d = Math.hypot(x - t.x, z - t.z);
  if (d < 1e-6) return;
  b.dirX = (x - t.x) / d;
  b.dirZ = (z - t.z) / d;
}

/** The queen won't call more brood while the hall holds her limit, or once she's used up her calls. */
function specialReady(w: World, b: BossRuntime, S: BossSpecial): boolean {
  if (S.kind !== "brood") return true;
  return b.broodCalls < S.calls && w.targets.filter((o) => o.brood).length < S.max;
}

/**
 * Brood scatter back into the hive: gone from the world, along with any capture in
 * progress on them (capture frees tentacles on targets that left). They never respawn.
 */
export function disperseBrood(w: World): void {
  if (!w.targets.some((o) => o.brood)) return;
  const left = w.targets.filter((o) => !o.brood);
  w.events.push({ type: "broodScattered", count: w.targets.length - left.length });
  w.targets = left;
}

/** Wind up the signature move. Strikes are laid down now, so the telegraph runs the whole windup. */
function startSpecial(w: World, t: TargetEntity, S: BossSpecial): void {
  const b = t.boss!;
  const p = w.player;
  b.specialCooldown = S.cooldown;
  b.casts++;
  b.specialActive = true;
  const room = t.zoneRect;
  switch (S.kind) {
    case "frenzy":
      b.chain = S.extraCharges;
      aimCharge(b, t, p.x, p.z, S.distance);
      enter(b, "chargeWindup", S.cast);
      return;
    case "icefall":
      for (let i = 0; i < S.count; i++) {
        // The first falls where the player stands; the rest scatter around them.
        const a = w.rng() * Math.PI * 2;
        const r = i === 0 ? 0 : S.spread * (0.45 + 0.55 * w.rng());
        const u = w.rng();
        const v = w.rng();
        // Scattered pods land anywhere in the hall; spikes fall round the player.
        const spot = i > 0 && S.scatter
          ? { x: room.minX + 1 + u * (room.maxX - room.minX - 2), z: room.minZ + 1 + v * (room.maxZ - room.minZ - 2) }
          : { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r };
        clampInto(spot, room, 0.4);
        const timer = S.delay + i * S.stagger;
        b.hazards.push({ shape: "circle", style: S.style ?? "ice", x: spot.x, z: spot.z, radius: S.radius, timer, total: timer, damage: S.damage, chill: S.chill, cast: b.casts });
      }
      break;
    case "barrage": {
      // A line of shells walking out from the boss, through the player (about the fourth shell) and on.
      const d = Math.max(1e-6, Math.sqrt(d2Of(t, p)));
      const dx = (p.x - t.x) / d;
      const dz = (p.z - t.z) / d;
      const start = Math.max(1.6, d - 3 * S.spacing);
      for (let i = 0; i < S.count; i++) {
        const x = t.x + dx * (start + i * S.spacing);
        const z = t.z + dz * (start + i * S.spacing);
        if (!pointInRect(x, z, room) || insideObstacle(w, x, z)) break;
        const timer = S.delay + i * S.stagger;
        b.hazards.push({ shape: "circle", style: "shell", x, z, radius: S.radius, timer, total: timer, damage: S.damage, cast: b.casts });
      }
      break;
    }
    case "lash": {
      const aim = Math.atan2(p.x - t.x, p.z - t.z);
      for (let i = 0; i < S.lanes; i++) {
        const a = aim + (i - (S.lanes - 1) / 2) * S.spread;
        const dirX = Math.sin(a);
        const dirZ = Math.cos(a);
        // An arm stops at the first wall or pillar in its way.
        const length = laneLength(w, t.x, t.z, dirX, dirZ, S.length, room);
        b.hazards.push({ shape: "lane", style: "lash", x: t.x, z: t.z, dirX, dirZ, length, halfWidth: S.halfWidth, timer: S.delay, total: S.delay, damage: S.damage, cast: b.casts });
      }
      break;
    }
    case "nova":
      // Ring after ring outward. Each ring's eruptions sit a little over a diameter and a
      // half apart (a gap to stand in), and alternate rings are turned half a step.
      for (let k = 0; k < S.waves; k++) {
        const ringR = S.spacing * (k + 1);
        const n = Math.max(3, Math.round((Math.PI * 2 * ringR) / (S.radius * 3.2)));
        const turn = k % 2 ? Math.PI / n : 0;
        const timer = S.delay + k * S.stagger;
        for (let i = 0; i < n; i++) {
          const a = turn + (i / n) * Math.PI * 2;
          const x = t.x + Math.sin(a) * ringR;
          const z = t.z + Math.cos(a) * ringR;
          if (!pointInRect(x, z, room) || insideObstacle(w, x, z)) continue;
          b.hazards.push({ shape: "circle", style: "magma", x, z, radius: S.radius, timer, total: timer, damage: S.damage, cast: b.casts });
        }
      }
      break;
    case "crossfire": {
      const aim = Math.atan2(p.x - t.x, p.z - t.z);
      for (let k = 0; k < 8; k++) {
        // A + aimed at the player, then an x between its arms.
        const a = aim + (k * Math.PI) / 4;
        const dirX = Math.sin(a);
        const dirZ = Math.cos(a);
        const length = laneLength(w, t.x, t.z, dirX, dirZ, S.length, room);
        const timer = S.delay + (k % 2 ? S.second : 0);
        b.hazards.push({ shape: "lane", style: "shell", x: t.x, z: t.z, dirX, dirZ, length, halfWidth: S.halfWidth, timer, total: timer, damage: S.damage, cast: b.casts });
      }
      break;
    }
    case "pull":
      // The crushing ring lands as the cast ends; the pull runs the whole cast.
      b.hazards.push({ shape: "circle", style: "lash", x: t.x, z: t.z, radius: S.radius, timer: S.cast, total: S.cast, damage: S.damage, cast: b.casts });
      break;
    case "brood":
    case "burrow":
      break;
  }
  enter(b, "casting", S.cast);
}

function d2Of(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return dist2(a.x, a.z, b.x, b.z);
}

/** The whirlpool: drags the player toward the boss while they're within reach and in sight. */
function pullPlayer(w: World, t: TargetEntity, S: Extract<BossSpecial, { kind: "pull" }>): void {
  const p = w.player;
  const dx = t.x - p.x;
  const dz = t.z - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.5 || d > S.reach || !hasLineOfSight(t.x, t.z, p.x, p.z, w.obstacles)) return;
  // Current resistance (Webbed limbs) helps against it too.
  const k = S.strength * (1 - w.stats.currentResist / 100);
  p.pullX += (dx / d) * k;
  p.pullZ += (dz / d) * k;
}

/** Count down every laid strike; each that lands hurts the player if they're still in it. */
function landHazards(w: World, t: TargetEntity, dt: number): void {
  const b = t.boss!;
  const p = w.player;
  for (let i = b.hazards.length - 1; i >= 0; i--) {
    const h = b.hazards[i]!;
    h.timer -= dt;
    if (h.timer > 0) continue;
    b.hazards.splice(i, 1);
    // Walls and pillars are cover, as for the slam; and overlapping strikes from one move
    // (the lash's fanned arms, a barrage's shells) hurt once, not once each.
    const covered = hazardCovers(h, p.x, p.z) && hasLineOfSight(h.x, h.z, p.x, p.z, w.obstacles);
    const hit = covered && h.cast !== b.castHit && damagePlayer(w, Math.round(h.damage * w.biome.scale.damage), t);
    if (hit) b.castHit = h.cast;
    if (hit && h.shape === "circle" && h.chill) addChill(w, h.chill);
    w.events.push({ type: "hazardLanded", hazard: h, hit });
  }
}

export function hazardCovers(h: Hazard, x: number, z: number): boolean {
  if (h.shape === "circle") return dist2(h.x, h.z, x, z) <= h.radius ** 2;
  const rx = x - h.x;
  const rz = z - h.z;
  const along = rx * h.dirX + rz * h.dirZ;
  if (along < 0 || along > h.length) return false;
  return Math.abs(rx * h.dirZ - rz * h.dirX) <= h.halfWidth;
}

/** Where brood try to appear, relative to the boss's facing: beside it first, then fanning out. */
const BROOD_SIDES = [2, -2, 1, -1, 3, -3, 0, 4].map((k) => (k * Math.PI) / 4);

/** Brood appear around the boss, on open floor inside its hall. */
function callBrood(w: World, t: TargetEntity, S: Extract<BossSpecial, { kind: "brood" }>): void {
  const room = t.zoneRect;
  const r = TARGET_RADIUS + 0.1;
  let made = 0;
  for (const offset of BROOD_SIDES) {
    if (made >= S.count || w.targets.filter((o) => o.brood).length >= S.max) break;
    const a = t.heading + offset;
    const x = t.x + Math.sin(a) * 2.2;
    const z = t.z + Math.cos(a) * 2.2;
    if (x - r < room.minX || x + r > room.maxX || z - r < room.minZ || z + r > room.maxZ) continue;
    if (w.obstacles.some((o) => x + r > o.minX && x - r < o.maxX && z + r > o.minZ && z - r < o.maxZ)) continue;
    spawnBrood(w, S.type, x, z);
    made++;
  }
  if (made > 0) w.events.push({ type: "broodCalled", count: made });
}

function insideObstacle(w: World, x: number, z: number): boolean {
  return w.obstacles.some((o) => x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ);
}

function laneLength(w: World, x: number, z: number, dirX: number, dirZ: number, max: number, room: Rect): number {
  const step = 0.25;
  for (let s = step; s <= max; s += step) {
    const px = x + dirX * s;
    const pz = z + dirZ * s;
    if (!pointInRect(px, pz, room) || insideObstacle(w, px, pz)) return Math.max(step, s - step);
  }
  return max;
}

function clampInto(pos: { x: number; z: number }, r: Rect, pad: number): void {
  pos.x = Math.min(r.maxX - pad, Math.max(r.minX + pad, pos.x));
  pos.z = Math.min(r.maxZ - pad, Math.max(r.minZ + pad, pos.z));
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
