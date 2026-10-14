import type { MapDef } from "../src/content/map";
import type { TargetTypeId } from "../src/content/targets";
import { newProgress } from "../src/domain/progress";
import { createWorld, type World } from "../src/game/world";

const BOUNDS = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };

/** Open single-zone map with no walls; spawns and props are supplied per test. */
export function testMap(
  spawns: Array<[number, number]>,
  props: MapDef["props"] = [],
  type: TargetTypeId = "worker",
  extra: Partial<MapDef> = {},
): MapDef {
  return {
    bounds: BOUNDS,
    zones: [{ id: "containment", name: "Test", theme: "containment", rect: BOUNDS, tint: [1, 1, 1] }],
    base: { x: 0, z: -15, radius: 2 },
    playerSpawn: { x: 0, z: 0 },
    walls: [],
    props,
    doors: [],
    spawns: spawns.map(([x, z], i) => ({ id: `s${i}`, type, x, z, wanderRadius: 0 })),
    ...extra,
  };
}

export function testWorld(
  spawns: Array<[number, number]>,
  props: MapDef["props"] = [],
  type: TargetTypeId = "worker",
  extra: Partial<MapDef> = {},
): World {
  const map = testMap(spawns, props, type, extra);
  const w = createWorld(map, newProgress(map));
  // Keep targets stationary for deterministic capture tests.
  for (const t of w.targets) t.idle = 1e9;
  return w;
}
