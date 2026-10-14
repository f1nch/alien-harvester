import { CURRENCIES, emptyWallet } from "../content/currencies";
import { reachableZones, zoneAtOrDoorway } from "../content/map";
import { goalTarget } from "../content/quests";
import { isTargetType } from "../content/targets";
import { biomeAt, MAX_DEPTH, type ActiveBiome } from "../domain/biome";
import { UPGRADE_IDS, UPGRADES } from "../content/upgrades";
import { MAX_TIER } from "../content/evolution";
import { MAX_LEVEL } from "../content/levels";
import { CHOICES_PER_LEVEL, isPerkId, PERKS } from "../content/perks";
import { capAt, computeStats, tableCostForLevels } from "../domain/economy";
import { levelForXp } from "../domain/levels";
import { queuePerkChoices } from "../domain/perks";
import { droneCapacity, vatBatchDrop, vatLevel } from "../domain/structures";
import { DRONE, VAT } from "../content/structures";
import { mulberry32 } from "../domain/rng";
import { newProgress, type CargoDrop, type ProgressState, type QuestState } from "../domain/progress";

export const SCHEMA_VERSION = 9;
export const CONTENT_VERSION = 1;

/** The level cap before endless levels (v9). */
const PRE_V9_MAX_LEVEL = 10;

export interface Settings {
  leftHanded: boolean;
  sound: boolean;
  music: boolean;
  reducedEffects: boolean;
}

export interface SaveFile {
  schemaVersion: number;
  contentVersion: number;
  progress: ProgressState;
  settings: Settings;
}

export function defaultSettings(): Settings {
  return { leftHanded: false, sound: true, music: true, reducedEffects: false };
}

