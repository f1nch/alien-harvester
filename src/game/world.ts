import { zoneAt, type MapDef, type Rect } from "../content/map";
import type { PerkId } from "../content/perks";
import { VAT } from "../content/structures";
import type { StructureKind } from "../domain/structures";
import type { DroneMode } from "./systems/structures";
import { newBossRuntime, type BossRuntime } from "./systems/boss";
import type { QuestDef } from "../content/quests";
import type { TargetDef, TargetTypeId } from "../content/targets";
import { biomeAt, type ActiveBiome } from "../domain/biome";
import { computeStats, type PlayerStats, type StatBoost } from "../domain/economy";
import { BOOSTS, FRENZY, type BoostId } from "../content/feeding";
import type { Craving } from "../domain/cravings";
import { feedingTuning } from "../domain/mutagen";
import { fillCravings } from "../domain/cravings";
import { addXp } from "../domain/levels";
import { queuePerkChoices } from "../domain/perks";
import type { CargoDrop, ProgressState } from "../domain/progress";
import { applyQuestEvent, settleQuests, type QuestEvent, type QuestOutcome } from "../domain/quests";
import { mulberry32 } from "../domain/rng";
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
  /** Guard state machine (guards only). */
  ai: GuardState;
  /** Seconds left in the current AI state (windup or recovery). */
  aiTimer: number;
  /** Boss state machine (the warden only). */
  boss?: BossRuntime;
  /** A prized specimen: glows, bolts, and pays a big bonus. Transient. */
  prized?: boolean;
}

/**
 * The moment-to-moment loop (frenzy, prized specimens, pod boosts, trip tracking).
 * Transient: none of it is saved, and it only advances in stepWorld.
 */
export interface Trip {
  biomass: number;
  peak: number;
  hit: boolean;
}

export function newTrip(): Trip {
  return { biomass: 0, peak: 0, hit: false };
}

export interface FeedingState {
  /** Captures in a row; drops when comboTimer runs out. */
  combo: number;
  comboTimer: number;
  /** Seconds of feeding frenzy left (0 when none). */
  frenzy: number;
  /** Seconds until the next prized specimen appears. */
  prizedTimer: number;
  /** Seconds the current prized specimen has left (0 when none). */
  prizedLeft: number;
  /** Seconds left on each active pod power-up. */
  boosts: Partial<Record<BoostId, number>>;
  /** Play-time stamps of recent captures, for "within T seconds" cravings. */
  recentCaptures: number[];
  /**
   * The current trip: since the hold was last empty, the fullest it got, biomass banked
   * at base, and whether the creature was hit.
   */
  trip: Trip;
}

export type GuardState = "patrol" | "chase" | "windup" | "recover" | "return";

export type GameEvent =
  | { type: "captured"; target: TargetEntity; slot: number }
  | { type: "deposited"; drop: CargoDrop }
  | { type: "depositComplete" }
  | { type: "purchased" }
  | { type: "questComplete"; quest: QuestDef }
  | { type: "levelUp"; level: number }
  | { type: "doorUnlocked"; door: string }
  | { type: "evolved"; tier: number }
  | { type: "perkChosen"; perk: PerkId }
  | { type: "structureBuilt"; kind: StructureKind; level: number }
  | { type: "droneLoaded" }
  | { type: "droneDeposited" }
  | { type: "bossStunned" }
  | { type: "bossDefeated" }
  | { type: "reactorRepaired" }
  /** Moved on; the world must be rebuilt for the new biome's map. */
  | { type: "biomeLeft"; depth: number }
  | { type: "frenzyStart" }
  | { type: "frenzyEnd" }
  | { type: "prizedAppeared"; target: TargetEntity }
  | { type: "prizedEscaped" }
  | { type: "prizedCaught"; target: TargetEntity }
  | { type: "boostStarted"; boost: BoostId }
  | { type: "cravingDone"; craving: Craving }
  | { type: "bestiaryMilestone"; target: TargetTypeId; count: number; mutagen: number }
  | { type: "playerHit"; damage: number; by: TargetEntity }
  | { type: "strike"; by: TargetEntity; hit: boolean }
  | { type: "died"; lost: CargoDrop[]; forgiven: boolean };

