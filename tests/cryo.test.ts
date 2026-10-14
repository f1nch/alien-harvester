import { describe, expect, it } from "vitest";
import { BIOMES } from "../src/content/biomes";
import { COLD } from "../src/content/cold";
import { CRYO_MAP } from "../src/content/cryo";
import { FACILITY, reachableZones, zoneAt, type Rect } from "../src/content/map";
import { TARGETS } from "../src/content/targets";
import { biomeAt } from "../src/domain/biome";
import { reachableTypes } from "../src/domain/cravings";
import { computeStats } from "../src/domain/economy";
import { newProgress } from "../src/domain/progress";
import { stepWorld } from "../src/game/step";
import { addChill, inCold } from "../src/game/systems/cold";
import { updateBoss } from "../src/game/systems/boss";
import { evolutionRequirements } from "../src/domain/evolution";
import { purchaseUpgrade, respecUpgrades } from "../src/domain/economy";
import { createWorld, SIM_DT, type World } from "../src/game/world";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";

const inside = (r: Rect, x: number, z: number, pad = 0) => x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad;

describe("every hand-made floor is well formed", () => {
  for (const b of BIOMES) {
    describe(b.name, () => {
      const map = b.map;
      const blocked = [...map.walls, ...map.props];

      it("has spawns, vents, the vat site, exit and spawn points in open floor inside a zone", () => {
        const points: Array<[string, number, number]> = [
          ...map.spawns.map((s): [string, number, number] => [s.id, s.x, s.z]),
          ...(map.heatVents ?? []).map((v, i): [string, number, number] => ["vent " + i, v.x, v.z]),
          ["vat site", b.sites.vat.x, b.sites.vat.z],
          ["exit", b.exit.x, b.exit.z],
          ["player spawn", map.playerSpawn.x, map.playerSpawn.z],
          ["base", map.base.x, map.base.z],
        ];
        for (const [id, x, z] of points) {
          expect(zoneAt(map, x, z), id).not.toBeNull();
          expect(blocked.some((r) => inside(r, x, z, 0.3)), id + " is inside a wall or prop").toBe(false);
        }
        // The objective console is a prop; its card shows from the open floor around it.
        expect(map.props.some((r) => inside(r, b.objective.x, b.objective.z))).toBe(true);
      });

      it("has unique spawn and door IDs, and doors joining real zones", () => {
        const spawnIds = map.spawns.map((s) => s.id);
        expect(new Set(spawnIds).size).toBe(spawnIds.length);
        const zones = new Set(map.zones.map((z) => z.id));
        for (const d of map.doors) expect(zones.has(d.from) && zones.has(d.to), d.id).toBe(true);
        expect(new Set(map.doors.map((d) => d.id)).size).toBe(map.doors.length);
      });

      it("opens up completely once every door is open", () => {
        expect(reachableZones(map, []).size).toBe(1);
        expect(reachableZones(map, map.doors.map((d) => d.id)).size).toBe(map.zones.length);
      });

      it("has quests that reference real doors, creatures and earlier quests, with exactly one boss quest", () => {
        const ids = new Set<string>();
        for (const q of b.quests) {
          for (const pre of q.prereqs) expect(ids.has(pre), q.id + " needs " + pre + " first").toBe(true);
          ids.add(q.id);
          const g = q.goal;
          if (g.kind === "unlockDoor") expect(map.doors.some((d) => d.id === g.door), q.id).toBe(true);
          if (g.kind === "capture" && g.target !== "any") {
            for (const t of typeof g.target === "string" ? [g.target] : g.target) {
              expect(map.spawns.some((s) => s.type === t), q.id + ": no " + t + " on this floor").toBe(true);
            }
          }
        }
        expect(b.quests.filter((q) => q.goal.kind === "defeatBoss")).toHaveLength(1);
        expect(ids.has(b.structureGate)).toBe(true);
        for (const d of map.doors) for (const q of d.requirements.quests ?? []) expect(ids.has(q), d.id + " needs " + q).toBe(true);
        for (const q of b.objective.repair.quests ?? []) expect(ids.has(q)).toBe(true);
      });

      it("has exactly one boss, in the last room", () => {
        const bosses = map.spawns.filter((s) => TARGETS[s.type].behavior === "boss");
        expect(bosses).toHaveLength(1);
        expect(zoneAt(map, bosses[0]!.x, bosses[0]!.z)!.id).toBe(map.zones.at(-1)!.id);
      });
    });
  }

  it("never reuses a quest or door ID across floors", () => {
    const quests = BIOMES.flatMap((b) => b.quests.map((q) => q.id));
    const doors = BIOMES.flatMap((b) => b.map.doors.map((d) => d.id));
    expect(new Set(quests).size).toBe(quests.length);
    expect(new Set(doors).size).toBe(doors.length);
  });

  it("puts heat vents only in cold rooms", () => {
    for (const v of CRYO_MAP.heatVents ?? []) expect(zoneAt(CRYO_MAP, v.x, v.z)!.cold).toBe(true);
    expect(FACILITY.heatVents ?? []).toEqual([]);
  });
});

