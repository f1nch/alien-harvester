import type { RoomDef } from "../content/rooms";
import { TARGETS, type TargetDef } from "../content/targets";
import { computeStats, type PlayerStats } from "../domain/economy";
import type { CargoDrop, ProgressState } from "../domain/progress";
import { SpatialHash } from "./spatialHash";

export const SIM_HZ = 30;
export const SIM_DT = 1 / SIM_HZ;
export const PLAYER_RADIUS = 0.6;
export const TARGET_RADIUS = 0.3;

export interface TargetEntity {
  id: number;
  def: TargetDef;
  spawnId: string;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  heading: number;
  homeX: number;
  homeZ: number;
  wanderRadius: number;
  goalX: number;
  goalZ: number;
  idle: number;
  /** Capture progress 0..1. */
  progress: number;
  /** Seconds the assigned target has been out of reach. */
  outOfReach: number;
  /** True while a tentacle is holding it within reach. */
  held: boolean;
}

export type GameEvent =
  | { type: "captured"; target: TargetEntity; slot: number }
  | { type: "deposited"; drop: CargoDrop }
  | { type: "depositComplete" }
  | { type: "purchased" };

export interface World {
  room: RoomDef;
  progress: ProgressState;
  stats: PlayerStats;
  player: { x: number; z: number; prevX: number; prevZ: number; vx: number; vz: number };
  /** Desired movement, already normalised to length <= 1. */
  input: { x: number; z: number };
  targets: TargetEntity[];
  /** One entry per tentacle; at most one target each. */
  tentacles: Array<TargetEntity | null>;
  hash: SpatialHash<TargetEntity>;
  depositBudget: number;
  cargoFull: boolean;
  events: GameEvent[];
  rng: () => number;
  tick: number;
  nextId: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWorld(room: RoomDef, progress: ProgressState, seed = 1): World {
  const w: World = {
    room,
    progress,
    stats: computeStats(progress),
    player: {
      x: progress.player.x, z: progress.player.z,
      prevX: progress.player.x, prevZ: progress.player.z, vx: 0, vz: 0,
    },
    input: { x: 0, z: 0 },
    targets: [],
    tentacles: [],
    hash: new SpatialHash<TargetEntity>(4),
    depositBudget: 0,
    cargoFull: false,
    events: [],
    rng: mulberry32(seed),
    tick: 0,
    nextId: 1,
  };
  for (const s of room.spawns) {
    if ((progress.spawnCooldowns[s.id] ?? 0) <= 0) spawnTarget(w, s.id);
  }
  return w;
}

export function spawnTarget(w: World, spawnId: string): TargetEntity | null {
  const s = w.room.spawns.find((sp) => sp.id === spawnId);
  if (!s) return null;
  const t: TargetEntity = {
    id: w.nextId++,
    def: TARGETS[s.type],
    spawnId,
    x: s.x, z: s.z, prevX: s.x, prevZ: s.z,
    heading: w.rng() * Math.PI * 2,
    homeX: s.x, homeZ: s.z,
    wanderRadius: s.wanderRadius,
    goalX: s.x, goalZ: s.z,
    idle: w.rng() * 2,
    progress: 0,
    outOfReach: 0,
    held: false,
  };
  w.targets.push(t);
  w.progress.spawnCooldowns[spawnId] = 0;
  return t;
}

/** Call after anything that changes upgrades. */
export function refreshStats(w: World): void {
  w.stats = computeStats(w.progress);
}