export interface World {
  map: MapDef;
  /** The biome at the player's depth: scaled targets, quests and objective. */
  biome: ActiveBiome;
  progress: ProgressState;
  stats: PlayerStats;
  /** Walls, props, locked doors, and built structures. Rebuilt when any of those change. */
  obstacles: Rect[];
  /** What the hovering drone collides with: walls and locked doors only. */
  droneObstacles: Rect[];
  vatCollectTimer: number;
  droneMode: DroneMode;
  /** Cargo units the drone may still move this transfer. */
  droneBudget: number;
  /** Drone position at the start of the tick, for render interpolation. */
  dronePrev: { x: number; z: number };
  player: {
    x: number; z: number; prevX: number; prevZ: number; vx: number; vz: number;
    /** Seconds of post-respawn invulnerability remaining. */
    invulnerable: number;
    /** Seconds since last taking damage; regeneration waits for this. */
    sinceHit: number;
  };
  /** Desired movement, already normalised to length <= 1. */
  input: { x: number; z: number };
  targets: TargetEntity[];
  feeding: FeedingState;
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

export { mulberry32 } from "../domain/rng";

export function createWorld(map: MapDef, progress: ProgressState, seed = 1): World {
  const w: World = {
    map,
    biome: biomeAt(progress.depth),
    progress,
    stats: computeStats(progress),
    obstacles: [],
    droneObstacles: [],
    vatCollectTimer: 0,
    droneMode: "idle",
    droneBudget: 0,
    dronePrev: { x: progress.structures.drone.x, z: progress.structures.drone.z },
    player: {
      x: progress.player.x, z: progress.player.z,
      prevX: progress.player.x, prevZ: progress.player.z, vx: 0, vz: 0,
      invulnerable: 0, sinceHit: 99,
    },
    input: { x: 0, z: 0 },
    targets: [],
    tentacles: [],
    feeding: {
      combo: 0, comboTimer: 0, frenzy: 0,
      prizedTimer: feedingTuning(progress).prizedInterval, prizedLeft: 0,
      boosts: {}, recentCaptures: [], trip: newTrip(),
    },
    hash: new SpatialHash<TargetEntity>(4),
    depositBudget: 0,
    cargoFull: false,
    events: [],
    rng: mulberry32(seed),
    tick: 0,
    nextId: 1,
  };
  refreshObstacles(w);
  fillCravings(progress);
  for (const s of map.spawns) {
    if ((progress.spawnCooldowns[s.id] ?? 0) <= 0) spawnTarget(w, s.id);
  }
  // Quests whose state goal already holds (e.g. migrated saves) complete now. Any perk
  // choices this earns are rolled from the save itself, so reloading can't reroll them.
  const sessionRng = w.rng;
  w.rng = mulberry32(0x51ed27 ^ Math.floor(progress.xp) ^ (Object.keys(progress.quests).length << 16));
  pushQuestOutcome(w, settleQuests(progress));
  w.rng = sessionRng;
  return w;
}

export function refreshObstacles(w: World): void {
  const open = new Set(w.progress.unlockedDoors);
  const lockedDoors = w.map.doors.filter((d) => !open.has(d.id)).map((d) => d.rect);
  const built: Rect[] = [];
  if (w.progress.structures.vat.built) {
    const { x, z } = VAT.site;
    const h = VAT.halfSize;
    built.push({ minX: x - h, maxX: x + h, minZ: z - h, maxZ: z + h });
  }
  w.obstacles = [...w.map.walls, ...w.map.props, ...built, ...lockedDoors];
  w.droneObstacles = [...w.map.walls, ...lockedDoors];
}

export function spawnTarget(w: World, spawnId: string): TargetEntity | null {
  const s = w.map.spawns.find((sp) => sp.id === spawnId);
  if (!s) return null;
  const t: TargetEntity = {
    id: w.nextId++,
    def: w.biome.targets[s.type],
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
    ai: "patrol",
    aiTimer: 0,
    boss: s.type === "boss" ? newBossRuntime() : undefined,
  };
  w.targets.push(t);
  w.progress.spawnCooldowns[spawnId] = 0;
  return t;
}

/** Call after anything that changes upgrades, perks, the bestiary, or a frenzy or boost. */
export function refreshStats(w: World): void {
  w.stats = computeStats(w.progress, activeBoost(w));
}

/** Percent boosts from a running frenzy and pod power-ups. */
export function activeBoost(w: World): StatBoost {
  const out: StatBoost = {};
  if (w.feeding.frenzy > 0) out.capturePower = FRENZY.powerPercent;
  for (const [id, left] of Object.entries(w.feeding.boosts) as Array<[BoostId, number]>) {
    if (left <= 0) continue;
    const b = BOOSTS[id];
    out[b.stat] = (out[b.stat] ?? 0) + b.percent;
  }
  return out;
}

export function pushQuestOutcome(w: World, out: QuestOutcome): void {
  for (const quest of out.completed) w.events.push({ type: "questComplete", quest });
  levelsGained(w, out.levelsGained);
}

/** Every level gained (from captures, quests, or dev tools) earns a perk choice, rolled now. */
function levelsGained(w: World, levels: readonly number[]): void {
  if (levels.length === 0) return;
  queuePerkChoices(w.progress, levels, w.rng);
  for (const level of levels) w.events.push({ type: "levelUp", level });
}

export function questEvent(w: World, e: QuestEvent): void {
  pushQuestOutcome(w, applyQuestEvent(w.progress, e));
}

export function gainXp(w: World, amount: number): void {
  levelsGained(w, addXp(w.progress, amount));
}
