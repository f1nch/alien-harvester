import { describe, expect, it } from "vitest";
import { BIOMES } from "../src/content/biomes";
import { LATE_CURRENCIES } from "../src/content/currencies";
import { carveWalls, reachableZones, rect, zoneAt, type Rect } from "../src/content/map";
import type { BossSpecial } from "../src/content/reactor";
import { TARGETS, type TargetTypeId } from "../src/content/targets";
import { nextFloorId } from "../src/domain/biome";
import { newProgress } from "../src/domain/progress";
import { enterNextBiome } from "../src/domain/travel";
import { stepWorld } from "../src/game/step";
import { bossUntargetable, hazardCovers } from "../src/game/systems/boss";
import { createWorld, SIM_DT, type TargetEntity, type World } from "../src/game/world";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";

const LATE = ["pyrra", "thessa", "kharon", "gloam", "aether"];
const lateBiomes = BIOMES.filter((b) => LATE.includes(b.id));

const inside = (r: Rect, x: number, z: number) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
const touches = (a: Rect, b: Rect) =>
  a.minX <= b.maxX + 1e-6 && a.maxX >= b.minX - 1e-6 && a.minZ <= b.maxZ + 1e-6 && a.maxZ >= b.minZ - 1e-6;

describe("carved walls", () => {
  it("fill everything that isn't a room or a doorway, and never cover either", () => {
    const bounds = rect(-20, 20, 0, 40);
    const rooms = [rect(-8, 8, 0, 15), rect(9, 20, 5, 12), rect(-6, 6, 16, 40)];
    const doors = [rect(8, 9, 7, 10), rect(-1.5, 1.5, 15, 16)];
    const walls = carveWalls(bounds, rooms, doors);
    for (let x = -19.75; x < 20; x += 0.5) {
      for (let z = 0.25; z < 40; z += 0.5) {
        const open = [...rooms, ...doors].some((r) => inside(r, x, z));
        const wall = walls.some((r) => inside(r, x, z));
        expect(open !== wall, `${x},${z}`).toBe(true);
      }
    }
    // Merged into a handful of blocks, not a cell per grid square.
    expect(walls.length).toBeLessThan(15);
  });
});

