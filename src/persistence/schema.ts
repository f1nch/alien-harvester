import { CURRENCIES, emptyWallet, roundCents, type Reward } from "../content/currencies";
import { reachableZones, zoneAtOrDoorway, type MapDef } from "../content/map";
import { goalTarget } from "../content/quests";
import { isTargetType, TARGETS } from "../content/targets";
import { isMutagenId, MUTAGEN } from "../content/mutagen";
import { inBestiary } from "../domain/bestiary";
import { CRAVING_KINDS, type Craving, type CravingKind } from "../domain/cravings";
import { feedingTuning } from "../domain/mutagen";
import { biomeAt, floorDef, MAX_DEPTH, scaleAt, scaleCost, scaleReward, type ActiveBiome } from "../domain/biome";
import { BIOMES } from "../content/biomes";
import { SUMMON } from "../content/feeding";
import { UPGRADE_IDS, UPGRADES } from "../content/upgrades";
import { EVOLUTIONS, MAX_TIER } from "../content/evolution";
import { MAX_LEVEL } from "../content/levels";
import { CHOICES_PER_LEVEL, isPerkId, PERKS } from "../content/perks";
import { capAt, computeStats, tableCostForLevels } from "../domain/economy";
import { levelForXp } from "../domain/levels";
import { queuePerkChoices } from "../domain/perks";
import { catcherLevel, droneCapacity, refineryBatchDrop, refineryLevel, vatBatchDrop, vatLevel, type DroneState } from "../domain/structures";
import { CATCHER, DRONE, REFINERY, VAT } from "../content/structures";
import { mulberry32 } from "../domain/rng";
import { newProgress, type CargoDrop, type ProgressState, type QuestState } from "../domain/progress";

export const SCHEMA_VERSION = 16;
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
 * A floor was added to the hand-made list, so depth d now plays BIOMES[d % now] instead of
 * BIOMES[d % before] (new floors are only ever appended, so BIOMES[d % before] is still the
 * floor the save was on). Where that changes the floor, its progress (doors, quests,
 * objective, cravings, the reward wave and the forward base) starts over. Currencies,
 * mutations, evolution and carried cargo are kept, and what was paid into that floor's
 * forward base and an unfinished reward wave is refunded.
 */
