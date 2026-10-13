import type { TargetTypeId } from "./targets";

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface SpawnPoint {
  id: string;
  type: TargetTypeId;
  x: number;
  z: number;
  wanderRadius: number;
}

export interface RoomDef {
  id: string;
  name: string;
  bounds: Rect;
  base: { x: number; z: number; radius: number };
  playerSpawn: { x: number; z: number };
  /** Solid blocks: stop movement and line of sight. */
  obstacles: Rect[];
  spawns: SpawnPoint[];
}

function box(x: number, z: number, w: number, d: number): Rect {
  return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
}

const workerSpots: Array<[number, number]> = [
  [-7, -6], [-3, -4], [4, -6], [8, -3],
  [-8, 1], [-2, 2], [3, 1], [8, 4],
  [-6, 7], [0, 8], [6, 9], [-8, 12],
  [-2, 14], [4, 14], [8, 13],
];

export const CONTAINMENT: RoomDef = {
  id: "containment",
  name: "Containment",
  bounds: { minX: -11, maxX: 11, minZ: -17, maxZ: 17 },
  base: { x: 0, z: -13, radius: 2.6 },
  playerSpawn: { x: 0, z: -9.5 },
  obstacles: [
    box(-5, -1, 2.4, 1.6),
    box(5.5, 6.5, 1.6, 2.6),
    box(-4.5, 10.5, 3.2, 1.4),
    box(1.5, 4.5, 1.2, 1.2),
  ],
  spawns: workerSpots.map(([x, z], i) => ({
    id: `containment-w${i}`,
    type: "worker" as const,
    x,
    z,
    wanderRadius: 2.5,
  })),
};
