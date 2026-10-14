import { BIOMES, type BiomeDef, type BiomeObjective } from "../content/biomes";
import { CURRENCIES, roundCents, type Reward } from "../content/currencies";
import type { QuestDef } from "../content/quests";
import { TARGETS, type TargetDef, type TargetTypeId } from "../content/targets";
import type { ProgressState } from "./progress";
import type { Requirement, Requirements } from "./requirements";

/**
 * Per-depth growth. Resistance outpaces payouts, so capture power has to keep up; payouts
 * and costs grow together, so time-to-unlock stays about the same in every biome.
 * See docs/EXPANSION_DESIGN.md (Phase 0).
 */
export const DEPTH_GROWTH = {
  resistance: 1.9,
  reward: 1.6,
  damage: 1.5,
  cost: 1.6,
} as const;

/**
 * The deepest biome. Far beyond play, and chosen so every saved amount stays well inside
 * the save validator's bound (payouts at this depth are ~1.6^300 ≈ 1e61 times today's).
 */
export const MAX_DEPTH = 300;

export interface BiomeScale {
  resistance: number;
  reward: number;
  damage: number;
  cost: number;
}

export function scaleAt(depth: number): BiomeScale {
  return {
    resistance: DEPTH_GROWTH.resistance ** depth,
    reward: DEPTH_GROWTH.reward ** depth,
    damage: DEPTH_GROWTH.damage ** depth,
    cost: DEPTH_GROWTH.cost ** depth,
  };
}

/**
 * Rounds up to a tidy price: whole numbers below 100, then two significant figures
 * (1234 -> 1300). Unchanged when the value is already tidy, so depth 0 keeps its numbers.
 */
export function tidy(n: number): number {
  if (n <= 0) return 0;
  // Float noise (60 * 1.6 = 96.00000000000001) must not round a tidy value up.
  const v = Math.round(n * 1e6) / 1e6;
  if (v < 100) return Math.ceil(v);
  const step = 10 ** (Math.floor(Math.log10(v)) - 1);
  return Math.ceil(v / step - 1e-9) * step;
}

/** Payouts: kept to cents, like every wallet amount. */
export function scaleReward(r: Reward, k: number): Reward {
  const out: Reward = {};
  for (const c of CURRENCIES) {
    const v = r[c];
    if (v) out[c] = roundCents(v * k);
  }
  return out;
}

/** Prices: tidied, so cards read "Pay 1300 biomass" rather than "Pay 1258.29". */
export function scaleCost(r: Reward, k: number): Reward {
  const out: Reward = {};
  for (const c of CURRENCIES) {
    const v = r[c];
    if (v) out[c] = tidy(v * k);
  }
  return out;
}

/** A requirement set with its cost scaled to a depth. Gates (level, quests) are unchanged. */
export function scaleRequirements(r: Requirements, depth: number): Requirements {
  if (!r.cost || depth === 0) return r;
  return { ...r, cost: scaleCost(r.cost, scaleAt(depth).cost) };
}

function scaleTarget(def: TargetDef, s: BiomeScale): TargetDef {
  return {
    ...def,
    resistance: def.resistance * s.resistance,
    reward: scaleReward(def.reward, s.reward),
    xp: Math.round(def.xp * s.reward),
    combat: def.combat ? { ...def.combat, damage: Math.round(def.combat.damage * s.damage) } : undefined,
  };
}

function scaleQuest(q: QuestDef, s: BiomeScale): QuestDef {
  const reward: QuestDef["reward"] = { ...scaleCost(q.reward, s.reward) };
  if (q.reward.xp) reward.xp = Math.round(q.reward.xp * s.reward);
  if (q.goal.kind !== "bank") return { ...q, reward };
  // Banking goals grow with payouts; the number in the title follows.
  const count = tidy(q.goal.count * s.reward);
  return { ...q, reward, goal: { ...q.goal, count }, title: q.title.replace(String(q.goal.count), String(count)) };
}

/** A biome as played at a particular depth: content plus everything scaled to it. */
export interface ActiveBiome {
  depth: number;
  def: BiomeDef;
  /** How many times the hand-made list has repeated before this one (0 the first time). */
  cycle: number;
  /** e.g. "Research wing" or, on a repeat, "Research wing II". */
  name: string;
  /** Story location, e.g. "Facility floor B1"; repeats show their depth instead. */
  region: string;
  /** One line of story on arrival; repeats get a generic one. */
  arrival: string;
  scale: BiomeScale;
  /** Targets with resistance, payouts, XP and damage scaled. */
  targets: Record<TargetTypeId, TargetDef>;
  quests: readonly QuestDef[];
  questById: ReadonlyMap<string, QuestDef>;
  objective: BiomeObjective;
  /** The reward wave's price here. */
  summonCost: Reward;
}