function remapFloors(progress: unknown, before: number, now: number, waveGrowth: number): unknown {
  if (!isObj(progress) || !Number.isInteger(progress.depth) || (progress.depth as number) < 0) return progress;
  const depth = progress.depth as number;
  if (depth % before === depth % now) return progress;
  const was = BIOMES[depth % before]!;
  const k = scaleAt(depth).cost;
  const refunds: Reward[] = [];
  const st = progress.structures;
  if (isObj(st) && isObj(st.outpost) && st.outpost.built === true) refunds.push(scaleCost(was.outpost.cost, k));
  const sm = progress.summon;
  if (isObj(sm) && isNum(sm.left) && sm.left > 0 && Number.isInteger(sm.waves) && (sm.waves as number) >= 1) {
    refunds.push(scaleCost(scaleCost(was.summon.cost, k), Math.min(1e6, waveGrowth ** ((sm.waves as number) - 1))));
  }
  let banked = progress.banked;
  if (isObj(banked) && refunds.length) {
    const b: Obj = { ...banked };
    for (const r of refunds) for (const c of CURRENCIES) if (r[c] && isNum(b[c] ?? 0)) b[c] = roundCents(((b[c] as number | undefined) ?? 0) + r[c]!);
    banked = b;
  }
  const structures = isObj(st) && isObj(st.outpost) ? { ...st, outpost: { built: false, level: 0 } } : st;
  return {
    ...progress, banked, unlockedDoors: [], quests: {}, reactorRepaired: false, cravings: [], spawnCooldowns: {},
    summon: { waves: 0, left: 0 }, structures,
  };
}

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
  if (m.schemaVersion === 9) {
    // v10 adds mutagen (a currency, parsed as 0 when absent), cravings, mutagen
    // mutations and the bestiary. Everyone starts with none; cravings roll on load.
    const progress = isObj(m.progress) ? { ...m.progress, cravings: [], cravingRolls: 0, mutagenLevels: {}, bestiary: {} } : m.progress;
    m = { ...m, schemaVersion: 10, progress };
  }
  if (m.schemaVersion === 10) {
    // v11 adds the cryo crystals and alloy currencies and the Thermal fat track; both parse
    // as 0 when absent. The bump stops older builds loading saves that hold them.
    // Before v11 every depth was the facility; odd depths are now Cryo labs, so that
    // floor's progress (facility doors, quests, objective, cravings) starts over there.
    let progress = m.progress;
    if (isObj(progress) && Number.isInteger(progress.depth) && (progress.depth as number) % 2 === 1) {
      progress = { ...progress, unlockedDoors: [], quests: {}, reactorRepaired: false, cravings: [], spawnCooldowns: {} };
    }
    m = { ...m, schemaVersion: 11, progress };
  }
  if (m.schemaVersion === 11) {
    // v12 adds the refinery, the catcher and the forward base; none is built yet.
    const st = isObj(m.progress) ? m.progress.structures : null;
    const structures = isObj(st)
      ? {
          ...st,
          refinery: { built: false, level: 0, stock: 0, timer: 0, running: false },
          catcher: { built: false, level: 0, x: 0, z: 0, cargo: [] },
          outpost: { built: false, level: 0 },
        }
      : st;
    const progress = isObj(m.progress) ? { ...m.progress, structures } : m.progress;
    m = { ...m, schemaVersion: 12, progress };
  }
  if (m.schemaVersion === 12) {
    // v13 adds endless evolution tiers (the tier is still a number; only its cap rose),
    // alloy paid into deep capture-power levels (none yet) and the objective machine's
    // reward waves (none summoned). The bump stops older builds clamping the tier.
    const progress = isObj(m.progress)
      ? { ...m.progress, upgradeExtraSpent: {}, summon: { waves: 0, left: 0 } }
      : m.progress;
    m = { ...m, schemaVersion: 13, progress };
  }
  if (m.schemaVersion === 13) {
    // v14 adds Specimen vaults as the third floor: depth d plays biome d % 3, not d % 2.
    m = { ...m, schemaVersion: 14, progress: remapFloors(m.progress, 2, 3, 1.2) };
  }
  if (m.schemaVersion === 14) {
    // v15 saves which floor is being played, so appending floors (the hangar now, portal
    // worlds later) never moves anyone. Saves stay on the floor they were on (d % 3) with
    // all its progress; new floors come up in story order when they next move on.
    let progress = m.progress;
    if (isObj(progress) && Number.isInteger(progress.depth) && (progress.depth as number) >= 0) {
      // Visits as a run through the three floors to this depth would have made them.
      const d = progress.depth as number;
      const visits: Record<string, number> = {};
      for (let i = 0; i < 3; i++) visits[BIOMES[i]!.id] = d >= i ? Math.floor((d - i) / 3) + 1 : 0;
      progress = { ...progress, floor: BIOMES[d % 3]!.id, visits };
    }
    m = { ...m, schemaVersion: 15, progress };
  }
  if (m.schemaVersion === 15) {
    // v16 adds Vesh, the first portal world: the hive amber currency and the Chitin
    // plating track, both parsing as 0 when absent. Nothing else changes; the bump stops
    // older builds dropping amber they don't know about.
    m = { ...m, schemaVersion: 16 };
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
  if (d.type === "refinery") return refineryBatchDrop(biome.depth);
  if (!isTargetType(d.type)) return null;
  const def = biome.targets[d.type];
  // A reward-wave catch keeps its multiplier, but only for creatures some floor summons
  // (cargo can come from the floor a depth used to be, before v14 added a floor).
  if (d.summoned === true && BIOMES.some((b) => b.summon.types.includes(def.id))) {
    return { type: def.id, weight: def.weight, reward: scaleReward(def.reward, SUMMON.rewardMultiplier), summoned: true };
  }
  return { type: def.id, weight: def.weight, reward: { ...def.reward } };
}