describe("the later portal worlds", () => {
  it("follow Maren in story order and lead back round to the facility", () => {
    expect(BIOMES.map((b) => b.id).slice(6)).toEqual(["maren", ...LATE]);
    expect(nextFloorId("maren")).toBe("pyrra");
    expect(nextFloorId("aether")).toBe("facility");
  });

  it("moving on from Maren arrives in Pyrra, with nothing carried over", () => {
    const p = newProgress(BIOMES[6]!.map);
    p.depth = 6;
    p.floor = "maren";
    p.visits.maren = 1;
    enterNextBiome(p);
    expect(p.floor).toBe("pyrra");
    expect(p.depth).toBe(7);
    const w = createWorld(BIOMES[7]!.map, p);
    expect(w.biome.def.id).toBe("pyrra");
    expect(w.targets.some((t) => t.def.id === "cinderBeetle")).toBe(true);
  });

  for (const b of lateBiomes) {
    describe(b.name, () => {
      const map = b.map;
      const currency = LATE_CURRENCIES[LATE.indexOf(b.id)]!;

      it("doesn't run in a straight line: at least one door opens off a side wall", () => {
        const sideways = map.doors.filter((d) => d.rect.maxZ - d.rect.minZ > d.rect.maxX - d.rect.minX);
        expect(sideways.length).toBeGreaterThanOrEqual(1);
      });

      it("has every door sitting in the wall between the two rooms it joins", () => {
        for (const d of map.doors) {
          const from = map.zones.find((z) => z.id === d.from)!;
          const to = map.zones.find((z) => z.id === d.to)!;
          expect(touches(d.rect, from.rect) && touches(d.rect, to.rect), d.id).toBe(true);
          // The doorway itself is open floor, not wall.
          const cx = (d.rect.minX + d.rect.maxX) / 2;
          const cz = (d.rect.minZ + d.rect.maxZ) / 2;
          expect(map.walls.some((w) => inside(w, cx, cz)), d.id).toBe(false);
        }
      });

      it("pays its own currency, and the first door is affordable from the first room", () => {
        const payers = map.spawns.filter((s) => (TARGETS[s.type].reward[currency] ?? 0) > 0);
        expect(payers.length).toBeGreaterThan(5);
        const first = map.doors[0]!.requirements.cost![currency]!;
        const starter = TARGETS[map.spawns[0]!.type].reward[currency]!;
        expect(first / starter).toBeLessThanOrEqual(8);
        expect(b.objective.repair.cost?.[currency]).toBeGreaterThan(0);
      });

      it("can be played through in quest order: each step only needs rooms already open", () => {
        const open: string[] = [];
        const done = new Set<string>();
        for (const q of b.quests) {
          const zones = reachableZones(map, open);
          const here = map.spawns.filter((s) => zones.has(zoneAt(map, s.x, s.z)!.id));
          const g = q.goal;
          if (g.kind === "capture" && g.target !== "any") {
            for (const t of typeof g.target === "string" ? [g.target] : g.target) {
              expect(here.some((s) => s.type === t), `${q.id}: no ${t} reachable yet`).toBe(true);
            }
          }
          if (g.kind === "bank") expect(here.some((s) => (TARGETS[s.type].reward[g.currency] ?? 0) > 0), q.id).toBe(true);
          if (g.kind === "unlockDoor") {
            const d = map.doors.find((dd) => dd.id === g.door)!;
            expect(zones.has(d.from) || zones.has(d.to), `${d.id} isn't reachable yet`).toBe(true);
            for (const need of d.requirements.quests ?? []) expect(done.has(need), `${d.id} needs ${need}`).toBe(true);
            open.push(d.id);
          }
          if (g.kind === "defeatBoss") {
            const boss = map.spawns.find((s) => TARGETS[s.type].behavior === "boss")!;
            expect(zones.has(zoneAt(map, boss.x, boss.z)!.id)).toBe(true);
          }
          done.add(q.id);
        }
        expect(open.length).toBe(map.doors.length);
      });
    });
  }

  it("draws every new creature: its own model, or a recolour of one that exists", () => {
    const own = new Set<TargetTypeId>(["ashMoth", "puffcap", "driftJelly", "bogToad", "skyRay", "nestEgg", "calderaTitan", "sporemother", "shardHydra", "mireLeviathan", "stormRoc"]);
    for (const b of lateBiomes) {
      for (const s of b.map.spawns) {
        if (s.type === "pod") continue;
        const look = TARGETS[s.type].appearance;
        if (!own.has(s.type)) expect(look, s.type).toBeDefined();
        if (look) expect(TARGETS[look.like].appearance, `${s.type} copies a copy`).toBeUndefined();
      }
    }
  });
});

describe("v19 saves", () => {
  it("migrates v18: the new currencies start at 0, nothing else changes", () => {
    const p = newProgress(BIOMES[6]!.map);
    p.depth = 6;
    p.floor = "maren";
    p.banked.pearls = 33;
    p.unlockedDoors = ["maren-door-reef"];
    const s = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    s.schemaVersion = 18;
    for (const c of LATE_CURRENCIES) delete s.progress.banked[c];
    const loaded = parseSave(s)!;
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
    for (const c of LATE_CURRENCIES) expect(loaded.progress.banked[c]).toBe(0);
    expect(loaded.progress.banked.pearls).toBe(33);
    expect(loaded.progress.floor).toBe("maren");
    expect(loaded.progress.unlockedDoors).toEqual(["maren-door-reef"]);
  });

  it("round-trips a save in Aether with sky silk and a recoloured creature in the hold", () => {
    const p = newProgress(BIOMES[11]!.map);
    p.depth = 11;
    p.floor = "aether";
    p.visits.aether = 1;
    p.banked.silk = 12.5;
    p.banked.glass = 3;
    p.unlockedDoors = ["aether-door-bridge"];
    p.cargo.push({ type: "cliffStrider", weight: 2, reward: { ...TARGETS.cliffStrider.reward } });
    const loaded = parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))))!;
    expect(loaded.progress.floor).toBe("aether");
    expect(loaded.progress.banked.silk).toBe(12.5);
    expect(loaded.progress.banked.glass).toBe(3);
    expect(loaded.progress.cargo.map((c) => c.type)).toEqual(["cliffStrider"]);
  });
});

