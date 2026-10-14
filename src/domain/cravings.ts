import { reachableZones, zoneAt } from "../content/map";
import { TARGETS, type TargetTypeId } from "../content/targets";
import { currentBiome, tidy } from "./biome";
import { feedingTuning } from "./mutagen";
import { perkBonuses } from "./perks";
import type { ProgressState } from "./progress";
import { mulberry32 } from "./rng";
import { roundCents } from "../content/currencies";

/**
 * Cravings: the creature's own short hunger goals, always a few at once. Satisfying one
 * pays mutagen and rolls a new one straight away. No real-world timers: "within T
 * seconds" goals count simulation time only.
 */
export type CravingKind = "capture" | "burst" | "bankTrip" | "frenzy" | "prized" | "cleanTrip";

export interface Craving {
  kind: CravingKind;
  /** For "capture": which creature. */
  target?: TargetTypeId;
  goal: number;
  /** For "burst": the window, in seconds. */
  seconds?: number;
  /** For "burst": play time when rolled. Only captures after it count. */
  since?: number;
  progress: number;
  /** Mutagen paid when satisfied. */
  reward: number;
}

export const CRAVING_KINDS: readonly CravingKind[] = ["capture", "burst", "bankTrip", "frenzy", "prized", "cleanTrip"];

/** Roll weights: plain capture goals most often, the special ones now and then. */
const WEIGHTS: Record<CravingKind, number> = { capture: 4, burst: 2, bankTrip: 2, frenzy: 1, prized: 1, cleanTrip: 1 };

/** Captures asked for, by type: fewer of the tougher ones. */
const CAPTURE_GOAL: Partial<Record<TargetTypeId, number>> = {
  worker: 12, runner: 6, technician: 6, guard: 5, armoredGuard: 3,
  cryoScientist: 6, frostRunner: 6, patrolDrone: 5,
  handler: 6, lurker: 6, chimera: 4, specimenTank: 3,
  dockhand: 8, mechanic: 6, loaderMech: 4, fuelCell: 3,
  hiveForager: 8, skitter: 10, hiveWarrior: 4, broodSac: 3,
};

/** A full-enough hold for "bank a full hold": share of capacity. */
export const FULL_HOLD = 0.8;

export function describeCraving(c: Craving): string {
  switch (c.kind) {
    case "capture": {
      const def = TARGETS[c.target!];
      // Things that never move (specimen tanks) are cracked open rather than caught.
      const verb = def.behavior === "static" ? "Crack open" : "Catch";
      return `${verb} ${c.goal} ${def.name.toLowerCase()}${c.goal === 1 ? "" : "s"}`;
    }
    case "burst": return `Catch ${c.goal} within ${c.seconds} s`;
    case "bankTrip": return `Bank ${c.goal} biomass in one trip`;
    case "frenzy": return "Start a feeding frenzy";
    case "prized": return "Catch a prized specimen";
    case "cleanTrip": return "Bank a full hold without being hit";
  }
}

/** Creature types living in rooms the player can reach (no pods, no bosses). */
export function reachableTypes(p: ProgressState): TargetTypeId[] {
  const map = currentBiome(p).def.map;
  const zones = reachableZones(map, p.unlockedDoors);
  const types = new Set<TargetTypeId>();
  for (const s of map.spawns) {
    const zone = zoneAt(map, s.x, s.z);
    if (zone && zones.has(zone.id) && s.type in CAPTURE_GOAL) types.add(s.type);
  }
  return [...types];
}

