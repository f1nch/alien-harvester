import { zoneAt, type MapDef, type Rect } from "../content/map";
import type { QuestDef } from "../content/quests";
import { TARGETS, type TargetDef } from "../content/targets";
import { computeStats, type PlayerStats } from "../domain/economy";
import { addXp } from "../domain/levels";
import type { CargoDrop, ProgressState } from "../domain/progress";
import { applyQuestEvent, settleQuests, type QuestEvent, type QuestOutcome } from "../domain/quests";
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
  /** True while running from the player. */
  fleeing: boolean;
  /** Targets never leave the zone they spawned in. */
  zoneRect: Rect;
}

export type GameEvent =
  | { type: "captured"; target: TargetEntity; slot: number }
  | { type: "deposited"; drop: CargoDrop }
  | { type: "depositComplete" }
  | { type: "purchased" }
  | { type: "questComplete"; quest: QuestDef }
  | { type: "levelUp"; level: number }
  | { type: "doorUnlocked"; door: string };

export interface World {
  map: MapDef;
  progress: ProgressState;
  stats: PlayerStats;
  /** Walls, props, and locked doors. Rebuilt when a door opens. */
  obstacles: Rect[];
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

export function createWorld(map: MapDef, progress: ProgressState, seed = 1): World {
  const w: World = {
    map,
    progress,
    stats: computeStats(progress),
    obstacles: [],
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
  refreshObstacles(w);
  for (const s of map.spawns) {
    if ((progress.spawnCooldowns[s.id] ?? 0) <= 0) spawnTarget(w, s.id);
  }
  // Quests whose state goal already holds (e.g. migrated saves) complete now.
  pushQuestOutcome(w, settleQuests(progress));
  return w;
}

export function refreshObstacles(w: World): void {
  const open = new Set(w.progress.unlockedDoors);
  w.obstacles = [
    ...w.map.walls,
    ...w.map.props,
    ...w.map.doors.filter((d) => !open.has(d.id)).map((d) => d.rect),
  ];
}

export function spawnTarget(w: World, spawnId: string): TargetEntity | null {
  const s = w.map.spawns.find((sp) => sp.id === spawnId);
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
    fleeing: false,
    zoneRect: zoneAt(w.map, s.x, s.z)?.rect ?? w.map.bounds,
  };
  w.targets.push(t);
  w.progress.spawnCooldowns[spawnId] = 0;
  return t;
}

/** Call after anything that changes upgrades. */
export function refreshStats(w: World): void {
  w.stats = computeStats(w.progress);
}

export function pushQuestOutcome(w: World, out: QuestOutcome): void {
  for (const quest of out.completed) w.events.push({ type: "questComplete", quest });
  for (const level of out.levelsGained) w.events.push({ type: "levelUp", level });
}

export function questEvent(w: World, e: QuestEvent): void {
  pushQuestOutcome(w, applyQuestEvent(w.progress, e));
}

export function gainXp(w: World, amount: number): void {
  for (const level of addXp(w.progress, amount)) w.events.push({ type: "levelUp", level });
}
