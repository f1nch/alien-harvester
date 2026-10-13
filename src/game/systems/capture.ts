import { cargoWeight } from "../../domain/progress";
import { dist2, hasLineOfSight } from "../geometry";
import { gainXp, questEvent, type TargetEntity, type World } from "../world";

/** Seconds a target may be out of reach before its progress starts to decay. */
export const GRACE_SECONDS = 0.3;
/** Full progress decays to zero over this many seconds once grace expires. */
export const DECAY_SECONDS = 1;

/** Cargo already in the hold plus weight reserved by active tentacles. */
export function committedCargo(w: World): number {
  let reserved = 0;
  for (const t of w.tentacles) if (t) reserved += t.def.weight;
  return cargoWeight(w.progress.cargo) + reserved;
}

function inReach(w: World, t: TargetEntity): boolean {
  const p = w.player;
  const r = w.stats.captureRadius;
  return dist2(p.x, p.z, t.x, t.z) <= r * r && hasLineOfSight(p.x, p.z, t.x, t.z, w.obstacles);
}

function release(w: World, slot: number): void {
  const t = w.tentacles[slot];
  if (t) {
    t.held = false;
    t.progress = 0;
    t.outOfReach = 0;
  }
  w.tentacles[slot] = null;
}

export function updateCapture(w: World, dt: number): void {
  const { stats } = w;

  // Tentacle count can change with upgrades; release any slot beyond the new count.
  while (w.tentacles.length > stats.tentacles) {
    release(w, w.tentacles.length - 1);
    w.tentacles.pop();
  }
  while (w.tentacles.length < stats.tentacles) w.tentacles.push(null);

  // 1. Advance existing assignments; they stay stable while valid.
  for (let slot = 0; slot < w.tentacles.length; slot++) {
    const t = w.tentacles[slot];
    if (!t) continue;
    if (!w.targets.includes(t)) {
      w.tentacles[slot] = null;
      continue;
    }
    if (inReach(w, t)) {
      t.held = true;
      t.outOfReach = 0;
      t.progress += (stats.capturePower / t.def.resistance) * dt;
    } else {
      t.held = false;
      t.outOfReach += dt;
      if (t.outOfReach <= GRACE_SECONDS) continue;
      t.progress -= dt / DECAY_SECONDS;
      if (t.progress <= 0) {
        release(w, slot);
        continue;
      }
    }
    if (t.progress >= 1) complete(w, slot, t);
  }

  // 2. Fill empty slots with the nearest eligible targets.
  if (w.tentacles.includes(null)) assignTentacles(w);

  // Player-facing flag uses the hold only, so it doesn't flicker as tentacles attach and release.
  w.cargoFull = cargoWeight(w.progress.cargo) + lightestTarget(w) > stats.cargoCapacity;
}

function lightestTarget(w: World): number {
  let min = Infinity;
  for (const t of w.targets) min = Math.min(min, t.def.weight);
  return Number.isFinite(min) ? min : 0;
}

function assignTentacles(w: World): void {
  const { stats, player: p } = w;
  w.hash.clear();
  for (const t of w.targets) w.hash.insert(t);
  const candidates = w.hash
    .query(p.x, p.z, stats.captureRadius)
    .filter((t) => !w.tentacles.includes(t) && hasLineOfSight(p.x, p.z, t.x, t.z, w.obstacles))
    .sort((a, b) => dist2(p.x, p.z, a.x, a.z) - dist2(p.x, p.z, b.x, b.z));

  // Reserve cargo on assignment so simultaneous completions can never overflow.
  let committed = committedCargo(w);
  for (const t of candidates) {
    const slot = w.tentacles.indexOf(null);
    if (slot < 0) break;
    if (committed + t.def.weight > stats.cargoCapacity) continue;
    committed += t.def.weight;
    t.progress = 0;
    t.outOfReach = 0;
    t.held = true;
    w.tentacles[slot] = t;
  }
}

function complete(w: World, slot: number, t: TargetEntity): void {
  w.tentacles[slot] = null;
  w.targets.splice(w.targets.indexOf(t), 1);
  w.progress.cargo.push({ type: t.def.id, weight: t.def.weight, reward: { ...t.def.reward } });
  w.progress.spawnCooldowns[t.spawnId] = t.def.respawnSeconds;
  w.events.push({ type: "captured", target: t, slot });
  gainXp(w, t.def.xp);
  questEvent(w, { kind: "capture", target: t.def.id });
}