/** A late world's boss hall with every door open and the player `gap` in front of the boss. */
function fight(bossId: TargetTypeId, gap: number) {
  const i = BIOMES.findIndex((b) => b.map.spawns.some((s) => s.type === bossId));
  const def = BIOMES[i]!;
  const p = newProgress(def.map);
  p.depth = i;
  p.floor = def.id;
  p.visits[def.id] = 1;
  p.unlockedDoors = def.map.doors.map((d) => d.id);
  p.firstDeathForgiven = true;
  const w = createWorld(def.map, p);
  const boss = w.targets.find((t) => t.def.id === bossId)!;
  w.player.x = w.player.prevX = boss.x;
  w.player.z = w.player.prevZ = boss.z - gap;
  w.progress.player.health = 1e6;
  w.stats.maxHealth = 1e6;
  w.stats.captureRadius = 0;
  return { w, boss };
}

function special<K extends BossSpecial["kind"]>(t: TargetEntity, kind: K): Extract<BossSpecial, { kind: K }> {
  const s = t.def.bossTuning!.special!;
  expect(s.kind).toBe(kind);
  return s as Extract<BossSpecial, { kind: K }>;
}

function cast(w: World, boss: TargetEntity): void {
  boss.boss!.state = "chase";
  boss.boss!.specialCooldown = 0;
  boss.boss!.chargeCooldown = 99;
  stepWorld(w);
}

const run = (w: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) stepWorld(w);
};

describe("the later bosses' moves", () => {
  it("caldera titan: rings of eruptions burst outward, with gaps to stand in", () => {
    const { w, boss } = fight("calderaTitan", 6);
    const S = special(boss, "nova");
    cast(w, boss);
    const hz = boss.boss!.hazards;
    expect(hz.length).toBeGreaterThan(10);
    // Later rings land later.
    const byRing = (h: (typeof hz)[number]) => Math.round(Math.hypot(h.x - boss.x, h.z - boss.z) / S.spacing);
    for (const h of hz) expect(h.timer).toBeCloseTo(S.delay + (byRing(h) - 1) * S.stagger, 5);
    // Somewhere on the first ring, between two eruptions, is safe.
    const r = S.spacing;
    let safe = false;
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const x = boss.x + Math.sin(a) * r;
      const z = boss.z + Math.cos(a) * r;
      if (!hz.some((h) => hazardCovers(h, x, z))) safe = true;
    }
    expect(safe).toBe(true);
  });

  it("shard hydra: a + aimed at the player, then an x a moment later", () => {
    const { w, boss } = fight("shardHydra", 6);
    const S = special(boss, "crossfire");
    cast(w, boss);
    const hz = boss.boss!.hazards;
    expect(hz).toHaveLength(8);
    expect(hz.filter((h) => h.timer > S.delay + 0.01)).toHaveLength(4);
    expect(hz.some((h) => h.timer <= S.delay + 1e-9 && hazardCovers(h, w.player.x, w.player.z))).toBe(true);
  });

  it("mire leviathan: the whirlpool drags a player who stands still into the crushing ring", () => {
    const { w, boss } = fight("mireLeviathan", 5);
    const S = special(boss, "pull");
    const start = Math.hypot(w.player.x - boss.x, w.player.z - boss.z);
    cast(w, boss);
    run(w, S.cast * 0.6);
    const mid = Math.hypot(w.player.x - boss.x, w.player.z - boss.z);
    expect(mid).toBeLessThan(start - 1);
    const before = w.progress.player.health;
    run(w, S.cast);
    expect(w.progress.player.health).toBeLessThan(before);
  });

  it("mire leviathan: swimming away at full speed escapes it", () => {
    const { w, boss } = fight("mireLeviathan", 5);
    const S = special(boss, "pull");
    cast(w, boss);
    const hits: boolean[] = [];
    for (let i = 0; i < Math.round((S.cast + 0.1) / SIM_DT); i++) {
      w.events.length = 0;
      w.input.x = 0;
      w.input.z = -1;
      stepWorld(w);
      for (const e of w.events) if (e.type === "hazardLanded") hits.push(e.hit);
    }
    expect(hits).toEqual([false]);
  });

  it("storm roc: soars out of reach, then dives on the player and is stunned on landing", () => {
    const { w, boss } = fight("stormRoc", 8);
    const S = special(boss, "burrow");
    expect(S.fly).toBe(true);
    cast(w, boss);
    run(w, S.cast + 0.05);
    expect(bossUntargetable(boss)).toBe(true);
    for (let i = 0; i < S.maxSeconds / SIM_DT && boss.boss!.state === "burrowed"; i++) stepWorld(w);
    expect(boss.boss!.state).toBe("erupting");
    const before = w.progress.player.health;
    run(w, S.eruptWindup + 0.05);
    expect(w.progress.player.health).toBeLessThan(before);
    expect(boss.boss!.state).toBe("stunned");
  });

  it("sporemother: pods land all over her hollow, one on the player", () => {
    const { w, boss } = fight("sporemother", 6);
    const S = special(boss, "icefall");
    cast(w, boss);
    const hz = boss.boss!.hazards;
    expect(hz).toHaveLength(S.count);
    expect(hazardCovers(hz[0]!, w.player.x, w.player.z)).toBe(true);
    const far = hz.filter((h) => Math.hypot(h.x - w.player.x, h.z - w.player.z) > 6);
    expect(far.length).toBeGreaterThan(2);
    for (const h of hz) expect(zoneAt(w.map, h.x, h.z)?.id).toBe(zoneAt(w.map, boss.x, boss.z)!.id);
  });
});