/** A Cryo labs world with every door open and the player at a point; nothing else around. */
function cryoWorld(x: number, z: number): World {
  const p = newProgress(CRYO_MAP);
  p.depth = 1;
  p.evolution = 1;
  for (const d of CRYO_MAP.doors) p.unlockedDoors.push(d.id);
  p.player.x = x;
  p.player.z = z;
  const w = createWorld(CRYO_MAP, p);
  w.targets.length = 0;
  for (const id of Object.keys(w.progress.spawnCooldowns)) w.progress.spawnCooldowns[id] = 1e6;
  w.feeding.prizedTimer = 1e9;
  return w;
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) stepWorld(w);
}

describe("cold", () => {
  it("builds chill in a freezing room, slowing movement and capture at full chill", () => {
    const w = cryoWorld(-5, 26);
    expect(inCold(w)).toBe(true);
    const speed = w.stats.moveSpeed;
    const power = w.stats.capturePower;
    run(w, COLD.fillSeconds / 2);
    expect(w.chill).toBeGreaterThan(0.45);
    expect(w.chill).toBeLessThan(0.55);
    run(w, COLD.fillSeconds);
    expect(w.chill).toBe(1);
    expect(w.stats.moveSpeed).toBeCloseTo((speed * (100 - COLD.speedPenalty)) / 100);
    expect(w.stats.capturePower).toBeCloseTo((power * (100 - COLD.powerPenalty)) / 100);
  });

  it("thaws fast on a heat vent and slowly somewhere warm", () => {
    const vent = CRYO_MAP.heatVents![0]!;
    const w = cryoWorld(vent.x, vent.z);
    w.chill = 1;
    expect(inCold(w)).toBe(false);
    run(w, COLD.ventSeconds + 0.1);
    expect(w.chill).toBe(0);
    expect(w.chillApplied).toBe(0);
    const warm = cryoWorld(0, 0);
    warm.chill = 1;
    run(warm, COLD.warmSeconds / 2);
    expect(warm.chill).toBeCloseTo(0.5, 1);
  });

  it("Thermal fat slows chill and softens the freezing pulse", () => {
    const w = cryoWorld(-5, 26);
    w.progress.upgrades.thermalFat = 4;
    w.stats = computeStats(w.progress);
    expect(w.stats.chillResist).toBe(80);
    run(w, COLD.fillSeconds / 2);
    expect(w.chill).toBeCloseTo(0.1, 1);
    w.chill = 0;
    addChill(w, 0.6);
    expect(w.chill).toBeCloseTo(0.12);
  });

  it("death warms the creature up, and its stats with it", () => {
    const w = cryoWorld(-5, 26);
    run(w, COLD.fillSeconds + 1);
    expect(w.chillApplied).toBe(1);
    w.progress.firstDeathForgiven = true;
    w.progress.player.health = 0;
    stepWorld(w);
    run(w, 1);
    expect(w.chill).toBe(0);
    expect(w.chillApplied).toBe(0);
    expect(w.stats.moveSpeed).toBe(computeStats(w.progress).moveSpeed);
    expect(w.stats.capturePower).toBe(computeStats(w.progress).capturePower);
  });

  it("the sentinel's slam chills on a hit, and not while invulnerable", () => {
    const slamAt = (invulnerable: number) => {
      const p = newProgress(CRYO_MAP);
      p.depth = 1;
      p.evolution = 1;
      for (const d of CRYO_MAP.doors) p.unlockedDoors.push(d.id);
      const fresh = createWorld(CRYO_MAP, p);
      const boss = fresh.targets.find((t) => t.def.id === "cryoSentinel")!;
      fresh.player.x = boss.x;
      fresh.player.z = boss.z - 1;
      fresh.player.invulnerable = invulnerable;
      fresh.progress.player.health = 1e6;
      boss.boss!.state = "slamWindup";
      boss.boss!.timer = 0.001;
      updateBoss(fresh, boss, SIM_DT);
      return fresh.chill;
    };
    expect(slamAt(0)).toBeCloseTo(biomeAt(1).targets.cryoSentinel.bossTuning!.slamChill!);
    expect(slamAt(5)).toBe(0);
  });
});

