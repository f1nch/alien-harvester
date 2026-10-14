import { STORM } from "../../content/storm";
import { zoneAtOrDoorway } from "../../content/map";
import { dist2 } from "../geometry";
import { upgradeValue } from "../../domain/economy";
import { refreshStats, type World } from "../world";

export type StormPhase = "calm" | "warning" | "blowing";

/** The storm cycle and how hard it's blowing (0..1). Transient: never saved. */
export interface StormState {
  phase: StormPhase;
  /** Seconds left in the current phase. */
  timer: number;
  /** 0 when calm, ramping to 1 while it blows: drives the haze and the penalty. */
  intensity: number;
}

export function newStorm(): StormState {
  return { phase: "calm", timer: STORM.firstCalmSeconds, intensity: 0 };
}

/** In the shade of a ruin, on the base pad, or in a sheltered room: the storm can't reach you here. */
export function sheltered(w: World): boolean {
  const p = w.player;
  const b = w.map.base;
  if (dist2(p.x, p.z, b.x, b.z) <= b.radius * b.radius) return true;
  if (w.map.shade?.some((s) => dist2(p.x, p.z, s.x, s.z) <= s.radius * s.radius)) return true;
  const zone = zoneAtOrDoorway(w.map, p.x, p.z, w.progress.unlockedDoors);
  return zone?.exposed !== true;
}

export function updateStorm(w: World, dt: number): void {
  if (!w.map.storms) return;
  const s = w.storm;
  s.timer -= dt;
  if (s.timer <= 0) {
    if (s.phase === "calm") {
      s.phase = "warning";
      s.timer = STORM.warnSeconds;
      w.events.push({ type: "stormWarning" });
    } else if (s.phase === "warning") {
      s.phase = "blowing";
      s.timer = STORM.blowSeconds;
      w.events.push({ type: "stormStart" });
    } else {
      s.phase = "calm";
      s.timer = STORM.calmSeconds;
      w.events.push({ type: "stormEnd" });
    }
  }
  const target = s.phase === "blowing" ? 1 : 0;
  const step = dt / STORM.rampSeconds;
  s.intensity = target > s.intensity ? Math.min(target, s.intensity + step) : Math.max(target, s.intensity - step);
  applyStorm(w);
}

/** Percent of capture reach the storm takes right now, after Dust lids (0 when sheltered or calm). */
export function stormReachCut(w: World): number {
  if (w.stormApplied <= 0) return 0;
  return STORM.reachPenalty * w.stormApplied * (1 - Math.min(90, upgradeValue(w.progress, "dustLids")) / 100);
}

/** Stats follow the storm in steps, so they're only recomputed when the penalty changes. */
function applyStorm(w: World): void {
  const felt = sheltered(w) ? 0 : w.storm.intensity;
  const step = felt <= 0 ? 0 : Math.ceil(felt / STORM.statStep) * STORM.statStep;
  if (step === w.stormApplied) return;
  w.stormApplied = step;
  refreshStats(w);
}
