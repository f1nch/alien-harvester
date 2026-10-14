import { zoneAt, type MapDef, type Rect } from "../content/map";
import type { PerkId } from "../content/perks";
import { REFINERY, VAT } from "../content/structures";
import type { StructureKind } from "../domain/structures";
import type { DroneMode } from "./systems/structures";
import type { CatcherMode } from "./systems/catcher";
import { newBossRuntime, type BossRuntime } from "./systems/boss";
import type { QuestDef } from "../content/quests";
import type { TargetDef, TargetTypeId } from "../content/targets";
import { currentBiome, scaleReward, type ActiveBiome } from "../domain/biome";
import { computeStats, type PlayerStats, type StatBoost } from "../domain/economy";
import { BOOSTS, FRENZY, SUMMON, type BoostId } from "../content/feeding";
import { COLD } from "../content/cold";
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
  /** From the objective machine's reward wave: no spawn point, pays the wave multiplier. */
  summoned?: boolean;
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
  | { type: "deposited"; drop: CargoDrop; pad: { x: number; z: number } }
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
  | { type: "catcherCaught"; target: TargetEntity }
  | { type: "catcherDeposited" }
  | { type: "bossStunned" }
  | { type: "bossDefeated"; name: string }
  | { type: "reactorRepaired" }
  | { type: "waveSummoned"; count: number }
  | { type: "waveCleared" }
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
  refineryCollectTimer: number;
  /** The catcher's prey and its grip (0..1). Transient: a reload starts the hunt over. */
  catcher: { target: TargetEntity | null; progress: number; mode: CatcherMode };
  catcherPrev: { x: number; z: number };
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
  /** Chill 0..1 from freezing rooms (game/systems/cold.ts). Transient. */
  chill: number;
  /** The chill level the current stats were computed with (steps of COLD.statStep). */
  chillApplied: number;
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
    biome: currentBiome(progress),
    progress,
    stats: computeStats(progress),
    obstacles: [],
    droneObstacles: [],
    vatCollectTimer: 0,
    droneMode: "idle",
    droneBudget: 0,
    dronePrev: { x: progress.structures.drone.x, z: progress.structures.drone.z },
    refineryCollectTimer: 0,
    catcher: { target: null, progress: 0, mode: "idle" },
    catcherPrev: { x: progress.structures.catcher.x, z: progress.structures.catcher.z },
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
    chill: 0,
    chillApplied: 0,
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
  // A paid wave survives a reload: its uncaught creatures come back around the machine.
  spawnSummoned(w);
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
    const { x, z } = w.biome.def.sites.vat;
    const h = VAT.halfSize;
    built.push({ minX: x - h, maxX: x + h, minZ: z - h, maxZ: z + h });
  }
  if (w.progress.structures.refinery.built) {
    const { x, z } = w.biome.def.sites.refinery;
    const h = REFINERY.halfSize;
    built.push({ minX: x - h, maxX: x + h, minZ: z - h, maxZ: z + h });
  }
  w.obstacles = [...w.map.walls, ...w.map.props, ...built, ...lockedDoors];
  w.droneObstacles = [...w.map.walls, ...lockedDoors];
}

export function spawnTarget(w: World, spawnId: string): TargetEntity | null {
  const s = w.map.spawns.find((sp) => sp.id === spawnId);
  if (!s) return null;
  const t = makeTarget(w, w.biome.targets[s.type], spawnId, s.x, s.z, s.wanderRadius);
  w.targets.push(t);
  w.progress.spawnCooldowns[spawnId] = 0;
  return t;
}

/** Spawn point ID shared by every summoned creature (never a key in spawnCooldowns). */
export const SUMMON_SPAWN = "summon";

/**
 * Brings the current wave's uncaught creatures into the world, in a ring around the
 * objective machine. Tops up to progress.summon.left, so calling it twice is harmless.
 */
export function spawnSummoned(w: World): void {
  const types = w.biome.def.summon.types;
  const have = w.targets.filter((t) => t.summoned).length;
  const want = Math.min(w.progress.summon.left, SUMMON.count);
  if (want <= have) return;
  const spots = summonSpots(w);
  for (let i = have; i < want; i++) {
    // Spread over the open spots; with none (never on today's maps), at the player.
    const { x, z } = spots[Math.floor((i * spots.length) / SUMMON.count)] ?? { x: w.player.x, z: w.player.z };
    const base = w.biome.targets[types[i % types.length]!];
    const def: TargetDef = { ...base, reward: scaleReward(base.reward, SUMMON.rewardMultiplier) };
    const t = makeTarget(w, def, SUMMON_SPAWN, x, z, SUMMON.wanderRadius);
    t.summoned = true;
    w.targets.push(t);
  }
}

/**
 * Open floor around the objective machine, inside its room: rings of candidate points,
 * dropping any where a creature would overlap a wall, prop, structure or locked door.
 */
function summonSpots(w: World): Array<{ x: number; z: number }> {
  const o = w.biome.objective;
  const room = zoneAt(w.map, o.x, o.z)?.rect ?? w.map.bounds;
  const r = TARGET_RADIUS + 0.1;
  const out: Array<{ x: number; z: number }> = [];
  for (const radius of [SUMMON.radius, SUMMON.radius + 1.4, SUMMON.radius - 1, SUMMON.radius + 2.8]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = o.x + Math.cos(a) * radius;
      const z = o.z + Math.sin(a) * radius;
      if (x - r < room.minX || x + r > room.maxX || z - r < room.minZ || z + r > room.maxZ) continue;
      if (w.obstacles.some((b) => x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ)) continue;
      out.push({ x, z });
    }
  }
  return out;
}

/**
 * A target left the world by being caught: its spawn point starts its respawn timer,
 * or, for a summoned creature, the wave has one fewer left.
 */
export function retireTarget(w: World, t: TargetEntity): void {
  if (t.summoned) {
    w.progress.summon.left = Math.max(0, w.progress.summon.left - 1);
    if (w.progress.summon.left === 0) w.events.push({ type: "waveCleared" });
  } else w.progress.spawnCooldowns[t.spawnId] = t.def.respawnSeconds;
}

function makeTarget(w: World, def: TargetDef, spawnId: string, x: number, z: number, wanderRadius: number): TargetEntity {
  return {
    id: w.nextId++,
    def,
    spawnId,
    x, z, prevX: x, prevZ: z,
    heading: w.rng() * Math.PI * 2,
    homeX: x, homeZ: z,
    wanderRadius,
    goalX: x, goalZ: z,
    idle: w.rng() * 2,
    progress: 0,
    outOfReach: 0,
    held: false,
    fleeing: false,
    zoneRect: zoneAt(w.map, x, z)?.rect ?? w.map.bounds,
    ai: "patrol",
    aiTimer: 0,
    boss: def.behavior === "boss" ? newBossRuntime() : undefined,
  };
}

/** Call after anything that changes upgrades, perks, the bestiary, or a frenzy or boost. */
export function refreshStats(w: World): void {
  w.stats = computeStats(w.progress, activeBoost(w));
}

/** Percent boosts from a running frenzy and pod power-ups. */
export function activeBoost(w: World): StatBoost {
  const out: StatBoost = {};
  if (w.feeding.frenzy > 0) out.capturePower = FRENZY.powerPercent;
  if (w.chillApplied > 0) {
    out.moveSpeed = -COLD.speedPenalty * w.chillApplied;
    out.capturePower = (out.capturePower ?? 0) - COLD.powerPenalty * w.chillApplied;
  }
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
