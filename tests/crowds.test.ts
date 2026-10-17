import { describe, expect, it } from "vitest";
import { BIOMES } from "../src/content/biomes";
import { CROWD, crowdPayout, isCrowd, TARGETS, type TargetTypeId } from "../src/content/targets";
import { newProgress } from "../src/domain/progress";
import { createWorld } from "../src/game/world";

describe("crowds", () => {
  it("thickens every crowd type on every floor by about CROWD.density", () => {
    for (const b of BIOMES) {
      const placed = new Map<TargetTypeId, number>();
      const total = new Map<TargetTypeId, number>();
      for (const s of b.map.spawns) {
        total.set(s.type, (total.get(s.type) ?? 0) + 1);
        if (!s.extra) placed.set(s.type, (placed.get(s.type) ?? 0) + 1);
      }
      for (const [type, n] of placed) {
        const want = isCrowd(TARGETS[type]) ? Math.round(n * CROWD.density) : n;
        expect(total.get(type), `${b.id} ${type}`).toBe(want);
      }
    }
  });

  it("gives extras their own IDs and only on crowd types", () => {
    for (const b of BIOMES) {
      const ids = b.map.spawns.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of b.map.spawns.filter((sp) => sp.extra)) {
        expect(s.id).toMatch(/\+\d+$/);
        expect(isCrowd(TARGETS[s.type]), `${b.id} ${s.id}`).toBe(true);
      }
    }
  });

  it("trims crowd payouts by CROWD.payout, and undoes it for fixed-count payouts", () => {
    expect(TARGETS.worker.reward).toEqual({ biomass: 2.86 }); // 3 / 1.05
    expect(TARGETS.boss.reward).toEqual({ parts: 5, biomass: 120, genetic: 10 });
    expect(TARGETS.pod.reward).toEqual({ biomass: 8, genetic: 1 });
    expect(crowdPayout(TARGETS.worker)).toBe(1 / CROWD.payout);
    expect(crowdPayout(TARGETS.pod)).toBe(1);
  });

  it("starts extras off their shared point, clear of each other", () => {
    for (const b of BIOMES) {
      const w = createWorld(b.map, newProgress(b.map));
      for (const t of w.targets.filter((x) => x.spawnId.includes("+"))) {
        const s = b.map.spawns.find((sp) => sp.id === t.spawnId)!;
        const twin = w.targets.find((x) => !x.spawnId.includes("+") && x.homeX === s.x && x.homeZ === s.z);
        expect(Number.isFinite(t.x) && Number.isFinite(t.z)).toBe(true);
        if (twin) expect(Math.hypot(t.x - twin.x, t.z - twin.z), `${b.id} ${t.spawnId}`).toBeGreaterThan(0.3);
      }
    }
  });
});
