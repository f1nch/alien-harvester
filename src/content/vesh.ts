import type { BiomeDef } from "./biomes";
import { box, rect, spawns, type MapDef, type Rect, withCrowds } from "./map";
import type { QuestDef } from "./quests";

/**
 * Vesh: the first portal world (act 2), a hive jungle under a green sky. Foragers carry
 * hive amber, skitters swarm and scatter, hive warriors fight back, and brood sacs are
 * rich in amber and genes. Sticky resin pools slow you down. The hive queen guards the
 * portal resonator in her chamber. Numbers are depth-0 equivalents; the world is first
 * reached at depth 4 and scaled from there.
 */

const HALF_W = 15;
const GAP = 1.5;

/** A wall across the world with a gap centred at x. */
function divider(minZ: number, maxZ: number, x: number): Rect[] {
  return [rect(-HALF_W, x - GAP, minZ, maxZ), rect(x + GAP, HALF_W, minZ, maxZ)];
}

/** A doorway in a divider, centred at x. */
function gap(minZ: number, maxZ: number, x: number): Rect {
  return rect(x - GAP, x + GAP, minZ, maxZ);
}

export const VESH_MAP: MapDef = {
  bounds: rect(-HALF_W, HALF_W, -17, 112),
  look: {
    kind: "wild",
    floor: "#17251a",
    speckle: "#2f4a24",
    wall: [0.16, 0.2, 0.13],
    glow: [0.45, 1, 0.35],
    prop: [0.24, 0.17, 0.12],
    door: [0.85, 0.35, 0.55],
    sky: [0.03, 0.07, 0.04],
    ambient: [0.08, 0.14, 0.07],
    flora: [0.4, 1, 0.75],
  },
  zones: [
    { id: "glade", name: "Portal glade", theme: "jungle", rect: rect(-11, 11, -17, 12), tint: [0.9, 1.1, 0.9] },
    { id: "canopy", name: "Fern canopy", theme: "jungle", rect: rect(-15, 15, 13, 40), tint: [0.85, 1.15, 0.85] },
    { id: "nursery", name: "Brood nursery", theme: "hive", rect: rect(-13, 13, 41, 66), tint: [1.15, 1.0, 0.75] },
    { id: "spires", name: "Resin spires", theme: "hive", rect: rect(-14, 14, 67, 90), tint: [1.2, 0.95, 0.7] },
    { id: "throne", name: "Queen's chamber", theme: "hive", rect: rect(-11, 11, 91, 112), tint: [1.25, 0.85, 0.75] },
  ],
  base: { x: 0, z: -13, radius: 2.6 },
  playerSpawn: { x: 0, z: -9.5 },
  walls: [
    rect(-HALF_W, -11, -17, 12), rect(11, HALF_W, -17, 12),
    rect(-HALF_W, -13, 41, 66), rect(13, HALF_W, 41, 66),
    rect(-HALF_W, -14, 67, 90), rect(14, HALF_W, 67, 90),
    rect(-HALF_W, -11, 91, 112), rect(11, HALF_W, 91, 112),
    // The way through winds: each doorway is off to one side of the last.
    ...divider(12, 13, -6),
    ...divider(40, 41, 7),
    ...divider(66, 67, -5),
    ...divider(90, 91, 0),
  ],
  props: [
    // Portal glade: a few old trunks.
    box(-6, -4, 1.6, 1.6),
    box(6, 0, 1.6, 1.6),
    box(-2, 7, 1.2, 1.2),
    box(7, 8, 1.2, 1.2),
    // Fern canopy: giant fern stems.
    box(-10, 18, 2, 2),
    box(9, 17, 1.6, 1.6),
    box(-2, 24, 1.4, 1.4),
    box(11, 30, 1.6, 1.6),
    box(-11, 32, 1.6, 1.6),
    box(4, 35, 1.2, 1.2),
    // Brood nursery: hive pillars.
    box(-8, 46, 1.6, 1.6),
    box(8, 47, 1.6, 1.6),
    box(0, 53, 2.2, 2.2),
    box(-8, 61, 1.6, 1.6),
    box(8, 60, 1.4, 1.4),
    // Resin spires.
    box(-9, 72, 1.4, 1.4),
    box(9, 73, 1.4, 1.4),
    box(-4, 80, 1.6, 1.6),
    box(5, 84, 1.6, 1.6),
    box(-10, 87, 1.2, 1.2),
    // Queen's chamber: brood columns, and the portal resonator.
    box(-5.5, 97, 1.4, 1.4),
    box(5.5, 97, 1.4, 1.4),
    box(-5.5, 105, 1.4, 1.4),
    box(5.5, 105, 1.4, 1.4),
    box(0, 109.5, 1.8, 1.8),
  ],
  resin: [
    { x: -6, z: 28, radius: 1.8 },
    { x: 6, z: 23, radius: 1.6 },
    { x: 4, z: 57, radius: 2 },
    { x: -4, z: 49, radius: 1.6 },
    { x: 2, z: 76, radius: 1.8 },
    { x: -8, z: 83, radius: 1.4 },
  ],
  doors: [
    {
      id: "vesh-door-canopy",
      name: "Root curtain",
      rect: gap(12, 13, -6),
      from: "glade",
      to: "canopy",
      requirements: { quests: ["vesh-foragers"], cost: { biomass: 80, amber: 3 } },
    },
    {
      id: "vesh-door-nursery",
      name: "Brood membrane",
      rect: gap(40, 41, 7),
      from: "canopy",
      to: "nursery",
      requirements: { quests: ["vesh-amber"], cost: { biomass: 200, amber: 8 } },
    },
    {
      id: "vesh-door-spires",
      name: "Resin gate",
      rect: gap(66, 67, -5),
      from: "nursery",
      to: "spires",
      requirements: { quests: ["vesh-brood"], cost: { biomass: 270, amber: 13, genetic: 20 } },
    },
    {
      id: "vesh-door-throne",
      name: "Queen's seal",
      rect: gap(90, 91, 0),
      from: "spires",
      to: "throne",
      requirements: { quests: ["vesh-warriors"], cost: { biomass: 320, amber: 20, parts: 10 } },
    },
  ],
  spawns: withCrowds([
    ...spawns("vesh-glade-f", "hiveForager", [[-7, -8], [3, -7], [8, -3], [-8, 2], [1, 2], [-2, -3]]),
    ...spawns("vesh-glade-s", "skitter", [[6, 5], [-8, 9]], 3),
    ...spawns("vesh-canopy-f", "hiveForager", [[-6, 16], [3, 20], [-12, 25], [12, 24]]),
    ...spawns("vesh-canopy-s", "skitter", [[-5, 36], [10, 37], [-7, 21], [7, 28]], 3.5),
    ...spawns("vesh-canopy-w", "hiveWarrior", [[1, 31]], 1.5),
    ...spawns("vesh-nursery-b", "broodSac", [[-11, 44], [11, 43], [-11, 64], [10.5, 63], [-3, 58]], 0),
    ...spawns("vesh-nursery-s", "skitter", [[-3, 45], [4, 51], [8, 56]], 3),
    ...spawns("vesh-nursery-w", "hiveWarrior", [[5, 63], [-7, 54]], 1.5),
    ...spawns("vesh-spires-w", "hiveWarrior", [[-7, 76], [7, 79], [-1, 88]], 1.5),
    ...spawns("vesh-spires-f", "hiveForager", [[-12, 70], [12, 70], [10, 88]], 2),
    ...spawns("vesh-spires-s", "skitter", [[-12, 80], [2, 70]], 3),
    ...spawns("vesh-throne-boss", "hiveQueen", [[0, 103]], 0),
    ...spawns("vesh-throne-s", "skitter", [[-8, 110], [8, 110], [-8, 94], [8, 94]], 1.5),
    // Supply pods (salvage that came through the portal), one per area.
    ...spawns("vesh-pod-glade", "pod", [[9.5, 10.5]], 0),
    ...spawns("vesh-pod-canopy", "pod", [[13.5, 38.5]], 0),
    ...spawns("vesh-pod-nursery", "pod", [[11.5, 65.3]], 0),
    ...spawns("vesh-pod-spires", "pod", [[-12.5, 68.5]], 0),
  ]),
};

