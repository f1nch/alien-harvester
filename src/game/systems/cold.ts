import { COLD } from "../../content/cold";
import { OUTPOST } from "../../content/structures";
import { zoneAtOrDoorway } from "../../content/map";
import { dist2 } from "../geometry";
import { refreshStats, type World } from "../world";

/** On a heat vent (or a built forward base, which is heated): chill drains fast here. */
export function onHeatVent(w: World): boolean {
  const p = w.player;
  if (w.map.heatVents?.some((v) => dist2(p.x, p.z, v.x, v.z) <= v.radius * v.radius)) return true;
  if (!w.progress.structures.outpost.built) return false;
  const o = w.biome.def.sites.outpost;
  return dist2(p.x, p.z, o.x, o.z) <= OUTPOST.radius * OUTPOST.radius;
}

/** True where chill builds: a freezing room, off the vents. */
export function inCold(w: World): boolean {
  const zone = zoneAtOrDoorway(w.map, w.player.x, w.player.z, w.progress.unlockedDoors);
  return zone?.cold === true && !onHeatVent(w);
}

/** Adds chill (the sentinel's freezing pulse), softened by cold resistance. */
export function addChill(w: World, amount: number): void {
  w.chill = Math.min(1, w.chill + amount * (1 - w.stats.chillResist / 100));
  applyChill(w);
}

export function updateCold(w: World, dt: number): void {
  if (inCold(w)) {
    w.chill = Math.min(1, w.chill + (dt / COLD.fillSeconds) * (1 - w.stats.chillResist / 100));
  } else if (w.chill > 0) {
    w.chill = Math.max(0, w.chill - dt / (onHeatVent(w) ? COLD.ventSeconds : COLD.warmSeconds));
  }
  applyChill(w);
}

/** Stats follow chill in steps, so they're only recomputed when the penalty actually changes. */
function applyChill(w: World): void {
  const step = w.chill <= 0 ? 0 : Math.ceil(w.chill / COLD.statStep) * COLD.statStep;
  if (step === w.chillApplied) return;
  w.chillApplied = step;
  refreshStats(w);
}