describe("Cryo labs play", () => {
  it("is the floor after the facility, scaled to depth 1", () => {
    const b = biomeAt(1);
    expect(b.def.id).toBe("cryo");
    expect(b.targets.cryoScientist.reward).toEqual({ biomass: 4.8, crystals: 3.2 });
    expect(b.targets.cryoSentinel.bossTuning!.slamChill).toBeGreaterThan(0);
  });

  it("cravings ask for the creatures of rooms you can reach", () => {
    const p = newProgress(CRYO_MAP);
    p.depth = 1;
    expect(reachableTypes(p)).toEqual(["worker"]);
    p.unlockedDoors.push("cryo-door-cold");
    expect(reachableTypes(p).sort()).toEqual(["cryoScientist", "frostRunner", "worker"]);
  });

  it("saves and loads mid-floor with crystals and Thermal fat", () => {
    const w = cryoWorld(-5, 26);
    w.progress.banked.crystals = 42.5;
    w.progress.upgrades.thermalFat = 2;
    w.progress.cargo.push({ type: "cryoScientist", weight: 3, reward: { biomass: 1 } });
    const parsed = parseSave(JSON.parse(JSON.stringify(toSaveFile(w.progress, defaultSettings()))))!.progress;
    expect(parsed.banked.crystals).toBe(42.5);
    expect(parsed.upgrades.thermalFat).toBe(2);
    // Cargo is rebuilt at the floor's payouts.
    expect(parsed.cargo[0]!.reward).toEqual(biomeAt(1).targets.cryoScientist.reward);
  });

  it("v10 saves at odd depth (the facility then) start Cryo labs fresh", () => {
    const p = newProgress(FACILITY);
    p.depth = 1;
    p.unlockedDoors = ["door-service", "door-security"];
    p.quests = { "q-open-service": { count: 0, done: true } };
    p.reactorRepaired = true;
    const s = toSaveFile(p, defaultSettings()) as any;
    s.schemaVersion = 10;
    s.progress.cravings = [{ kind: "capture", target: "guard", goal: 5, progress: 1, reward: 2 }];
    const parsed = parseSave(s)!.progress;
    expect(parsed.reactorRepaired).toBe(false);
    expect(parsed.unlockedDoors).toEqual([]);
    expect(parsed.quests).toEqual({});
    expect(parsed.cravings).toEqual([]);
    // Depths that are the facility in every floor order (12: 12 % 2 = 12 % 3 = 12 % 4 = 0) keep their progress.
    const even = toSaveFile({ ...p, depth: 12 }, defaultSettings()) as any;
    even.schemaVersion = 10;
    expect(parseSave(even)!.progress.reactorRepaired).toBe(true);
  });

  it("drops cravings for creatures that don't live on this floor", () => {
    const p = newProgress(CRYO_MAP);
    p.depth = 1;
    p.cravings = [
      { kind: "capture", target: "guard", goal: 5, progress: 1, reward: 2 },
      { kind: "capture", target: "frostRunner", goal: 5, progress: 1, reward: 2 },
    ] as any;
    const parsed = parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))))!.progress;
    expect(parsed.cravings.map((c) => c.target)).toEqual(["frostRunner"]);
  });

  it("evolution doesn't ask for the facility's quest on deeper floors", () => {
    const p = newProgress(CRYO_MAP);
    p.depth = 0;
    const atFacility = evolutionRequirements(p).length;
    p.depth = 1;
    expect(evolutionRequirements(p)).toHaveLength(atFacility - 1);
    expect(evolutionRequirements(p).some((r) => r.label.includes("q-genetic"))).toBe(false);
  });

  it("Thermal fat is bought and refunded in crystals", () => {
    const p = newProgress(CRYO_MAP);
    p.depth = 1;
    p.banked.crystals = 100;
    expect(purchaseUpgrade(p, "thermalFat").ok).toBe(true);
    expect(p.banked.crystals).toBeLessThan(100);
    respecUpgrades(p);
    expect(p.upgrades.thermalFat).toBe(0);
    expect(p.banked.crystals).toBe(100);
  });

  it("migrates v10 saves: no crystals, no alloy, no Thermal fat", () => {
    const s = toSaveFile(newProgress(FACILITY), defaultSettings()) as any;
    s.schemaVersion = 10;
    delete s.progress.banked.crystals;
    delete s.progress.banked.alloy;
    delete s.progress.upgrades.thermalFat;
    delete s.progress.upgradeSpent.thermalFat;
    const parsed = parseSave(s)!;
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.progress.banked).toMatchObject({ crystals: 0, alloy: 0, amber: 0, shards: 0 });
    expect(parsed.progress.upgrades.thermalFat).toBe(0);
  });
});