/** Persistent IDs: never rename or reuse them, saves reference them. */
export const VESH_QUESTS: QuestDef[] = [
  {
    id: "vesh-foragers",
    title: "Capture 6 hive foragers",
    goal: { kind: "capture", target: "hiveForager", count: 6 },
    prereqs: [],
    reward: { biomass: 25, xp: 20 },
  },
  {
    id: "vesh-open-canopy",
    title: "Part the root curtain",
    goal: { kind: "unlockDoor", door: "vesh-door-canopy" },
    prereqs: ["vesh-foragers"],
    reward: { amber: 3, xp: 30 },
  },
  {
    id: "vesh-skitters",
    title: "Catch 8 skitters",
    goal: { kind: "capture", target: "skitter", count: 8 },
    prereqs: ["vesh-open-canopy"],
    reward: { genetic: 10, xp: 50 },
  },
  {
    id: "vesh-amber",
    title: "Bank 15 hive amber",
    goal: { kind: "bank", currency: "amber", count: 15 },
    prereqs: ["vesh-open-canopy"],
    reward: { biomass: 50, xp: 50 },
  },
  {
    id: "vesh-open-nursery",
    title: "Break into the brood nursery",
    goal: { kind: "unlockDoor", door: "vesh-door-nursery" },
    prereqs: ["vesh-amber"],
    reward: { xp: 60 },
  },
  {
    id: "vesh-brood",
    title: "Crack open 5 brood sacs",
    goal: { kind: "capture", target: "broodSac", count: 5 },
    prereqs: ["vesh-open-nursery"],
    reward: { amber: 8, xp: 100 },
  },
  {
    id: "vesh-open-spires",
    title: "Climb the resin spires",
    goal: { kind: "unlockDoor", door: "vesh-door-spires" },
    prereqs: ["vesh-brood"],
    reward: { xp: 80 },
  },
  {
    id: "vesh-warriors",
    title: "Capture 6 hive warriors",
    goal: { kind: "capture", target: "hiveWarrior", count: 6 },
    prereqs: ["vesh-open-spires"],
    reward: { parts: 6, xp: 120 },
  },
  {
    id: "vesh-open-throne",
    title: "Break the queen's seal",
    goal: { kind: "unlockDoor", door: "vesh-door-throne" },
    prereqs: ["vesh-warriors"],
    reward: { xp: 150 },
  },
  {
    id: "vesh-boss",
    title: "Defeat the hive queen",
    goal: { kind: "defeatBoss" },
    prereqs: ["vesh-open-throne"],
    reward: { parts: 12, amber: 10, xp: 340 },
  },
];

