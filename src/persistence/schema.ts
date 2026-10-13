import { CURRENCIES, emptyWallet } from "../content/currencies";
import type { RoomDef } from "../content/rooms";
import { isTargetType, TARGETS } from "../content/targets";
import { UPGRADE_IDS, UPGRADES } from "../content/upgrades";
import { computeStats } from "../domain/economy";
import { newProgress, type CargoDrop, type ProgressState } from "../domain/progress";

export const SCHEMA_VERSION = 1;
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

/** Upgrade older schemas in place. Returns null for unknown/newer versions. */
function migrate(raw: Obj): Obj | null {
  const v = raw.schemaVersion;
  if (v === SCHEMA_VERSION) return raw;
  return null;
}


/**
 * Validate an untrusted save (from storage or an import). Returns null if it
 * can't be trusted, so the caller can fall back without overwriting anything.
 */
export function parseSave(raw: unknown, room: RoomDef): SaveFile | null {
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

  if (!isObj(p.upgrades)) return null;
  for (const id of UPGRADE_IDS) {
    const lvl = p.upgrades[id] ?? 0;
    if (!Number.isInteger(lvl) || (lvl as number) < 0) return null;
    progress.upgrades[id] = Math.min(lvl as number, UPGRADES[id].costs.length);
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
    health: Math.min(p.player.health, computeStats(progress).maxHealth),
  };

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
