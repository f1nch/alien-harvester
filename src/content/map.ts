import type { Requirements } from "../domain/requirements";
import type { TargetTypeId } from "./targets";

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Zone IDs are unique within a map (and persistent: door and spawn data name them). */
export type ZoneId = string;

/** How a zone is dressed (light colour, machinery). Several maps can share a theme. */
export type ZoneTheme = "containment" | "service" | "security" | "reactor" | "dock" | "cold" | "vault" | "lab" | "core";

export interface ZoneDef {
  id: ZoneId;
  name: string;
  theme: ZoneTheme;
  /** Freezing: chill builds here away from heat vents (content/cold.ts). */
  cold?: boolean;
  rect: Rect;
  /** Floor tint so zones read as distinct places. */
  tint: [number, number, number];
}

export type DoorRequirements = Requirements;

export interface DoorDef {
  id: string;
  name: string;
  /** Solid while locked; blocks movement and capture line of sight. */
  rect: Rect;
  from: ZoneId;
  to: ZoneId;
  requirements: DoorRequirements;
}

export interface SpawnPoint {
  id: string;
  type: TargetTypeId;
  x: number;
  z: number;
  wanderRadius: number;
}

export interface MapDef {
  bounds: Rect;
  zones: ZoneDef[];
  base: { x: number; z: number; radius: number };
  playerSpawn: { x: number; z: number };
  /** Structural walls: tall, block movement and sight. */
  walls: Rect[];
  /** Props such as pods and machinery: block movement and sight. */
  props: Rect[];
  doors: DoorDef[];
  spawns: SpawnPoint[];
  /** Warm spots in cold zones: standing here clears chill. */
  heatVents?: Array<{ x: number; z: number; radius: number }>;
}

export function box(x: number, z: number, w: number, d: number): Rect {
  return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
}

export function rect(minX: number, maxX: number, minZ: number, maxZ: number): Rect {
  return { minX, maxX, minZ, maxZ };
}

export function spawns(prefix: string, type: TargetTypeId, spots: Array<[number, number]>, wanderRadius = 2.5): SpawnPoint[] {
  return spots.map(([x, z], i) => ({ id: `${prefix}${i}`, type, x, z, wanderRadius }));
}

const HALF_W = 14;
const DOOR_HALF = 1.5;

/** A separating wall across the facility with a door gap in the middle. */
function divider(minZ: number, maxZ: number): Rect[] {
  return [rect(-HALF_W, -DOOR_HALF, minZ, maxZ), rect(DOOR_HALF, HALF_W, minZ, maxZ)];
}

const ZONES: ZoneDef[] = [
  { id: "containment", name: "Containment", theme: "containment", rect: rect(-11, 11, -17, 17), tint: [0.85, 0.9, 1.1] },
  { id: "service", name: "Service wing", theme: "service", rect: rect(-14, 14, 18, 44), tint: [0.85, 1.1, 0.95] },
  { id: "security", name: "Security sector", theme: "security", rect: rect(-12, 12, 45, 75), tint: [1.15, 0.85, 0.85] },
  { id: "reactor", name: "Reactor hall", theme: "reactor", rect: rect(-10, 10, 76, 96), tint: [1.15, 0.95, 0.75] },
];

