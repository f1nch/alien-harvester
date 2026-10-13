import { emptyWallet, type Reward, type Wallet } from "../content/currencies";
import type { RoomDef } from "../content/rooms";
import type { TargetTypeId } from "../content/targets";
import { UPGRADE_IDS, type UpgradeId } from "../content/upgrades";

/** A captured, not-yet-banked drop. Cargo is not a spendable wallet. */
export interface CargoDrop {
  type: TargetTypeId;
  weight: number;
  reward: Reward;
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
  player: { x: number; z: number; health: number };
  /** Remaining respawn seconds per spawn point; 0 means its target is alive. */
  spawnCooldowns: Record<string, number>;
}

export function newProgress(room: RoomDef): ProgressState {
  const upgrades = {} as Record<UpgradeId, number>;
  for (const id of UPGRADE_IDS) upgrades[id] = 0;
  const spawnCooldowns: Record<string, number> = {};
  for (const s of room.spawns) spawnCooldowns[s.id] = 0;
  return {
    banked: emptyWallet(),
    cargo: [],
    xp: 0,
    upgrades,
    player: { x: room.playerSpawn.x, z: room.playerSpawn.z, health: 100 },
    spawnCooldowns,
  };
}

export function cargoWeight(cargo: readonly CargoDrop[]): number {
  let w = 0;
  for (const d of cargo) w += d.weight;
  return w;
}
