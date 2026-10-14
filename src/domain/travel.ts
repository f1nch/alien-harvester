import { currentBiome } from "./biome";
import { computeStats } from "./economy";
import type { ProgressState } from "./progress";
import { vatLevel } from "./structures";

/**
 * Moves the player one biome deeper and resets everything that belongs to a biome:
 * doors, quests, spawn timers and the objective. Kept: currencies, mutations, perks,
 * evolution, XP and built structures. The caller banks all cargo, drone cargo and vat
 * stock first (through bankDrop), in the same synchronous step.
 */
export function enterNextBiome(p: ProgressState): void {
  if (p.cargo.length > 0 || p.structures.drone.cargo.length > 0 || p.structures.vat.stock > 0) {
    throw new Error("enterNextBiome: bank cargo and stock first");
  }
  p.depth += 1;
  const map = currentBiome(p).def.map;
  p.unlockedDoors = [];
  p.quests = {};
  p.reactorRepaired = false;
  p.spawnCooldowns = {};
  for (const s of map.spawns) p.spawnCooldowns[s.id] = 0;
  p.player = { x: map.playerSpawn.x, z: map.playerSpawn.z, health: computeStats(p).maxHealth };
  const { vat, drone } = p.structures;
  // Structures come along at their levels, set up fresh at the new base.
  drone.x = map.base.x;
  drone.z = map.base.z;
  if (vat.built) vat.timer = vatLevel(vat).batchSeconds;
}
