import { describe, expect, it } from "vitest";
import { BIOMES } from "../src/content/biomes";
import { HANGAR, HANGAR_MAP } from "../src/content/hangar";
import { TARGETS } from "../src/content/targets";
import { biomeAt, DEPTH_GROWTH, scaleAt, scaleCost } from "../src/domain/biome";
import { inBestiary } from "../src/domain/bestiary";
import { describeCraving } from "../src/domain/cravings";
import { newProgress } from "../src/domain/progress";
import { reactorRequirements } from "../src/domain/reactor";
import { enterNextBiome } from "../src/domain/travel";
import { createWorld } from "../src/game/world";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";

describe("Hangar", () => {
  it("is the fourth floor, ending the facility at a portal", () => {
    expect(BIOMES[3]).toBe(HANGAR);
    expect(biomeAt(3).name).toBe("Hangar");
    expect(biomeAt(3).region).toBe("Facility floor B4");
    expect(HANGAR.exit.name).toBe("Portal");
    expect(biomeAt(7).name).toBe("Hangar II");
  });

  it("follows the vaults: moving on from depth 2 lands in the hangar", () => {
    const p = newProgress(biomeAt(2).def.map);
    p.depth = 2;
    p.reactorRepaired = true;
    enterNextBiome(p);
    expect(p.depth).toBe(3);
    const w = createWorld(HANGAR_MAP, p);
    expect(w.biome.def.id).toBe("hangar");
    expect(w.targets.some((t) => t.def.id === "dockhand")).toBe(true);
  });

  it("is a machine-parts floor: the portal needs parts and refined alloy", () => {
    const p = newProgress(HANGAR_MAP);
    p.depth = 3;
    const labels = reactorRequirements(p).map((r) => r.label);
    expect(labels.some((l) => l.includes("alloy"))).toBe(true);
    expect(labels.some((l) => l.includes("machine parts"))).toBe(true);
    for (const t of HANGAR.summon.types) expect(TARGETS[t].reward.parts).toBeGreaterThan(0);
  });

  it("fuel cells are cracked-open creatures, not loot", () => {
    expect(TARGETS.fuelCell.behavior).toBe("static");
    expect(TARGETS.fuelCell.loot).toBeFalsy();
    expect(inBestiary("fuelCell")).toBe(true);
    expect(describeCraving({ kind: "capture", target: "fuelCell", goal: 3, progress: 0, reward: 3 })).toBe("Crack open 3 fuel cells");
    expect(TARGETS.overseerMech.behavior).toBe("boss");
    expect(TARGETS.loaderMech.combat).toBeDefined();
  });
});

