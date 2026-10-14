import { BIOMES } from "../content/biomes";
import { emptyWallet, type Reward, type Wallet } from "../content/currencies";
import type { Craving } from "./cravings";
import type { MutagenId } from "../content/mutagen";
import type { MapDef } from "../content/map";
import type { PerkId } from "../content/perks";
import type { TargetTypeId } from "../content/targets";
import type { PerkChoice } from "./perks";
import { newStructures, type StructuresState } from "./structures";
import { UPGRADE_IDS, type UpgradeId } from "../content/upgrades";

/** Where a drop came from: a captured target, or a batch from the biomass vat or the refinery. */
export type DropType = TargetTypeId | "vat" | "refinery";

/** A captured, not-yet-banked drop. Cargo is not a spendable wallet. */
export interface CargoDrop {
  type: DropType;
  weight: number;
  reward: Reward;
  /** From an objective machine's reward wave: the reward includes its multiplier. */
  summoned?: true;
}

export interface QuestState {
  /** Progress toward the goal, counted only while the quest is active. */
  count: number;
  /** Completed and reward granted. Rewards are granted exactly once. */
  done: boolean;
}

/**
 * Everything that persists. No wall-clock timestamps: cooldowns are stored as
 * remaining simulation seconds so time away can never advance them.
 */
export interface ProgressState {
  banked: Wallet;
  cargo: CargoDrop[];
  xp: number;
  upgrades: Record<UpgradeId, number>;
  /** What was actually paid into each track (in that track's currency); respec refunds exactly this. */
  upgradeSpent: Record<UpgradeId, number>;
  /** What was paid in each track's second currency (UpgradeDef.extraCost); 0 for tracks without one. */
  upgradeExtraSpent: Record<UpgradeId, number>;
  /** Lifetime mutation levels bought. Respec doesn't reduce it, so gates on it can't be refunded. */
  mutationsBought: number;
  player: { x: number; z: number; health: number };
  /** Remaining respawn seconds per spawn point; 0 means its target is alive. */
  spawnCooldowns: Record<string, number>;
  quests: Record<string, QuestState>;
  unlockedDoors: string[];
  /** Evolution tier; 0 is the starting form. */
  evolution: number;
  /** The first death keeps cargo (tutorial exemption); set once it has been used. */
  firstDeathForgiven: boolean;
  /** Times each perk has been taken. */
  perks: Partial<Record<PerkId, number>>;
  /** Level-up choices not yet made, oldest first. Options are fixed when rolled. */
  pendingPerks: PerkChoice[];
  /** Built structures and helpers, including cargo the drone is carrying. */
  structures: StructuresState;
  /** The completion condition; play continues freely afterwards. */
  reactorRepaired: boolean;
  /** Total simulated play time in seconds (never wall-clock), for the completion screen. */
  playSeconds: number;
  /**
   * Biomes cleared. Picks the current biome and its scaling; never goes down. Doors,
   * quests, spawn timers and reactorRepaired belong to the current biome.
   */
  depth: number;
  /** The hand-made floor being played (a BiomeDef id). Moving on goes to the next in story order. */
  floor: string;
  /** Times each floor has been played, counting the current one: first visits get the story, repeats a numeral. */
  visits: Record<string, number>;
  /** Current cravings (short goals paying mutagen). Reset when moving on. */
  cravings: Craving[];
  /** Cravings rolled so far: seeds the next roll, so reloading never rerolls. */
  cravingRolls: number;
  /** Mutagen mutation levels. Not refunded by respec. */
  mutagenLevels: Partial<Record<MutagenId, number>>;
  /** Lifetime captures per creature type. */
  bestiary: Partial<Record<TargetTypeId, number>>;
  /**
   * The objective machine's reward waves on this floor: waves summoned so far, and
   * summoned creatures not yet caught (a paid wave survives a reload). Reset on moving on.
   */
  summon: { waves: number; left: number };
}

export function newProgress(map: MapDef): ProgressState {
  const upgrades = {} as Record<UpgradeId, number>;
  const upgradeSpent = {} as Record<UpgradeId, number>;
  const upgradeExtraSpent = {} as Record<UpgradeId, number>;
  for (const id of UPGRADE_IDS) {
    upgrades[id] = 0;
    upgradeSpent[id] = 0;
    upgradeExtraSpent[id] = 0;
  }
  const spawnCooldowns: Record<string, number> = {};
  for (const s of map.spawns) spawnCooldowns[s.id] = 0;
  return {
    banked: emptyWallet(),
    cargo: [],
    xp: 0,
    upgrades,
    upgradeSpent,
    upgradeExtraSpent,
    mutationsBought: 0,
    player: { x: map.playerSpawn.x, z: map.playerSpawn.z, health: 100 },
    spawnCooldowns,
    quests: {},
    unlockedDoors: [],
    evolution: 0,
    firstDeathForgiven: false,
    perks: {},
    pendingPerks: [],
    structures: newStructures(map.base),
    reactorRepaired: false,
    playSeconds: 0,
    depth: 0,
    // The floor whose map this is (the first floor for anything else).
    floor: (BIOMES.find((b) => b.map === map) ?? BIOMES[0]!).id,
    visits: { [(BIOMES.find((b) => b.map === map) ?? BIOMES[0]!).id]: 1 },
    cravings: [],
    cravingRolls: 0,
    mutagenLevels: {},
    bestiary: {},
    summon: { waves: 0, left: 0 },
  };
}

export function cargoWeight(cargo: readonly CargoDrop[]): number {
  let w = 0;
  for (const d of cargo) w += d.weight;
  return w;
}
