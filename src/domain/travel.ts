import { currentBiome } from "./biome";
import { computeStats } from "./economy";
import type { ProgressState } from "./progress";
import { vatLevel } from "./structures";

/**
 * Moves the player one biome deeper and resets everything that belongs to a biome:
 * doors, quests, spawn timers and the objective. Kept: currencies, mutations, perks,
 * evolution, XP and built structures (except the forward base). The caller banks all
 * cargo, helper cargo and vat and refinery stock first (through bankDrop), in the same
 * synchronous step.
 */
export function enterNextBiome(p: ProgressState): void {
  const st = p.structures;
  if (p.cargo.length > 0 || st.drone.cargo.length > 0 || st.catcher.cargo.length > 0 || st.vat.stock > 0 || st.refinery.stock > 0) {
    throw new Error("enterNextBiome: bank cargo and stock first");
  }
  p.depth += 1;
  const map = currentBiome(p).def.map;
  p.unlockedDoors = [];
  p.quests = {};
  p.reactorRepaired = false;
  // Cravings name this floor's creatures and rooms: new ones are rolled on arrival.
  p.cravings = [];
  p.spawnCooldowns = {};
  for (const s of map.spawns) p.spawnCooldowns[s.id] = 0;
  p.player = { x: map.playerSpawn.x, z: map.playerSpawn.z, health: computeStats(p).maxHealth };
  const { vat, drone, catcher, outpost } = p.structures;
  // Structures come along at their levels, set up fresh at the new base. A refinery
  // batch already paid for carries on. The forward base belongs to its floor.
  drone.x = catcher.x = map.base.x;
  drone.z = catcher.z = map.base.z;
  if (vat.built) vat.timer = vatLevel(vat).batchSeconds;
  outpost.built = false;
  outpost.level = 0;
}