export const VESH: BiomeDef = {
  id: "vesh",
  name: "Vesh",
  region: "Portal world: hive jungle",
  arrival: "Warm air, green light, and a hum in the trees. The portal dropped you on a world that belongs to a hive, and the hive has noticed.",
  map: VESH_MAP,
  quests: VESH_QUESTS,
  objective: {
    name: "Portal resonator",
    task: "Tune the resonator",
    doneTitle: "Resonator tuned",
    doneBody: "The resonator sings and the portal behind the queen's chamber door shimmers into a new set of coordinates. It's just inside the chamber: step through when you're ready.",
    x: 0,
    z: 109.5,
    halfSize: 0.9,
    interactRadius: 3,
    repair: { quests: ["vesh-boss"], cost: { amber: 20, parts: 14, biomass: 270 } },
  },
  exit: { x: 0, z: 95.5, radius: 1.4, name: "Portal", action: "Step through the portal" },
  sites: { vat: { x: -13.3, z: 37 }, refinery: { x: 8.5, z: -12 }, outpost: { x: 9.5, z: 53 } },
  // In the brood nursery, halfway along.
  outpost: { gate: "vesh-open-nursery", cost: { amber: 17, biomass: 150 } },
  structureGate: "vesh-open-canopy",
  summon: { cost: { amber: 8, biomass: 60 }, types: ["hiveForager", "skitter"] },
};