export function toSaveFile(progress: ProgressState, settings: Settings): SaveFile {
  // Deep copy so later simulation ticks can't mutate a pending write.
  return structuredClone({
    schemaVersion: SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    progress,
    settings,
  });
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/**
 * Bounds every saved amount. Amounts grow about 1.6x per biome, so this sits far above
 * anything reachable at MAX_DEPTH (~1e66), yet sums of such values can't overflow to Infinity.
 */
export const MAX_AMOUNT = 1e100;
const isNonNeg = (v: unknown): v is number => isNum(v) && v >= 0 && v <= MAX_AMOUNT;

/**
 * Bring older schemas up to date, one version at a time, without mutating the
 * input. Returns null for unknown or newer versions.
 */
function migrate(raw: Obj): Obj | null {
  let m = raw;
  if (m.schemaVersion === 1) {
    // v2 adds quests and doors. Old saves start the quest chain from the beginning.
    const progress = isObj(m.progress) ? { ...m.progress, quests: {}, unlockedDoors: [] } : m.progress;
    m = { ...m, schemaVersion: 2, progress };
  }
  if (m.schemaVersion === 2) {
    // v3 adds the evolution tier; everyone starts in the base form.
    const progress = isObj(m.progress) ? { ...m.progress, evolution: 0 } : m.progress;
    m = { ...m, schemaVersion: 3, progress };
  }
  if (m.schemaVersion === 3) {
    // v4 adds the first-death exemption flag; existing players still get it.
    const progress = isObj(m.progress) ? { ...m.progress, firstDeathForgiven: false } : m.progress;
    m = { ...m, schemaVersion: 4, progress };
  }
  if (m.schemaVersion === 4) {
    // v5 records what was paid per track and lifetime purchases (seeded from current levels).
    // The bump also stops older builds from loading saves that hold the newer tracks.
    if (isObj(m.progress) && isObj(m.progress.upgrades)) {
      const levels = m.progress.upgrades;
      const upgradeSpent: Record<string, number> = {};
      let bought = 0;
      for (const id of UPGRADE_IDS) {
        const raw = Number.isInteger(levels[id]) ? (levels[id] as number) : 0;
        // v4 predates growth past the table, so no real v4 save holds more levels.
        const lvl = Math.min(raw, UPGRADES[id].costs.length);
        upgradeSpent[id] = tableCostForLevels(id, Math.max(0, lvl));
        bought += Math.max(0, lvl);
      }
      m = { ...m, progress: { ...m.progress, upgradeSpent, mutationsBought: bought } };
    }
    m = { ...m, schemaVersion: 5 };
  }
  if (m.schemaVersion === 5) {
    // v6 adds perks. Existing players get the choices for levels they already reached,
    // rolled once after parsing (deterministically from the save) and then saved.
    const progress = isObj(m.progress) ? { ...m.progress, perks: {}, pendingPerks: [] } : m.progress;
    m = { ...m, schemaVersion: 6, progress };
  }
  if (m.schemaVersion === 6) {
    // v7 adds structures (vat, drone); nothing is built yet.
    const progress = isObj(m.progress) ? { ...m.progress, structures: null } : m.progress;
    m = { ...m, schemaVersion: 7, progress };
  }
  if (m.schemaVersion === 7) {
    // v8 adds the reactor completion flag and simulated play time (unknown before: 0).
    const progress = isObj(m.progress) ? { ...m.progress, reactorRepaired: false, playSeconds: 0 } : m.progress;
    m = { ...m, schemaVersion: 8, progress };
  }
  if (m.schemaVersion === 8) {
    // v9 adds biomes. Every earlier save is in the first one.
    const progress = isObj(m.progress) ? { ...m.progress, depth: 0 } : m.progress;
    m = { ...m, schemaVersion: 9, progress };
  }
  return m.schemaVersion === SCHEMA_VERSION ? m : null;
}


/**
 * Rebuild a cargo drop from content definitions rather than trusting stored numbers.
 * Cargo never leaves its biome (it's banked on the way out), so the current depth's
 * payouts are the right ones.
 */
function parseDrop(d: unknown, biome: ActiveBiome): CargoDrop | null {
  if (!isObj(d)) return null;
  if (d.type === "vat") return vatBatchDrop(biome.depth);
  if (!isTargetType(d.type)) return null;
  const def = biome.targets[d.type];
  return { type: def.id, weight: def.weight, reward: { ...def.reward } };
}

/**
 * Validate an untrusted save (from storage or an import). Returns null if it
 * can't be trusted, so the caller can fall back without overwriting anything.
 */
export function parseSave(raw: unknown): SaveFile | null {
  if (!isObj(raw)) return null;
  const m = migrate(raw);
  if (!m) return null;
  const p = m.progress;
  if (!isObj(p)) return null;

  // First: depth picks the biome, which every later check (map, quests, caps, cargo) uses.
  if (!Number.isInteger(p.depth) || (p.depth as number) < 0 || (p.depth as number) > MAX_DEPTH) return null;
  const biome = biomeAt(p.depth as number);
  const room = biome.def.map;
  const progress = newProgress(room);
  progress.depth = biome.depth;

  if (!isObj(p.banked)) return null;
  progress.banked = emptyWallet();
  for (const c of CURRENCIES) {
    const v = p.banked[c] ?? 0;
    if (!isNonNeg(v)) return null;
    progress.banked[c] = v;
  }

  if (!isNonNeg(p.xp)) return null;
  progress.xp = p.xp;

  // Parsed before upgrades: the tier decides each track's level cap.
  if (!Number.isInteger(p.evolution) || (p.evolution as number) < 0) return null;
  progress.evolution = Math.min(p.evolution as number, MAX_TIER);

  if (!isObj(p.upgrades)) return null;
  for (const id of UPGRADE_IDS) {
    const lvl = p.upgrades[id] ?? 0;
    if (!Number.isInteger(lvl) || (lvl as number) < 0) return null;
    progress.upgrades[id] = Math.min(lvl as number, capAt(id, progress.evolution, progress.depth));
  }

  // Perks before cargo and health: they change capacity and maximum health.
  if (!isObj(p.perks)) return null;
  for (const [id, n] of Object.entries(p.perks)) {
    if (!isPerkId(id)) continue; // perk removed from content
    if (!Number.isInteger(n) || (n as number) < 0) return null;
    const max = PERKS[id].maxStacks;
    progress.perks[id] = max === null ? (n as number) : Math.min(n as number, max);
  }

  if (!isObj(p.upgradeSpent)) return null;
  for (const id of UPGRADE_IDS) {
    const spent = p.upgradeSpent[id];
    // Tracks added after this save was written start with nothing spent.
    if (spent !== undefined && !isNonNeg(spent)) return null;
    progress.upgradeSpent[id] = (spent as number | undefined) ?? tableCostForLevels(id, progress.upgrades[id]);
  }
  if (!Number.isInteger(p.mutationsBought) || (p.mutationsBought as number) < 0) return null;
  let levels = 0;
  for (const id of UPGRADE_IDS) levels += progress.upgrades[id];
  progress.mutationsBought = Math.max(p.mutationsBought as number, levels);

  // Rebuild drops from content definitions rather than trusting stored numbers,
  // and drop anything beyond current capacity.
  if (!Array.isArray(p.cargo)) return null;
  const capacity = computeStats(progress).cargoCapacity;
  const cargo: CargoDrop[] = [];
  let weight = 0;
  for (const d of p.cargo) {
    const drop = parseDrop(d, biome);
    if (!drop) return null;
    if (weight + drop.weight > capacity) break;
    weight += drop.weight;
    cargo.push(drop);
  }
  progress.cargo = cargo;


  if (!isObj(p.player) || !isNum(p.player.x) || !isNum(p.player.z) || !isNonNeg(p.player.health)) return null;
  const b = room.bounds;
  progress.player = {
    x: Math.max(b.minX, Math.min(p.player.x, b.maxX)),
    z: Math.max(b.minZ, Math.min(p.player.z, b.maxZ)),
    // A save can't legitimately hold a dead player (death resolves in the same tick), but never load one.
    health: p.player.health > 0 ? Math.min(p.player.health, computeStats(progress).maxHealth) : computeStats(progress).maxHealth,
  };

  if (typeof p.firstDeathForgiven !== "boolean") return null;
  progress.firstDeathForgiven = p.firstDeathForgiven;

  if (!isObj(p.quests)) return null;
  const quests: Record<string, QuestState> = {};
  for (const [id, q] of Object.entries(p.quests)) {
    const def = biome.questById.get(id);
    if (!def) continue; // quest removed from content: drop it
    if (!isObj(q) || !isNonNeg(q.count) || typeof q.done !== "boolean") return null;
    quests[id] = { count: Math.min(q.count, goalTarget(def.goal)), done: q.done };
  }
  progress.quests = quests;

  if (!Array.isArray(p.unlockedDoors)) return null;
  const doorIds = new Set(room.doors.map((d) => d.id));
  for (const id of p.unlockedDoors) {
    if (typeof id !== "string") return null;
    if (doorIds.has(id) && !progress.unlockedDoors.includes(id)) progress.unlockedDoors.push(id);
  }

  // A position the player couldn't have walked to (or outside every zone) returns to spawn.
  const zone = zoneAtOrDoorway(room, progress.player.x, progress.player.z, progress.unlockedDoors);
  if (!zone || !reachableZones(room, progress.unlockedDoors).has(zone.id)) {
    progress.player.x = room.playerSpawn.x;
    progress.player.z = room.playerSpawn.z;
  }

  // After doors are parsed: the drone's position is checked against reachable zones.
  // Structures. A null value (fresh from the v6 migration) means nothing is built.
  if (p.structures !== null) {
    if (!isObj(p.structures) || !isObj(p.structures.vat) || !isObj(p.structures.drone)) return null;
    const v = p.structures.vat;
    if (typeof v.built !== "boolean" || !Number.isInteger(v.level) || !isNonNeg(v.stock) || !isNonNeg(v.timer)) return null;
    const vat = progress.structures.vat;
    vat.built = v.built;
    vat.level = v.built ? Math.min(Math.max(1, v.level as number), VAT.levels.length) : 0;
    if (vat.built) {
      const lvl = vatLevel(vat);
      vat.stock = Math.min(Math.floor(v.stock as number), lvl.storage);
      vat.timer = Math.min(v.timer as number, lvl.batchSeconds);
    }

    const dr = p.structures.drone;
    if (typeof dr.built !== "boolean" || !Number.isInteger(dr.level) || !isNum(dr.x) || !isNum(dr.z) || !Array.isArray(dr.cargo)) return null;
    const drone = progress.structures.drone;
    drone.built = dr.built;
    drone.level = dr.built ? Math.min(Math.max(1, dr.level as number), DRONE.levels.length) : 0;
    // Cargo in transit is kept (rebuilt from content), up to the drone's capacity.
    if (drone.built) {
      const cap = droneCapacity(drone);
      let load = 0;
      for (const d of dr.cargo) {
        const drop = parseDrop(d, biome);
        if (!drop) return null;
        if (load + drop.weight > cap) break;
        load += drop.weight;
        drone.cargo.push(drop);
      }
      const dz = zoneAtOrDoorway(room, dr.x as number, dr.z as number, progress.unlockedDoors);
      if (dz && reachableZones(room, progress.unlockedDoors).has(dz.id)) {
        drone.x = dr.x as number;
        drone.z = dr.z as number;
      }
    }
  }

  if (!isObj(p.spawnCooldowns)) return null;
  // Keep cooldowns only for spawn points that still exist; new ones start alive.
  for (const s of room.spawns) {
    const cd = p.spawnCooldowns[s.id];
    if (cd !== undefined && !isNonNeg(cd)) return null;
    progress.spawnCooldowns[s.id] = Math.min((cd as number | undefined) ?? 0, 600);
  }

  if (!Array.isArray(p.pendingPerks)) return null;
  for (const c of p.pendingPerks) {
    if (!isObj(c) || !Number.isInteger(c.level) || !Array.isArray(c.options)) return null;
    // Grants scale with the level, so it must be one the player has actually reached.
    if ((c.level as number) < 2 || (c.level as number) > levelForXp(progress.xp)) return null;
    // Drop removed perks and duplicates; a choice left empty becomes a biomass cache.
    const options = [...new Set(c.options.filter(isPerkId))].slice(0, CHOICES_PER_LEVEL);
    progress.pendingPerks.push({ level: c.level as number, options: options.length ? options : ["biomassCache"] });
  }
  progress.pendingPerks = progress.pendingPerks.slice(0, MAX_LEVEL);
  // Saves from before perks existed get the choices for levels they already reached.
  if (typeof raw.schemaVersion === "number" && raw.schemaVersion < 6) {
    const levels: number[] = [];
    for (let l = 2; l <= levelForXp(progress.xp); l++) levels.push(l);
    queuePerkChoices(progress, levels, mulberry32(0x9e3779b9 ^ Math.floor(progress.xp)));
  } else if (typeof raw.schemaVersion === "number" && raw.schemaVersion < 9) {
    // Before v9 levels stopped at 10, so XP past that earned nothing. Those levels now
    // exist: queue their choices, rolled from the save so reloading can't reroll them.
    const levels: number[] = [];
    for (let l = PRE_V9_MAX_LEVEL + 1; l <= levelForXp(progress.xp); l++) levels.push(l);
    if (levels.length) queuePerkChoices(progress, levels, mulberry32(0x7f4a7c15 ^ Math.floor(progress.xp)));
  }

  if (typeof p.reactorRepaired !== "boolean" || !isNonNeg(p.playSeconds)) return null;
  progress.reactorRepaired = p.reactorRepaired;
  progress.playSeconds = p.playSeconds;

  const settings = defaultSettings();
  if (isObj(m.settings)) {
    for (const k of Object.keys(settings) as Array<keyof Settings>) {
      if (typeof m.settings[k] === "boolean") settings[k] = m.settings[k] as boolean;
    }
  }

  return { schemaVersion: SCHEMA_VERSION, contentVersion: CONTENT_VERSION, progress, settings };
}