describe("v15 saves: the floor is saved", () => {
  /** A live v14 save: depth d played BIOMES[d % 3], mid-floor with a door open and a base built. */
  function v14At(depth: number) {
    const def = BIOMES[depth % 3]!;
    const p = newProgress(def.map);
    p.depth = depth;
    p.unlockedDoors = [def.map.doors[0]!.id];
    p.reactorRepaired = true;
    p.banked.parts = 50;
    p.structures.outpost = { built: true, level: 1 };
    const s = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    s.schemaVersion = 14;
    delete s.progress.floor;
    s.progress.summon = { waves: 1, left: 3 };
    return s;
  }

  it("keeps every live v14 save on its floor with all its progress", () => {
    for (let depth = 0; depth < 15; depth++) {
      const loaded = parseSave(v14At(depth))!;
      expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
      const p = loaded.progress;
      const def = BIOMES[depth % 3]!;
      expect(p.floor, `depth ${depth}`).toBe(def.id);
      expect(p.unlockedDoors).toEqual([def.map.doors[0]!.id]);
      expect(p.reactorRepaired).toBe(true);
      expect(p.structures.outpost.built).toBe(true);
      expect(p.summon).toEqual({ waves: 1, left: 3 });
      expect(p.banked.parts).toBe(50);
    }
  });

  it("then moves on in story order: facility, cryo, vaults, hangar, facility", () => {
    const p = parseSave(v14At(3))!.progress; // the facility at depth 3 (Research wing II)
    expect(biomeAt(p.depth, p.floor).name).toBe("Research wing II");
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      p.cargo = [];
      enterNextBiome(p);
      order.push(p.floor);
    }
    expect(order).toEqual(["cryo", "vaults", "hangar", "facility", "cryo"]);
    expect(p.depth).toBe(8);
  });

  it("counts visits, so live players past depth 2 still meet the hangar with its story", () => {
    const p = parseSave(v14At(5))!.progress; // the vaults at depth 5: their second visit
    expect(p.visits).toEqual({ facility: 2, cryo: 2, vaults: 2 });
    expect(biomeAt(p.depth, p.floor, p.visits[p.floor]).name).toBe("Specimen vaults II");
    p.cargo = [];
    enterNextBiome(p);
    expect(p.floor).toBe("hangar");
    expect(p.visits.hangar).toBe(1);
    const b = createWorld(HANGAR_MAP, p).biome;
    expect(b.name).toBe("Hangar");
    expect(b.region).toBe("Facility floor B4");
    expect(b.arrival).toBe(HANGAR.arrival);
    p.cargo = [];
    enterNextBiome(p);
    expect(createWorld(biomeAt(7, "facility").def.map, p).biome.name).toBe("Research wing III");
  });

  it("rejects a floor at a depth a run can't reach it (depth 0 is always the first floor)", () => {
    const p = newProgress(HANGAR_MAP);
    p.depth = 0;
    expect(parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))))).toBeNull();
    p.depth = 3;
    expect(parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))))).not.toBeNull();
  });

  it("older chains land on the floor the v14 remap chose", () => {
    const s = v14At(0);
    s.schemaVersion = 13;
    s.progress.depth = 3; // Cryo labs in v13; the facility from v14 on
    s.progress.unlockedDoors = [];
    expect(parseSave(s)!.progress.floor).toBe("facility");
    s.progress.depth = 2;
    expect(parseSave(s)!.progress.floor).toBe("vaults");
  });

  it("round-trips the floor, and rejects unknown or missing floors", () => {
    const p = newProgress(HANGAR_MAP);
    p.depth = 7;
    expect(p.floor).toBe("hangar");
    const s = JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings())));
    expect(parseSave(s)!.progress.floor).toBe("hangar");
    expect(parseSave({ ...s, progress: { ...s.progress, floor: "atlantis" } })).toBeNull();
    expect(parseSave({ ...s, progress: { ...s.progress, floor: undefined } })).toBeNull();
  });

  it("a negative depth is rejected, never a crash, through every migration", () => {
    for (const v of [13, 14]) {
      const s = v14At(0);
      s.schemaVersion = v;
      s.progress.depth = -4;
      expect(() => parseSave(s)).not.toThrow();
      expect(parseSave(s)).toBeNull();
    }
  });
});

describe("hangar alloy", () => {
  it("quest rewards and prices grow at the same rate (the door's alloy relies on it)", () => {
    expect(DEPTH_GROWTH.reward).toBe(DEPTH_GROWTH.cost);
  });

  it("pays the portal door's alloy before it, without a refinery, at any depth", () => {
    for (const depth of [3, 7, 11, 51]) {
      const b = biomeAt(depth, "hangar");
      const door = b.def.map.doors.find((d) => d.id === "hangar-door-portal")!;
      const price = scaleCost(door.requirements.cost!, scaleAt(depth).cost).alloy!;
      const quest = b.questById.get("hangar-loaders")!;
      expect(quest.reward.alloy, `depth ${depth}`).toBeGreaterThanOrEqual(price);
      // Fuel cells, before the door, drip alloy for the portal itself.
      expect(b.targets.fuelCell.reward.alloy).toBeGreaterThan(0);
    }
  });
});
