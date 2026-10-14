import { cargoWeight, type CargoDrop } from "../../domain/progress";
import { dist2, hasLineOfSight } from "../geometry";
import { gainXp, questEvent, retireTarget, type TargetEntity, type World } from "../world";
import { bossStunned, bossTuning } from "./boss";
import { onCaptured, onHelperCaptured } from "./feeding";

/** Seconds a target may be out of reach before its progress starts to decay. */
export const GRACE_SECONDS = 0.3;
/** Full progress decays to zero over this many seconds once grace expires. */
export const DECAY_SECONDS = 1;

/** Cargo already in the hold plus weight reserved by held targets (each counted once). */
export function committedCargo(w: World): number {
  let reserved = 0;
  for (const t of new Set(w.tentacles)) if (t) reserved += t.def.weight;
  return cargoWeight(w.progress.cargo) + reserved;
}

/**
 * Effective number of tentacles' worth of power on one target. Extra tentacles on a
 * multi-grab target help, but with diminishing returns so a late-game creature
 * still has to work the fight rather than delete it.
 */
export function holderPower(count: number): number {
  return count <= 1 ? count : count ** 0.6;
}

function inReach(w: World, t: TargetEntity): boolean {
  const p = w.player;
  const r = w.stats.captureRadius;
  return dist2(p.x, p.z, t.x, t.z) <= r * r && hasLineOfSight(p.x, p.z, t.x, t.z, w.obstacles);
}

/** Free every tentacle holding `t`, and reset its capture state. */
function releaseTarget(w: World, t: TargetEntity): void {
  t.held = false;
  t.progress = 0;
  t.outOfReach = 0;
  for (let i = 0; i < w.tentacles.length; i++) if (w.tentacles[i] === t) w.tentacles[i] = null;
}

function release(w: World, slot: number): void {
  const t = w.tentacles[slot];
  w.tentacles[slot] = null;
  // A multi-grab target stays held while any other tentacle still has it.
  if (t && !w.tentacles.includes(t)) {
    t.held = false;
    t.progress = 0;
    t.outOfReach = 0;
  }
}

export function updateCapture(w: World, dt: number): void {
  const { stats } = w;

  // Tentacle count can change with upgrades; release any slot beyond the new count.
  while (w.tentacles.length > stats.tentacles) {
    release(w, w.tentacles.length - 1);
    w.tentacles.pop();
  }
  while (w.tentacles.length < stats.tentacles) w.tentacles.push(null);

  // 1. Advance existing assignments; they stay stable while valid. Each target is
  //    processed once; a multi-grab target gains progress from every tentacle on it.
  const holders = new Map<TargetEntity, number>();
  for (const t of w.tentacles) if (t) holders.set(t, (holders.get(t) ?? 0) + 1);
  for (const [t, count] of holders) {
    if (!w.targets.includes(t)) {
      for (let i = 0; i < w.tentacles.length; i++) if (w.tentacles[i] === t) w.tentacles[i] = null;
      continue;
    }
    if (inReach(w, t)) {
      t.held = true;
      t.outOfReach = 0;
      const bonus = bossStunned(t) ? bossTuning(t).stunnedCaptureBonus : 1;
      t.progress += ((stats.capturePower * holderPower(count) * bonus) / t.def.resistance) * dt;
    } else {
      t.held = false;
      t.outOfReach += dt;
      if (t.outOfReach <= GRACE_SECONDS) continue;
      // Past grace, a multi-grab target keeps a single tentacle (to carry its decaying
      // progress) and hands the rest back for other targets.
      if (count > 1) {
        let kept = false;
        for (let i = 0; i < w.tentacles.length; i++) {
          if (w.tentacles[i] !== t) continue;
          if (kept) w.tentacles[i] = null;
          kept = true;
        }
      }
      t.progress -= dt / (t.def.captureDecaySeconds ?? DECAY_SECONDS);
      if (t.progress <= 0) {
        releaseTarget(w, t);
        continue;
      }
    }
    if (t.progress >= 1) complete(w, t);
  }

  // 2. Fill empty slots with the nearest eligible targets.
  if (w.tentacles.includes(null)) assignTentacles(w);

  // Player-facing flag uses the hold only, so it doesn't flicker as tentacles attach and release.
  w.cargoFull = cargoWeight(w.progress.cargo) + lightestTarget(w) > stats.cargoCapacity;
}

function lightestTarget(w: World): number {
  let min = Infinity;
  // Creatures only: a light supply pod mustn't hide that no creature fits any more.
  for (const t of w.targets) if (t.def.weight > 0 && !t.def.loot) min = Math.min(min, t.def.weight);
  return Number.isFinite(min) ? min : 0;
}

function assignTentacles(w: World): void {
  const { stats, player: p } = w;
  w.hash.clear();
  for (const t of w.targets) w.hash.insert(t);
  const inRange = w.hash
    .query(p.x, p.z, stats.captureRadius)
    .filter((t) => hasLineOfSight(p.x, p.z, t.x, t.z, w.obstacles))
    .sort((a, b) => dist2(p.x, p.z, a.x, a.z) - dist2(p.x, p.z, b.x, b.z));

  // Reserve cargo on assignment so simultaneous completions can never overflow.
  let committed = committedCargo(w);
  for (const t of inRange) {
    if (w.tentacles.includes(t)) continue;
    const slot = w.tentacles.indexOf(null);
    if (slot < 0) break;
    if (committed + t.def.weight > stats.cargoCapacity) continue;
    committed += t.def.weight;
    t.progress = 0;
    t.outOfReach = 0;
    t.held = true;
    w.tentacles[slot] = t;
  }
  // Spare tentacles join a multi-grab target (the warden) without resetting its progress.
  for (const t of inRange) {
    if (!t.def.multiGrab || !w.tentacles.includes(t)) continue;
    for (let slot = w.tentacles.indexOf(null); slot >= 0; slot = w.tentacles.indexOf(null)) w.tentacles[slot] = t;
  }
}

/** The catcher's catch: into its own hold. Counts for XP, quests and the bestiary. */
export function catcherComplete(w: World, t: TargetEntity, into: CargoDrop[]): void {
  for (let i = 0; i < w.tentacles.length; i++) if (w.tentacles[i] === t) w.tentacles[i] = null;
  w.targets.splice(w.targets.indexOf(t), 1);
  into.push(dropOf(t));
  retireTarget(w, t);
  w.events.push({ type: "catcherCaught", target: t });
  onHelperCaptured(w, t);
  gainXp(w, t.def.xp);
  questEvent(w, { kind: "capture", target: t.def.id });
}

function complete(w: World, t: TargetEntity): void {
  const slot = w.tentacles.indexOf(t);
  for (let i = 0; i < w.tentacles.length; i++) if (w.tentacles[i] === t) w.tentacles[i] = null;
  w.targets.splice(w.targets.indexOf(t), 1);
  w.progress.cargo.push(dropOf(t));
  retireTarget(w, t);
  w.events.push({ type: "captured", target: t, slot });
  onCaptured(w, t);
  gainXp(w, t.def.xp);
  questEvent(w, { kind: "capture", target: t.def.id });
  if (t.def.behavior === "boss") {
    w.events.push({ type: "bossDefeated", name: t.def.name });
    questEvent(w, { kind: "defeatBoss" });
  }
}

function dropOf(t: TargetEntity): CargoDrop {
  const drop: CargoDrop = { type: t.def.id, weight: t.def.weight, reward: { ...t.def.reward } };
  if (t.summoned) drop.summoned = true;
  return drop;
}
