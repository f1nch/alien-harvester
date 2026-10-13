import { emptyWallet, type Reward, type Wallet } from "../content/currencies";
import type { MapDef } from "../content/map";
import type { PerkId } from "../content/perks";
import type { TargetTypeId } from "../content/targets";
import type { PerkChoice } from "./perks";
import { UPGRADE_IDS, type UpgradeId } from "../content/upgrades";

/** A captured, not-yet-banked drop. Cargo is not a spendable wallet. */
export interface CargoDrop {
  type: TargetTypeId;
  weight: number;
  reward: Reward;
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
}

export function newProgress(map: MapDef): ProgressState {
  const upgrades = {} as Record<UpgradeId, number>;
  const upgradeSpent = {} as Record<UpgradeId, number>;
  for (const id of UPGRADE_IDS) {
    upgrades[id] = 0;
    upgradeSpent[id] = 0;
  }
  const spawnCooldowns: Record<string, number> = {};
  for (const s of map.spawns) spawnCooldowns[s.id] = 0;
  return {
    banked: emptyWallet(),
    cargo: [],
    xp: 0,
    upgrades,
    upgradeSpent,
    mutationsBought: 0,
    player: { x: map.playerSpawn.x, z: map.playerSpawn.z, health: 100 },
    spawnCooldowns,
    quests: {},
    unlockedDoors: [],
    evolution: 0,
    firstDeathForgiven: false,
    perks: {},
    pendingPerks: [],
  };
}

export function cargoWeight(cargo: readonly CargoDrop[]): number {
  let w = 0;
  for (const d of cargo) w += d.weight;
  return w;
}