function rollOne(p: ProgressState, rng: () => number): Craving | null {
  const types = reachableTypes(p);
  const taken = new Set(p.cravings.map((c) => (c.kind === "capture" ? `capture:${c.target}` : c.kind)));
  // Never two of the same kind (or the same creature) at once.
  const options: Array<{ key: string; kind: CravingKind; target?: TargetTypeId; weight: number }> = [];
  for (const kind of CRAVING_KINDS) {
    if (kind === "capture") {
      for (const t of types) if (!taken.has(`capture:${t}`)) options.push({ key: `capture:${t}`, kind, target: t, weight: WEIGHTS.capture / types.length });
    } else if (!taken.has(kind)) {
      options.push({ key: kind, kind, weight: WEIGHTS[kind] });
    }
  }
  if (options.length === 0) return null;
  let r = rng() * options.reduce((a, o) => a + o.weight, 0);
  const pick = options.find((o) => (r -= o.weight) <= 0) ?? options[options.length - 1]!;
  switch (pick.kind) {
    case "capture": {
      const goal = CAPTURE_GOAL[pick.target!]!;
      return { kind: "capture", target: pick.target, goal, progress: 0, reward: goal <= 5 ? 4 : 3 };
    }
    case "burst": return { kind: "burst", goal: rng() < 0.5 ? 3 : 4, seconds: 12, since: p.playSeconds, progress: 0, reward: 4 };
    case "bankTrip": return { kind: "bankTrip", goal: tidy(25 * currentBiome(p).scale.reward), progress: 0, reward: 3 };
    case "frenzy": return { kind: "frenzy", goal: 1, progress: 0, reward: 4 };
    case "prized": return { kind: "prized", goal: 1, progress: 0, reward: 5 };
    case "cleanTrip": return { kind: "cleanTrip", goal: 1, progress: 0, reward: 3 };
  }
}

/**
 * Tops cravings up to the number of slots. Each roll uses the next seeded draw, so a
 * reload never rerolls (the counter is saved).
 */
export function fillCravings(p: ProgressState): void {
  const slots = feedingTuning(p).cravingSlots;
  while (p.cravings.length < slots) {
    const rng = mulberry32(0x6d2b79f5 ^ Math.imul(p.cravingRolls, 0x9e3779b1) ^ p.depth);
    const next = rollOne(p, rng);
    // Nothing left that isn't already craved: leave the slot empty.
    if (!next) return;
    p.cravingRolls += 1;
    // Bounty hunter: fixed into the craving when it's rolled, so what's shown is what's paid.
    next.reward += perkBonuses(p).loop.cravingMutagen;
    p.cravings.push(next);
  }
}

export type CravingEvent =
  | { kind: "capture"; target: TargetTypeId }
  /** Captures within the last `seconds`, made at or after `since`, for each burst craving to judge. */
  | { kind: "burst"; countWithin: (seconds: number, since: number) => number }
  | { kind: "trip"; biomass: number; fullHold: boolean; hit: boolean }
  | { kind: "frenzy" }
  | { kind: "prized" };

/**
 * Advances cravings with everything one moment produced (e.g. a capture that is also a
 * prized catch and starts a frenzy). Satisfied ones pay their mutagen; replacements are
 * rolled once, after every event is judged, so a fresh craving can't be paid by the very
 * thing that made room for it. Returns those satisfied.
 */
export function applyCravingEvents(p: ProgressState, events: readonly CravingEvent[]): Craving[] {
  const done: Craving[] = [];
  for (const c of p.cravings) {
    for (const e of events) judge(c, e);
    if (c.progress >= c.goal) done.push(c);
  }
  if (done.length === 0) return done;
  p.cravings = p.cravings.filter((c) => !done.includes(c));
  for (const c of done) p.banked.mutagen = roundCents(p.banked.mutagen + c.reward);
  fillCravings(p);
  return done;
}

export function applyCravingEvent(p: ProgressState, e: CravingEvent): Craving[] {
  return applyCravingEvents(p, [e]);
}

function judge(c: Craving, e: CravingEvent): void {
  switch (e.kind) {
    case "capture":
      if (c.kind === "capture" && c.target === e.target) c.progress += 1;
      break;
    case "burst":
      if (c.kind === "burst") c.progress = Math.max(c.progress, e.countWithin(c.seconds!, c.since ?? 0));
      break;
    case "trip":
      if (c.kind === "bankTrip") c.progress = Math.max(c.progress, Math.floor(e.biomass));
      if (c.kind === "cleanTrip" && e.fullHold && !e.hit) c.progress = 1;
      break;
    case "frenzy":
      if (c.kind === "frenzy") c.progress = 1;
      break;
    case "prized":
      if (c.kind === "prized") c.progress = 1;
      break;
  }
}
