import { describe, expect, it } from "vitest";
import { BIOMES } from "../src/content/biomes";
import { FACILITY, zoneAt } from "../src/content/map";
import { TARGETS } from "../src/content/targets";
import { newProgress, type ProgressState } from "../src/domain/progress";
import { stepWorld } from "../src/game/step";
import { openDoors } from "../src/game/systems/arena";
import { createWorld, SIM_DT, type World } from "../src/game/world";
import { pointInRect } from "../src/game/geometry";

function lateGame(): ProgressState {
  const p = newProgress(FACILITY);
  p.unlockedDoors.push("door-service", "door-security", "door-reactor");
  for (const id of ["q-first-catch", "q-first-bank", "q-first-upgrade", "q-open-service", "q-genetic", "q-evolve", "q-open-security", "q-open-reactor"]) {
    p.quests[id] = { count: 999, done: true };
  }
  p.firstDeathForgiven = true;
  return p;
}

function world(px: number, pz: number): World {
  const w = createWorld(FACILITY, lateGame());
  w.player.x = w.player.prevX = px;
  w.player.z = w.player.prevZ = pz;
  w.progress.player.health = 1e6;
  w.stats.maxHealth = 1e6;
  return w;
}

const run = (w: World, seconds: number, input = { x: 0, z: 0 }) => {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    w.input.x = input.x;
    w.input.z = input.z;
    stepWorld(w);
  }
};

const boss = (w: World) => w.targets.find((t) => t.def.behavior === "boss")!;
const reactorRect = FACILITY.zones.find((z) => z.id === "reactor")!.rect;

describe("boss hall lockdown", () => {
  it("leaves the doors open while the player is outside the hall", () => {
    const w = world(0, 70);
    run(w, 0.5);
    expect(w.arena).toBeNull();
    expect(openDoors(w)).toContain("door-reactor");
  });

  it("does not close the door on a player standing in the doorway", () => {
    const w = world(0, 75.5);
    run(w, SIM_DT);
    expect(w.arena).toBeNull();
  });

  it("seals the door once the player walks in, and the player can't walk out", () => {
    const w = world(0, 73);
    run(w, 1.5, { x: 0, z: 1 }); // walk north through the doorway
    expect(w.arena?.doors).toEqual(["door-reactor"]);
    expect(w.events.some((e) => e.type === "arenaSealed")).toBe(true);
    expect(openDoors(w)).not.toContain("door-reactor");
    run(w, 3, { x: 0, z: -1 }); // try to leave
    expect(pointInRect(w.player.x, w.player.z, reactorRect)).toBe(true);
  });

  it("keeps everything else (including the boss) out of the doorway", () => {
    const w = world(0, 80);
    run(w, SIM_DT);
    expect(w.obstacles).toContainEqual(FACILITY.doors.find((d) => d.id === "door-reactor")!.rect);
  });

  it("opens again the tick the boss is caught", () => {
    const w = world(0, 80);
    run(w, SIM_DT);
    expect(w.arena).not.toBeNull();
    const b = boss(w);
    w.stats.capturePower = 1e6;
    w.stats.captureRadius = 20;
    w.events.length = 0;
    run(w, 0.5);
    expect(w.targets.includes(b)).toBe(false);
    expect(w.arena).toBeNull();
    expect(w.events).toContainEqual({ type: "arenaOpened", defeated: true });
    expect(openDoors(w)).toContain("door-reactor");
    run(w, 3, { x: 0, z: -1 });
    expect(w.player.z).toBeLessThan(reactorRect.minZ);
  });

  it("opens when the player dies (they respawn at base)", () => {
    const w = world(0, 80);
    run(w, SIM_DT);
    expect(w.arena).not.toBeNull();
    w.progress.player.health = 0;
    run(w, SIM_DT * 2);
    expect(w.arena).toBeNull();
    expect(openDoors(w)).toContain("door-reactor");
  });

  it("re-seals after a reload inside the hall (nothing is saved)", () => {
    const w = world(0, 80);
    run(w, SIM_DT);
    const again = createWorld(FACILITY, w.progress);
    expect(again.arena).toBeNull();
    run(again, SIM_DT);
    expect(again.arena).not.toBeNull();
  });
});

describe("every boss floor", () => {
  for (const [i, def] of BIOMES.entries()) {
    const spawn = def.map.spawns.find((s) => TARGETS[s.type].behavior === "boss");
    if (!spawn) continue;
    it(`${def.id}: the hall seals with the player inside and opens once the boss is caught`, () => {
      const p = newProgress(def.map);
      p.depth = i;
      p.floor = def.id;
      p.visits[def.id] = 1;
      p.unlockedDoors = def.map.doors.map((d) => d.id);
      p.firstDeathForgiven = true;
      const w = createWorld(def.map, p);
      const b = w.targets.find((t) => t.def.behavior === "boss")!;
      w.player.x = w.player.prevX = b.x;
      w.player.z = w.player.prevZ = b.z;
      w.progress.player.health = 1e6;
      w.stats.maxHealth = 1e6;
      stepWorld(w);
      expect(w.arena?.doors.length).toBeGreaterThan(0);
      // Every way in is closed: the hall's zone isn't reachable through open doors.
      const zone = zoneAt(def.map, b.homeX, b.homeZ)!;
      const open = openDoors(w);
      expect(def.map.doors.filter((d) => (d.from === zone.id || d.to === zone.id) && open.includes(d.id))).toEqual([]);
      w.stats.capturePower = 1e9;
      w.stats.captureRadius = 40;
      b.boss!.state = "stunned"; // not burrowed
      b.boss!.timer = 99;
      for (let k = 0; k < 30 && w.targets.includes(b); k++) stepWorld(w);
      expect(w.targets.includes(b)).toBe(false);
      expect(w.arena).toBeNull();
    });
  }
});

describe("no grabbing a boss from outside its hall", () => {
  it("tentacles won't take the boss from the doorway side, even in reach and in sight", () => {
    const w = world(0, 74.2); // security side of the open doorway
    const b = boss(w);
    b.x = 0;
    b.z = 77.5; // just inside the hall, straight through the open door
    b.idle = 1e9;
    w.stats.captureRadius = 10;
    w.stats.capturePower = 1e6;
    run(w, SIM_DT * 3);
    expect(w.tentacles).not.toContain(b);
    expect(w.targets.includes(b)).toBe(true);
  });

  it("a boss already held lets go once the player steps out of the hall", () => {
    const w = world(0, 80);
    const b = boss(w);
    w.stats.captureRadius = 20;
    w.stats.capturePower = 0.0001;
    run(w, SIM_DT * 2);
    expect(w.tentacles).toContain(b);
    // Lift the seal (as if the door were open) and stand outside.
    w.arena = { boss: b, doors: [] };
    w.player.x = w.player.prevX = 0;
    w.player.z = w.player.prevZ = 72;
    run(w, SIM_DT * 2);
    expect(b.held).toBe(false);
  });
});
