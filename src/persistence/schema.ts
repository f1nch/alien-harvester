import { CURRENCIES, emptyWallet } from "../content/currencies";
import { reachableZones, zoneAtOrDoorway, type MapDef } from "../content/map";
import { goalTarget, QUEST_BY_ID } from "../content/quests";
import { isTargetType, TARGETS } from "../content/targets";
import { UPGRADE_IDS } from "../content/upgrades";
import { MAX_TIER } from "../content/evolution";
import { capAtTier, computeStats } from "../domain/economy";
import { newProgress, type CargoDrop, type ProgressState, type QuestState } from "../domain/progress";

export const SCHEMA_VERSION = 4;
export const CONTENT_VERSION = 1;

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
const isNonNeg = (v: unknown): v is number => isNum(v) && v >= 0;

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
  return m.schemaVersion === SCHEMA_VERSION ? m : null;
}


/**
 * Validate an untrusted save (from storage or an import). Returns null if it
 * can't be trusted, so the caller can fall back without overwriting anything.
 */
export function parseSave(raw: unknown, room: MapDef): SaveFile | null {
  if (!isObj(raw)) return null;
  const m = migrate(raw);
  if (!m) return null;
  const p = m.progress;
  if (!isObj(p)) return null;

  const progress = newProgress(room);

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
    progress.upgrades[id] = Math.min(lvl as number, capAtTier(id, progress.evolution));
  }

  // Rebuild drops from content definitions rather than trusting stored numbers,
  // and drop anything beyond current capacity.
  if (!Array.isArray(p.cargo)) return null;
  const capacity = computeStats(progress).cargoCapacity;
  const cargo: CargoDrop[] = [];
  let weight = 0;
  for (const d of p.cargo) {
    if (!isObj(d) || !isTargetType(d.type)) return null;
    const def = TARGETS[d.type];
    if (weight + def.weight > capacity) break;
    weight += def.weight;
    cargo.push({ type: def.id, weight: def.weight, reward: { ...def.reward } });
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
    const def = QUEST_BY_ID.get(id);
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

  if (!isObj(p.spawnCooldowns)) return null;
  // Keep cooldowns only for spawn points that still exist; new ones start alive.
  for (const s of room.spawns) {
    const cd = p.spawnCooldowns[s.id];
    if (cd !== undefined && !isNonNeg(cd)) return null;
    progress.spawnCooldowns[s.id] = Math.min((cd as number | undefined) ?? 0, 600);
  }

  const settings = defaultSettings();
  if (isObj(m.settings)) {
    for (const k of Object.keys(settings) as Array<keyof Settings>) {
      if (typeof m.settings[k] === "boolean") settings[k] = m.settings[k] as boolean;
    }
  }

  return { schemaVersion: SCHEMA_VERSION, contentVersion: CONTENT_VERSION, progress, settings };
}
