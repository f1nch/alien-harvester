import { DRONE, VAT } from "../content/structures";
import type { CargoDrop, ProgressState } from "./progress";
import { scaleAt, scaleReward, scaleRequirements } from "./biome";
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

export interface DroneState {
  built: boolean;
  level: number;
  x: number;
  z: number;
  /** Cargo in transit to the base. Persisted so nothing is lost on reload. */
  cargo: CargoDrop[];
}

export interface StructuresState {
  vat: VatState;
  drone: DroneState;
}

export function newStructures(base: { x: number; z: number }): StructuresState {
  return {
    vat: { built: false, level: 0, stock: 0, timer: 0 },
    drone: { built: false, level: 0, x: base.x, z: base.z, cargo: [] },
  };
}

export function vatLevel(v: VatState) {
  return VAT.levels[Math.max(0, v.level - 1)]!;
}

export function droneCapacity(d: DroneState): number {
  return DRONE.levels[Math.max(0, d.level - 1)]!.capacity;
}

export type StructureKind = "vat" | "drone";

/** Requirements for the next step (build or upgrade), or null at max level. */
export function nextStep(p: ProgressState, kind: StructureKind): Requirements | null {
  const s = p.structures[kind];
  const levels = kind === "vat" ? VAT.levels : DRONE.levels;
  const next = levels[s.built ? s.level : 0];
  if (s.built && s.level >= levels.length) return null;
  if (!next) return null;
  const gate = kind === "vat" ? VAT.build : DRONE.build;
  // Building has a gate; upgrades only cost resources. Prices grow with depth.
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