export const FACILITY: MapDef = {
  bounds: rect(-HALF_W, HALF_W, -17, 96),
  zones: ZONES,
  base: { x: 0, z: -13, radius: 2.6 },
  playerSpawn: { x: 0, z: -9.5 },
  walls: [
    // Side fill where zones are narrower than the facility.
    rect(-HALF_W, -11, -17, 17), rect(11, HALF_W, -17, 17),
    rect(-HALF_W, -12, 45, 75), rect(12, HALF_W, 45, 75),
    rect(-HALF_W, -10, 76, 96), rect(10, HALF_W, 76, 96),
    ...divider(17, 18),
    ...divider(44, 45),
    ...divider(75, 76),
  ],
  props: [
    // Containment pods
    box(-5, -1, 2.4, 1.6),
    box(5.5, 6.5, 1.6, 2.6),
    box(-4.5, 10.5, 3.2, 1.4),
    box(1.5, 4.5, 1.2, 1.2),
    // Service wing machinery
    box(-8, 26, 3, 1.6),
    box(7, 24.5, 1.6, 3),
    box(-2.5, 33, 1.4, 1.4),
    box(5.5, 37.5, 3, 1.2),
    // Security sector barricades: cover for kiting guards.
    box(-6, 52, 3, 1.2),
    box(6, 55, 1.4, 3),
    box(-3, 62, 1.4, 1.4),
    box(5, 66, 3, 1.2),
    box(-7, 69, 1.6, 2.6),
    // Reactor hall pillars: cover, and something for the warden's charge to ram.
    box(-5.5, 81, 1.4, 1.4),
    box(5.5, 81, 1.4, 1.4),
    box(-5.5, 89, 1.4, 1.4),
    box(5.5, 89, 1.4, 1.4),
    // Reactor console (see content/reactor.ts).
    box(0, 93.5, 1.8, 1.8),
  ],
  doors: [
    {
      id: "door-service",
      name: "Service wing door",
      rect: rect(-DOOR_HALF, DOOR_HALF, 17, 18),
      from: "containment",
      to: "service",
      requirements: { level: 2, quests: ["q-first-upgrade"], cost: { biomass: 60 } },
    },
    {
      id: "door-security",
      name: "Security sector door",
      rect: rect(-DOOR_HALF, DOOR_HALF, 44, 45),
      from: "service",
      to: "security",
      requirements: { level: 4, quests: ["q-genetic"], cost: { biomass: 250, genetic: 20 } },
    },
    {
      id: "door-reactor",
      name: "Reactor hall door",
      rect: rect(-DOOR_HALF, DOOR_HALF, 75, 76),
      from: "security",
      to: "reactor",
      requirements: { level: 7, quests: ["q-evolve"], cost: { biomass: 600 } },
    },
  ],
  spawns: [
    ...spawns("containment-w", "worker", [
      [-7, -6], [-3, -4], [4, -6], [8, -3],
      [-8, 1], [-2, 2], [3, 1], [8, 4],
      [-6, 7], [0, 8], [6, 9], [-8, 12],
      [-2, 14], [4, 14], [8, 13],
    ]),
    ...spawns("service-r", "runner", [
      [-10, 21], [-5, 22], [4, 20], [10, 29], [-11, 31], [0, 28], [9, 33], [-7, 40],
    ], 4),
    ...spawns("service-t", "technician", [
      [-2, 23], [3, 31], [-9, 35], [11, 41], [0, 39], [-4, 42],
    ], 2),
    ...spawns("service-w", "worker", [[12, 21], [-12, 38], [4, 42]]),
    ...spawns("security-g", "guard", [
      [-9, 49], [8, 50], [0, 55], [-9, 58], [9, 61], [-2, 67], [3, 71], [-9, 73],
    ]),
    ...spawns("security-a", "armoredGuard", [[-5, 64], [7, 59], [0, 73], [9, 70]], 1.5),
    ...spawns("security-t", "technician", [[-10, 53], [10, 66], [2, 48]], 2),
    ...spawns("reactor-boss", "boss", [[0, 85]], 0),
    // Extra crews for a busier facility. New IDs, so existing saves just gain them.
    ...spawns("containment-crew", "worker", [
      [-9, -9], [-8, -11], [9, -8], [8, -11], [-2, -1], [0, 0], [-9, 5], [9, 1], [1, 11], [-1, 13],
    ], 2),
    ...spawns("service-crew-r", "runner", [[-3, 36], [7, 21]], 4),
    ...spawns("service-crew-t", "technician", [[-12, 27], [2, 35]], 2),
    ...spawns("service-crew-w", "worker", [[8, 43], [-8, 20], [6, 30]]),
    ...spawns("security-crew-t", "technician", [[-2, 58], [6, 74]], 2),
    // Panicked staff trapped in the reactor hall.
    ...spawns("reactor-staff", "worker", [[-8, 94], [8, 94], [-8, 78], [8, 78]], 1.5),
    // Supply pods: one per room, tucked in corners away from the main routes.
    ...spawns("pod-containment", "pod", [[-9, 13]], 0),
    ...spawns("pod-service", "pod", [[-12.5, 42.5]], 0),
    ...spawns("pod-security", "pod", [[10.5, 73.5]], 0),
    ...spawns("pod-reactor", "pod", [[8.5, 86]], 0),
  ],
};

/** Zones the player can walk to from the first zone through unlocked doors. */
export function reachableZones(map: MapDef, unlockedDoors: readonly string[]): Set<ZoneId> {
  const reach = new Set<ZoneId>(map.zones[0] ? [map.zones[0].id] : []);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of map.doors) {
      if (!unlockedDoors.includes(d.id)) continue;
      if (reach.has(d.from) && !reach.has(d.to)) {
        reach.add(d.to);
        grew = true;
      }
      if (reach.has(d.to) && !reach.has(d.from)) {
        reach.add(d.from);
        grew = true;
      }
    }
  }
  return reach;
}

/** Zone at a point; an open doorway counts as the zone it leads into. */
export function zoneAtOrDoorway(map: MapDef, x: number, z: number, unlockedDoors: readonly string[]): ZoneDef | null {
  const zone = zoneAt(map, x, z);
  if (zone) return zone;
  for (const d of map.doors) {
    const r = d.rect;
    if (unlockedDoors.includes(d.id) && x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
      return map.zones.find((zz) => zz.id === d.to) ?? null;
    }
  }
  return null;
}

export function zoneAt(map: MapDef, x: number, z: number): ZoneDef | null {
  for (const zone of map.zones) {
    const r = zone.rect;
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return zone;
  }
  return null;
}
