import { describe, expect, it } from "vitest";
import { BIOMES, type BiomeDef } from "../src/content/biomes";
import type { Currency as CurrencyId, Reward } from "../src/content/currencies";
import { TARGETS, type TargetDef, type TargetTypeId } from "../src/content/targets";

/**
 * A static pacing model of the portal worlds at depth-0 equivalents (the per-depth scaling
 * in domain/biome.ts multiplies costs and payouts alike, so it cancels out here).
 *
 * Time to clear a world = the captures its quests ask for, the boss, and then enough
 * farming of the world's own creatures to pay for every door, the outpost and the
 * objective, net of what the quests and the boss pay. Farming is a mixed loop: one capture
 * of each non-boss spawn on the map, so the loop yields what the world's spawn mix yields.
 * It runs until the scarcest currency is covered (biomass, in every world so far). Capture
 * time is resistance / power plus a fixed overhead for walking up to it and carrying it home.
 */
export interface PaceAssumptions {
  /** Capture power at depth-0 equivalents. */
  power: number;
  /** Walking up to a creature and carrying it home. */
  overheadSeconds: number;
  /** Dodging the boss's moves, on top of the capture itself. */
  bossFightSeconds: number;
}

export const BASELINE: PaceAssumptions = { power: 30, overheadSeconds: 5, bossFightSeconds: 60 };
const FARMED: readonly CurrencyId[] = ["biomass", "genetic", "parts"];

function captureSeconds(t: TargetDef, a: PaceAssumptions): number {
  return t.resistance / a.power + (t.behavior === "boss" ? a.bossFightSeconds : a.overheadSeconds);
}

type Wallet = Partial<Record<CurrencyId, number>>;

function add(into: Wallet, r: Reward | undefined, k = 1): void {
  for (const [c, v] of Object.entries(r ?? {}) as [CurrencyId, number][]) into[c] = (into[c] ?? 0) + v * k;
}

export interface WorldPace {
  id: string;
  /** The world's own currency (pearls, glass, ...). */
  local: CurrencyId;
  cost: Wallet;
  income: Wallet;
  seconds: number;
}

/** The world's own currency: whatever its boss pays that isn't one of the shared ones. */
function localCurrency(b: BiomeDef, boss: TargetDef): CurrencyId {
  const c = (Object.keys(boss.reward) as CurrencyId[]).find((k) => !FARMED.includes(k));
  if (!c) throw new Error(`${b.id}: boss pays no world currency`);
  return c;
}

export function worldPace(b: BiomeDef, a: PaceAssumptions = BASELINE): WorldPace {
  const cost: Wallet = {};
  for (const d of b.map.doors) add(cost, d.requirements.cost);
  add(cost, b.outpost.cost);
  add(cost, b.objective.repair.cost);

  const income: Wallet = {};
  let seconds = 0;
  for (const q of b.quests) {
    add(income, q.reward);
    if (q.goal.kind === "capture") {
      const { target } = q.goal;
      if (typeof target !== "string" || target === "any") throw new Error(`${q.id}: model a single target`);
      const t = TARGETS[target];
      add(income, t.reward, q.goal.count);
      seconds += captureSeconds(t, a) * q.goal.count;
    }
  }
  const types = b.map.spawns.map((s) => TARGETS[s.type as TargetTypeId]);
  const boss = types.find((t) => t.behavior === "boss");
  if (!boss) throw new Error(`${b.id}: no boss`);
  add(income, boss.reward);
  seconds += captureSeconds(boss, a);

  const loop: Wallet = {};
  let loopSeconds = 0;
  for (const t of types) {
    if (t.behavior === "boss" || t.id === "pod") continue;
    add(loop, t.reward);
    loopSeconds += captureSeconds(t, a);
  }
  const local = localCurrency(b, boss);
  let loops = 0;
  for (const c of [...FARMED, local]) {
    const short = (cost[c] ?? 0) - (income[c] ?? 0);
    if (short > 0) loops = Math.max(loops, short / (loop[c] ?? 0));
  }
  return { id: b.id, local, cost, income, seconds: seconds + loops * loopSeconds };
}

/** Every portal world, in story order. */
const WORLDS = ["vesh", "ashkar", "maren", "pyrra", "thessa", "kharon", "gloam", "aether"];

function paces(a: PaceAssumptions): WorldPace[] {
  return WORLDS.map((id) => {
    const b = BIOMES.find((x) => x.id === id);
    if (!b) throw new Error(`no biome ${id}`);
    return worldPace(b, a);
  });
}

/** Each world paired with the one before it. */
function steps<T>(xs: readonly T[]): [T, T][] {
  return xs.slice(1).map((x, i) => [xs[i] as T, x]);
}

describe("portal world pacing", () => {
  it("follow one another in story order", () => {
    expect(BIOMES.map((b) => b.id).filter((id) => WORLDS.includes(id))).toEqual(WORLDS);
  });

  // Faster and slower players: weak and strong grips, short and long walks.
  const ASSUMPTIONS: PaceAssumptions[] = [
    BASELINE,
    { power: 15, overheadSeconds: 5, bossFightSeconds: 60 },
    { power: 60, overheadSeconds: 5, bossFightSeconds: 60 },
    { power: 30, overheadSeconds: 2, bossFightSeconds: 30 },
    { power: 30, overheadSeconds: 10, bossFightSeconds: 120 },
  ];

  it.each(ASSUMPTIONS)("each later world takes 0-15%% longer than the one before (%o)", (a) => {
    for (const [prev, next] of steps(paces(a))) {
      const ratio = next.seconds / prev.seconds;
      expect(ratio, `${next.id} vs ${prev.id}`).toBeGreaterThanOrEqual(1);
      expect(ratio, `${next.id} vs ${prev.id}`).toBeLessThanOrEqual(1.15);
    }
  });

  it("pins the baseline step at about 8% a world", () => {
    for (const [prev, next] of steps(paces(BASELINE))) {
      expect(next.seconds / prev.seconds, `${next.id} vs ${prev.id}`).toBeCloseTo(1.08, 1);
    }
  });

  // Worlds are side trips off the facility (EXPANSION_DESIGN.md, portal rooms), so they
  // were cut by a third: the first takes about 26 minutes, the last about 45.
  it("keeps the first world a side trip of about 26 minutes", () => {
    const first = paces(BASELINE)[0];
    expect(first?.seconds).toBeGreaterThan(23 * 60);
    expect(first?.seconds).toBeLessThan(29 * 60);
  });

  it("asks a little more of each world's own currency than the last", () => {
    for (const [prev, next] of steps(paces(BASELINE))) {
      const ratio = (next.cost[next.local] ?? 0) / (prev.cost[prev.local] ?? 0);
      expect(ratio, `${next.id} vs ${prev.id}`).toBeGreaterThanOrEqual(1);
      expect(ratio, `${next.id} vs ${prev.id}`).toBeLessThanOrEqual(1.1);
    }
  });
});
