import { CATCHER, DRONE, REFINERY, VAT } from "../content/structures";
import { CURRENCIES, roundCents, type Reward, type Wallet } from "../content/currencies";
import type { CargoDrop, ProgressState } from "./progress";
import { currentBiome, scaleAt, scaleReward, scaleRequirements } from "./biome";
import { allMet, evaluate, payCost, type Requirement, type Requirements } from "./requirements";

export interface VatState {
  built: boolean;
  /** 1-based once built. */
  level: number;
  /** Finished batches waiting to be collected. */
  stock: number;
  /** Simulation seconds until the next batch (a remaining duration, never a timestamp). */
  timer: number;
}

/** The refinery runs like the vat; `timer` counts down the batch already paid for. */
export interface RefineryState extends VatState {
  /** A batch's input has been paid and it's in progress. */
  running: boolean;
}

export interface DroneState {
  built: boolean;
  level: number;
  x: number;
  z: number;
  /** Cargo in transit to the base. Persisted so nothing is lost on reload. */
  cargo: CargoDrop[];
}

export type CatcherState = DroneState;

export interface OutpostState {
  /** Built on this floor. Reset when you move on: each floor has its own. */
  built: boolean;
  level: number;
}

export interface StructuresState {
  vat: VatState;
  drone: DroneState;
  refinery: RefineryState;
  catcher: CatcherState;
  outpost: OutpostState;
}

export function newStructures(base: { x: number; z: number }): StructuresState {
  return {
    vat: { built: false, level: 0, stock: 0, timer: 0 },
    drone: { built: false, level: 0, x: base.x, z: base.z, cargo: [] },
    refinery: { built: false, level: 0, stock: 0, timer: 0, running: false },
    catcher: { built: false, level: 0, x: base.x, z: base.z, cargo: [] },
    outpost: { built: false, level: 0 },
  };
}

export function vatLevel(v: VatState) {
  return VAT.levels[Math.max(0, v.level - 1)]!;
}

export function refineryLevel(r: VatState) {
  return REFINERY.levels[Math.max(0, r.level - 1)]!;
}

export function droneCapacity(d: DroneState): number {
  return DRONE.levels[Math.max(0, d.level - 1)]!.capacity;
}

export function catcherLevel(c: CatcherState) {
  return CATCHER.levels[Math.max(0, c.level - 1)]!;
}

export type StructureKind = "vat" | "drone" | "refinery" | "catcher" | "outpost";
export const STRUCTURE_KINDS: readonly StructureKind[] = ["vat", "drone", "refinery", "catcher", "outpost"];

/** Level costs for a kind; the forward base has one level, priced by the floor. */
export function structureLevels(p: ProgressState, kind: StructureKind): ReadonlyArray<{ cost: Reward }> {
  switch (kind) {
    case "vat": return VAT.levels;
    case "drone": return DRONE.levels;
    case "refinery": return REFINERY.levels;
    case "catcher": return CATCHER.levels;
    case "outpost": return [{ cost: currentBiome(p).def.outpost.cost }];
  }
}

/** Requirements for the next step (build or upgrade), or null at max level. */
export function nextStep(p: ProgressState, kind: StructureKind): Requirements | null {
  const s = p.structures[kind];
  const levels = structureLevels(p, kind);
  if (s.built && s.level >= levels.length) return null;
  const next = levels[s.built ? s.level : 0];
  if (!next) return null;
  // Building needs the floor's structure quest (the forward base its own); upgrades only
  // cost resources. Prices grow with depth.
  const def = currentBiome(p).def;
  const gate: Requirements = { quests: [kind === "outpost" ? def.outpost.gate : def.structureGate] };
  return scaleRequirements(s.built ? { cost: next.cost } : { ...gate, cost: next.cost }, p.depth);
}

export function stepRequirements(p: ProgressState, kind: StructureKind): Requirement[] {
  const r = nextStep(p, kind);
  return r ? evaluate(p, r) : [];
}

export type StructureResult = { ok: true; level: number; built: boolean } | { ok: false; reason: "max" | "requirements" };