const ROMAN: Array<[number, string]> = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

export function roman(n: number): string {
  let out = "";
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

const cache = new Map<string, ActiveBiome>();

/** The hand-made floor with this persistent ID, if any. */
export function floorDef(id: string): BiomeDef | undefined {
  return BIOMES.find((b) => b.id === id);
}

/** The floor after this one: the next in story order, wrapping round to the first. */
export function nextFloorId(id: string): string {
  const i = BIOMES.findIndex((b) => b.id === id);
  return BIOMES[(i + 1) % BIOMES.length]!.id;
}

/**
 * A floor as played at a depth. Which floor is saved (progress.floor), so appending new
 * floors never changes the floor a player is on. Without one (previews, tests), depth d
 * defaults to the floor a fresh run reaches there: BIOMES[d % length].
 * `visit` is which time this floor is being played (1 = the first, with its story; 2+ get
 * a numeral); without it, a fresh run's count at that depth.
 */
export function biomeAt(depth: number, floor?: string, visit?: number): ActiveBiome {
  const def = (floor !== undefined ? floorDef(floor) : undefined) ?? BIOMES[depth % BIOMES.length]!;
  const index = BIOMES.indexOf(def);
  const cycle = visit !== undefined ? Math.max(0, visit - 1) : depth <= index ? 0 : Math.max(1, Math.floor((depth - index) / BIOMES.length));
  const key = `${def.id}@${depth}#${cycle}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const scale = scaleAt(depth);
  const targets = {} as Record<TargetTypeId, TargetDef>;
  for (const id of Object.keys(TARGETS) as TargetTypeId[]) targets[id] = depth === 0 ? TARGETS[id] : scaleTarget(TARGETS[id], scale);
  const quests = depth === 0 ? def.quests : def.quests.map((q) => scaleQuest(q, scale));
  const biome: ActiveBiome = {
    depth,
    def,
    cycle,
    name: cycle === 0 ? def.name : `${def.name} ${roman(cycle + 1)}`,
    region: cycle === 0 ? def.region : `Depth ${depth}`,
    arrival: cycle === 0 ? def.arrival : "Deeper down. Everything here is tougher, and pays more.",
    scale,
    targets,
    quests,
    questById: new Map(quests.map((q) => [q.id, q])),
    objective: { ...def.objective, repair: scaleRequirements(def.objective.repair, depth) },
    summonCost: depth === 0 ? def.summon.cost : scaleCost(def.summon.cost, scale.cost),
  };
  cache.set(key, biome);
  return biome;
}

export function currentBiome(p: ProgressState): ActiveBiome {
  return biomeAt(p.depth, p.floor, p.visits[p.floor] ?? 1);
}

/** Where the way on leads: the next floor, one deeper. */
export function nextBiome(p: ProgressState): ActiveBiome {
  const next = nextFloorId(p.floor);
  return biomeAt(p.depth + 1, next, (p.visits[next] ?? 0) + 1);
}

/** What still stands between the player and the way on, for the exit card. */
export function clearRequirements(p: ProgressState): Requirement[] {
  const b = currentBiome(p);
  const doors = b.def.map.doors;
  const open = doors.filter((d) => p.unlockedDoors.includes(d.id)).length;
  const out: Requirement[] = [
    { label: "Open every door", met: open === doors.length, progress: `${open} / ${doors.length}` },
  ];
  for (const q of b.quests) {
    if (q.goal.kind !== "defeatBoss") continue;
    const done = p.quests[q.id]?.done === true;
    out.push({ label: `Quest: ${q.title}`, met: done, progress: done ? "Done" : "Not done" });
  }
  out.push({ label: b.objective.task, met: p.reactorRepaired, progress: p.reactorRepaired ? "Done" : "Not done" });
  return out;
}

/** Every door open, the boss beaten and the objective done: the exit opens. */
export function isBiomeCleared(p: ProgressState): boolean {
  return clearRequirements(p).every((r) => r.met);
}