describe("late worlds review regressions", () => {
  it("every floor's vat and refinery sites open with its structure gate, the outpost with its own", () => {
    for (const b of BIOMES) {
      const map = b.map;
      const doorsBy = (gate: string) => {
        // Doors the quest chain has opened by the time `gate` is done.
        const open: string[] = [];
        for (const q of b.quests) {
          if (q.goal.kind === "unlockDoor") open.push(q.goal.door);
          if (q.id === gate) break;
        }
        return reachableZones(map, open);
      };
      const atGate = doorsBy(b.structureGate);
      for (const site of [b.sites.vat, b.sites.refinery]) {
        expect(atGate.has(zoneAt(map, site.x, site.z)!.id), `${b.id} site at ${site.x},${site.z}`).toBe(true);
      }
      expect(doorsBy(b.outpost.gate).has(zoneAt(map, b.sites.outpost.x, b.sites.outpost.z)!.id), `${b.id} outpost`).toBe(true);
    }
  });

  it("a slow creature with its back to a wall can still slip the whirlpool sideways", () => {
    const { w, boss } = fight("mireLeviathan", 5);
    const S = special(boss, "pull");
    // Base move speed, nothing bought.
    w.stats.moveSpeed = 3;
    // Back against the pool's south wall, directly in front of the leviathan.
    boss.z = boss.prevZ = boss.zoneRect.minZ + 5.5;
    w.player.z = w.player.prevZ = boss.zoneRect.minZ + 0.7;
    cast(w, boss);
    expect(boss.boss!.state).toBe("casting");
    const hits: boolean[] = [];
    for (let i = 0; i < Math.round((S.cast + 0.1) / SIM_DT); i++) {
      w.events.length = 0;
      w.input.x = 1;
      w.input.z = 0;
      stepWorld(w);
      for (const e of w.events) if (e.type === "hazardLanded") hits.push(e.hit);
    }
    expect(hits).toEqual([false]);
  });

  it("respawning clears any pull still on the creature", () => {
    const { w } = fight("mireLeviathan", 5);
    w.player.pullX = 3;
    w.player.pullZ = 3;
    w.progress.player.health = 0;
    w.player.invulnerable = 0;
    stepWorld(w);
    const at = { x: w.player.x, z: w.player.z };
    stepWorld(w);
    expect(Math.hypot(w.player.x - at.x, w.player.z - at.z)).toBeLessThan(1e-6);
  });
});

describe("whirlpool range", () => {
  it("never starts with the creature already in the crushing ring's reach", () => {
    const { w, boss } = fight("mireLeviathan", 2);
    const S = special(boss, "pull");
    expect(S.minRange).toBeGreaterThan(S.radius);
    cast(w, boss);
    expect(boss.boss!.state).not.toBe("casting");
  });
});