/** Build or upgrade in one transaction: cost deducted and level raised together. */
export function advanceStructure(p: ProgressState, kind: StructureKind): StructureResult {
  const r = nextStep(p, kind);
  if (!r) return { ok: false, reason: "max" };
  if (!allMet(p, r)) return { ok: false, reason: "requirements" };
  payCost(p, r);
  const s = p.structures[kind];
  const wasBuilt = s.built;
  s.built = true;
  s.level = wasBuilt ? s.level + 1 : 1;
  if (kind === "vat") {
    const vs = s as VatState;
    if (!wasBuilt) vs.stock = 0;
    // A faster level applies to the batch already in progress.
    vs.timer = wasBuilt ? Math.min(vs.timer, vatLevel(vs).batchSeconds) : vatLevel(vs).batchSeconds;
  }
  if (kind === "refinery") {
    const rs = s as RefineryState;
    if (!wasBuilt) {
      rs.stock = 0;
      rs.running = false;
      rs.timer = 0;
    } else {
      rs.timer = Math.min(rs.timer, refineryLevel(rs).batchSeconds);
    }
  }
  return { ok: true, level: s.level, built: !wasBuilt };
}

/**
 * Advance vat production by dt simulation seconds. Production stops at the
 * storage cap and never catches up for time that did not pass in the simulation.
 * `rate` is the production speed multiplier (1 = base).
 */
export function tickVat(v: VatState, dt: number, rate = 1): void {
  if (!v.built) return;
  const lvl = vatLevel(v);
  if (v.stock >= lvl.storage) {
    v.timer = lvl.batchSeconds;
    return;
  }
  v.timer -= dt * rate;
  // Carry any overshoot into the next batch, so production doesn't lose a tick per batch.
  // The small tolerance absorbs float error from summing fixed timesteps.
  if (v.timer <= 1e-9) {
    v.stock += 1;
    v.timer = v.stock >= lvl.storage ? lvl.batchSeconds : Math.max(0, v.timer + lvl.batchSeconds);
  }
}

/** One batch as cargo, worth what the current depth pays. */
export function vatBatchDrop(depth: number): CargoDrop {
  return { type: "vat", weight: VAT.batch.weight, reward: scaleReward(VAT.batch.reward, scaleAt(depth).reward) };
}

/** What one refinery batch takes from the bank at this depth. */
export function refineryInput(depth: number): Wallet {
  const scaled = scaleReward(REFINERY.input, scaleAt(depth).reward);
  const out = {} as Wallet;
  for (const c of CURRENCIES) out[c] = scaled[c] ?? 0;
  return out;
}

export function refineryBatchDrop(depth: number): CargoDrop {
  return { type: "refinery", weight: REFINERY.batch.weight, reward: scaleReward(REFINERY.batch.reward, scaleAt(depth).reward) };
}

/**
 * Refinery production. A batch starts only when there is room for it, its room is open
 * and its input is banked; starting pays the input in the same step. Finished batches wait as stock.
 * Simulation time only, like the vat.
 */
export function tickRefinery(p: ProgressState, dt: number, siteOpen = true): void {
  const r = p.structures.refinery;
  if (!r.built) return;
  const lvl = refineryLevel(r);
  if (!r.running) {
    // A new batch waits until its room is open on this floor (one in progress carries on).
    if (r.stock >= lvl.storage || !siteOpen) return;
    const input = refineryInput(p.depth);
    if (CURRENCIES.some((c) => p.banked[c] < input[c])) return;
    for (const c of CURRENCIES) p.banked[c] = roundCents(p.banked[c] - input[c]);
    r.running = true;
    r.timer = lvl.batchSeconds;
  }
  r.timer -= dt;
  if (r.timer <= 1e-9) {
    r.stock += 1;
    r.running = false;
    r.timer = 0;
  }
}

/** Why the refinery is idle, for the HUD; null while it's working. */
export function refineryIdle(p: ProgressState): "full" | "input" | null {
  const r = p.structures.refinery;
  if (!r.built || r.running) return null;
  if (r.stock >= refineryLevel(r).storage) return "full";
  return "input";
}