function parseCraving(c: unknown, playSeconds: number, room: MapDef): Craving | null {
  if (!isObj(c) || typeof c.kind !== "string" || !(CRAVING_KINDS as readonly string[]).includes(c.kind)) return null;
  if (!isNonNeg(c.goal) || c.goal < 1 || !isNonNeg(c.progress) || !isNonNeg(c.reward) || c.reward > 1000) return null;
  const kind = c.kind as CravingKind;
  const out: Craving = { kind, goal: c.goal, progress: Math.min(c.progress, c.goal), reward: c.reward };
  if (kind === "capture") {
    if (!isTargetType(c.target) || !inBestiary(c.target) || TARGETS[c.target].behavior === "boss") return null;
    // A creature that doesn't live on this floor could never be caught: the craving re-rolls.
    if (!room.spawns.some((s) => s.type === c.target)) return null;
    out.target = c.target;
  }
  if (kind === "burst") {
    if (!isNum(c.seconds) || c.seconds <= 0 || c.seconds > 600) return null;
    out.seconds = c.seconds;
    // "Within T seconds" counts captures this session only: the window starts again on load.
    out.progress = 0;
    out.since = playSeconds;
  }
  return out;
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
  if (typeof p.floor !== "string" || !floorDef(p.floor)) return null;
  // A run meets floor i no sooner than depth i (depth 0 is always the first floor).
  if ((p.depth as number) < BIOMES.indexOf(floorDef(p.floor)!)) return null;
  const visit = isObj(p.visits) && Number.isInteger(p.visits[p.floor]) ? Math.max(1, Math.min(p.visits[p.floor] as number, MAX_DEPTH + 1)) : 1;
  const biome = biomeAt(p.depth as number, p.floor, visit);
  const room = biome.def.map;
  const progress = newProgress(room);
  progress.depth = biome.depth;
  progress.floor = biome.def.id;
  if (!isObj(p.visits)) return null;
  progress.visits = {};
  for (const [id, n] of Object.entries(p.visits)) {
    if (!floorDef(id)) continue;
    if (!Number.isInteger(n) || (n as number) < 0) return null;
    progress.visits[id] = Math.min(n as number, MAX_DEPTH + 1);
  }
  // The floor being played has been visited at least this once.
  progress.visits[progress.floor] = Math.max(1, progress.visits[progress.floor] ?? 0);

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
  // Endless tier t needs depth t − 1 and depth never goes down, so nothing reachable is higher.
  progress.evolution = Math.min(p.evolution as number, MAX_TIER, Math.max(EVOLUTIONS.length, progress.depth + 1));

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
  if (!isObj(p.upgradeExtraSpent)) return null;
  for (const id of UPGRADE_IDS) {
    const spent = p.upgradeExtraSpent[id] ?? 0;
    if (!isNonNeg(spent)) return null;
    // Only tracks with a second price can have paid one.
    progress.upgradeExtraSpent[id] = UPGRADES[id].extraCost ? spent : 0;
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
    if (!isObj(p.structures.refinery) || !isObj(p.structures.catcher) || !isObj(p.structures.outpost)) return null;
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

    // Helpers: cargo in transit is kept (rebuilt from content), up to capacity.
    const helper = (raw: Obj, out: DroneState, maxLevel: number, capacity: (s: DroneState) => number): boolean => {
      if (typeof raw.built !== "boolean" || !Number.isInteger(raw.level) || !isNum(raw.x) || !isNum(raw.z) || !Array.isArray(raw.cargo)) return false;
      out.built = raw.built;
      out.level = raw.built ? Math.min(Math.max(1, raw.level as number), maxLevel) : 0;
      if (!out.built) return true;
      const cap = capacity(out);
      let load = 0;
      for (const d of raw.cargo) {
        const drop = parseDrop(d, biome);
        if (!drop) return false;
        if (load + drop.weight > cap) break;
        load += drop.weight;
        out.cargo.push(drop);
      }
      const dz = zoneAtOrDoorway(room, raw.x as number, raw.z as number, progress.unlockedDoors);
      if (dz && reachableZones(room, progress.unlockedDoors).has(dz.id)) {
        out.x = raw.x as number;
        out.z = raw.z as number;
      }
      return true;
    };
    if (!helper(p.structures.drone, progress.structures.drone, DRONE.levels.length, droneCapacity)) return null;
    if (!helper(p.structures.catcher, progress.structures.catcher, CATCHER.levels.length, (c) => catcherLevel(c).capacity)) return null;

    const r = p.structures.refinery;
    if (typeof r.built !== "boolean" || !Number.isInteger(r.level) || !isNonNeg(r.stock) || !isNonNeg(r.timer) || typeof r.running !== "boolean") return null;
    const refinery = progress.structures.refinery;
    refinery.built = r.built;
    refinery.level = r.built ? Math.min(Math.max(1, r.level as number), REFINERY.levels.length) : 0;
    if (refinery.built) {
      const lvl = refineryLevel(refinery);
      refinery.stock = Math.min(Math.floor(r.stock as number), lvl.storage);
      // A batch in progress was paid for: it keeps its remaining time.
      refinery.running = r.running;
      refinery.timer = r.running ? Math.min(r.timer as number, lvl.batchSeconds) : 0;
    }

    const o = p.structures.outpost;
    if (typeof o.built !== "boolean" || !Number.isInteger(o.level)) return null;
    progress.structures.outpost.built = o.built;
    progress.structures.outpost.level = o.built ? 1 : 0;
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

  // A paid wave's uncaught creatures come back on load (game/world#spawnSummoned).
  if (!isObj(p.summon) || !Number.isInteger(p.summon.waves) || !isNonNeg(p.summon.waves)) return null;
  if (!Number.isInteger(p.summon.left) || (p.summon.left as number) < 0) return null;
  progress.summon = { waves: p.summon.waves as number, left: Math.min(p.summon.left as number, SUMMON.count) };

  // Mutagen mutations before cravings: they set how many cravings there can be.
  if (!isObj(p.mutagenLevels)) return null;
  for (const [id, lvl] of Object.entries(p.mutagenLevels)) {
    if (!isMutagenId(id)) continue; // removed from content
    if (!Number.isInteger(lvl) || (lvl as number) < 0) return null;
    progress.mutagenLevels[id] = Math.min(lvl as number, MUTAGEN[id].costs.length);
  }

  if (!isObj(p.bestiary)) return null;
  for (const [id, n] of Object.entries(p.bestiary)) {
    if (!isTargetType(id) || !inBestiary(id)) continue;
    if (!Number.isInteger(n) || !isNonNeg(n)) return null;
    progress.bestiary[id] = n as number;
  }

  if (!Array.isArray(p.cravings) || !Number.isInteger(p.cravingRolls) || !isNonNeg(p.cravingRolls)) return null;
  progress.cravingRolls = p.cravingRolls as number;
  // Cravings are rebuilt field by field; anything odd is dropped (a fresh one rolls on load).
  for (const c of p.cravings) {
    const craving = parseCraving(c, progress.playSeconds, room);
    if (craving) progress.cravings.push(craving);
  }
  progress.cravings = progress.cravings.slice(0, feedingTuning(progress).cravingSlots);

  const settings = defaultSettings();
  if (isObj(m.settings)) {
    for (const k of Object.keys(settings) as Array<keyof Settings>) {
      if (typeof m.settings[k] === "boolean") settings[k] = m.settings[k] as boolean;
    }
  }

  return { schemaVersion: SCHEMA_VERSION, contentVersion: CONTENT_VERSION, progress, settings };
}
