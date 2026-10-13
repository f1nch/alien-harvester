import type { RoomDef } from "../src/content/rooms";
import { newProgress } from "../src/domain/progress";
import { createWorld, type World } from "../src/game/world";

/** Open room with no obstacles; spawns are supplied per test. */
export function testRoom(spawns: Array<[number, number]>, obstacles: RoomDef["obstacles"] = []): RoomDef {
  return {
    id: "test",
    name: "Test",
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    base: { x: 0, z: -15, radius: 2 },
    playerSpawn: { x: 0, z: 0 },
    obstacles,
    spawns: spawns.map(([x, z], i) => ({ id: `s${i}`, type: "worker", x, z, wanderRadius: 0 })),
  };
}

export function testWorld(spawns: Array<[number, number]>, obstacles: RoomDef["obstacles"] = []): World {
  const room = testRoom(spawns, obstacles);
  const w = createWorld(room, newProgress(room));
  // Keep targets stationary for deterministic capture tests.
  for (const t of w.targets) t.idle = 1e9;
  return w;
}
