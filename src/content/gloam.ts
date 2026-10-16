import type { BiomeDef } from "./biomes";
import { box, carveWalls, rect, spawns, type DoorDef, type MapDef, type ZoneDef } from "./map";
import type { QuestDef } from "./quests";

/**
 * Gloam: the seventh portal world, a sunken marsh under a sickly green sky. A sluggish
 * river crosses the mire and runs down the causeway, and bog mud slows you down. The mire
 * is a hub: the reed beds open off its west side and the drowned chapel off its east, and
 * both must be cleared before the causeway north. Numbers are depth-0 equivalents; a fresh
 * run first reaches Gloam at depth 10.
 */

const ZONES: ZoneDef[] = [
  { id: "dock", name: "Portal dock", theme: "reef", rect: rect(-11, 11, -17, 8), tint: [0.95, 1.05, 0.85] },
  { id: "mire", name: "The mire", theme: "jungle", rect: rect(-15, 15, 9, 36), tint: [0.9, 1.05, 0.8] },
  { id: "reeds", name: "Reed beds", theme: "jungle", rect: rect(-38, -16, 12, 32), tint: [0.95, 1.1, 0.8] },
  { id: "chapel", name: "Drowned chapel", theme: "ruins", rect: rect(16, 38, 12, 32), tint: [0.9, 0.95, 0.85] },
  { id: "causeway", name: "Sunken causeway", theme: "reef", rect: rect(-12, 12, 37, 58), tint: [0.85, 1.0, 0.85] },
  { id: "pool", name: "Leviathan's pool", theme: "deep", rect: rect(-11, 11, 59, 82), tint: [0.8, 0.95, 0.8] },
];

const DOORS: DoorDef[] = [
  {
    id: "gloam-door-mire", name: "Dock gate", rect: rect(-1.5, 1.5, 8, 9), from: "dock", to: "mire",
    requirements: { quests: ["gloam-toads"], cost: { biomass: 130, bogiron: 3 } },
  },
  {
    // West, off the side of the mire.
    id: "gloam-door-reeds", name: "Reed screen", rect: rect(-16, -15, 20.5, 23.5), from: "mire", to: "reeds",
    requirements: { quests: ["gloam-darters"], cost: { biomass: 200, bogiron: 7 } },
  },
  {
    // East, off the other side of the mire.
    id: "gloam-door-chapel", name: "Chapel doors", rect: rect(15, 16, 20.5, 23.5), from: "mire", to: "chapel",
    requirements: { quests: ["gloam-pods"], cost: { biomass: 300, bogiron: 10, genetic: 26 } },
  },
  {
    id: "gloam-door-causeway", name: "Causeway sluice", rect: rect(4.5, 7.5, 36, 37), from: "mire", to: "causeway",
    requirements: { quests: ["gloam-brutes"], cost: { biomass: 370, bogiron: 15 } },
  },
  {
    id: "gloam-door-pool", name: "Pool weir", rect: rect(-4.5, -1.5, 58, 59), from: "causeway", to: "pool",
    requirements: { quests: ["gloam-iron"], cost: { biomass: 490, bogiron: 23, parts: 12 } },
  },
];

const BOUNDS = rect(-38, 38, -17, 82);

export const GLOAM_MAP: MapDef = {
  bounds: BOUNDS,
  look: {
    kind: "wild",
    props: "trunks",
    floor: "#1f261a",
    speckle: "#36402a",
    wall: [0.14, 0.16, 0.11],
    glow: [0.8, 1, 0.35],
    prop: [0.25, 0.22, 0.17],
    door: [0.75, 0.95, 0.35],
    sky: [0.05, 0.08, 0.04],
    ambient: [0.11, 0.14, 0.08],
    flora: [0.8, 1, 0.4],
    resin: [0.3, 0.24, 0.14],
  },
  zones: ZONES,
  base: { x: 0, z: -13, radius: 2.6 },
  playerSpawn: { x: 0, z: -9.5 },
  walls: carveWalls(BOUNDS, ZONES.map((z) => z.rect), DOORS.map((d) => d.rect)),
  props: [
    // Portal dock: mooring stumps.
    box(-6, -4, 1.4, 1.4),
    box(6, 0, 1.6, 1.6),
    // The mire: dead trees.
    box(-12, 32, 1.4, 1.4),
    box(11, 22, 1.4, 1.4),
    box(-3, 18, 1.4, 1.4),
    // Reed beds.
    box(-30, 27, 1.4, 1.4),
    box(-21, 17, 1.4, 1.4),
    // Drowned chapel: broken pews.
    box(24, 18, 1.8, 1.2),
    box(29, 26, 1.8, 1.2),
    // Sunken causeway.
    box(-8, 48, 1.4, 1.4),
    box(8, 46, 1.4, 1.4),
    // Leviathan's pool: drowned pillars, and the lantern.
    box(-6, 66, 1.4, 1.4),
    box(6, 66, 1.4, 1.4),
    box(-6, 75, 1.4, 1.4),
    box(6, 75, 1.4, 1.4),
    box(0, 79.5, 1.8, 1.8),
  ],
  // Bog mud: wading through it is slow.
  resin: [
    { x: -8, z: 14, radius: 1.8 },
    { x: 8, z: 32, radius: 1.6 },
    { x: -30, z: 19, radius: 2 },
    { x: -22, z: 28, radius: 1.8 },
    { x: 7, z: 52, radius: 1.6 },
  ],
  // A sluggish river: across the mire (eastward) and back down the causeway.
  currents: [
    { rect: rect(-15, 15, 26, 29), dx: 1.3, dz: 0 },
    { rect: rect(-2, 2, 40, 55), dx: 0, dz: -1.1 },
  ],
  doors: DOORS,
  spawns: [
    ...spawns("gloam-dock-t", "bogToad", [[-7, -8], [4, -7], [8, -2], [-7, 3], [2, 4], [-3, -3]]),
    ...spawns("gloam-dock-d", "reedDarter", [[7, 6], [-8, 6]], 3),
    ...spawns("gloam-mire-d", "reedDarter", [[-10, 12], [10, 12], [-6, 33], [5, 34]], 3),
    ...spawns("gloam-mire-t", "bogToad", [[-12, 20], [12, 15], [3, 13]], 2),
    ...spawns("gloam-mire-b", "bogBrute", [[-1, 33]], 1.5),
    ...spawns("gloam-reeds-p", "peatPod", [[-36.5, 14], [-36.5, 30], [-17.5, 14], [-17.5, 30], [-27, 22]], 0),
    ...spawns("gloam-reeds-d", "reedDarter", [[-33, 23], [-25, 15], [-24, 30]], 2.5),
    ...spawns("gloam-chapel-b", "bogBrute", [[20, 14], [34, 29], [27, 22]], 1.5),
    ...spawns("gloam-chapel-t", "bogToad", [[20, 29], [34, 15]], 2),
    ...spawns("gloam-chapel-p", "peatPod", [[36.5, 22]], 0),
    ...spawns("gloam-causeway-b", "bogBrute", [[-8, 42], [8, 55]], 1.5),
    ...spawns("gloam-causeway-t", "bogToad", [[-9, 56], [9, 41]], 2),
    ...spawns("gloam-causeway-d", "reedDarter", [[-6, 53], [6, 44]], 2.5),
    ...spawns("gloam-pool-boss", "mireLeviathan", [[0, 71]], 0),
    ...spawns("gloam-pool-d", "reedDarter", [[-8.5, 80], [8.5, 80], [-8.5, 62], [8.5, 62]], 1.5),
    // Supply pods (salvage that came through the portal), one per area.
    ...spawns("gloam-pod-dock", "pod", [[9.5, 6.5]], 0),
    ...spawns("gloam-pod-mire", "pod", [[13.5, 34.5]], 0),
    ...spawns("gloam-pod-reeds", "pod", [[-37, 22]], 0),
    ...spawns("gloam-pod-chapel", "pod", [[37, 27]], 0),
  ],
};

/** Persistent IDs: never rename or reuse them, saves reference them. */
export const GLOAM_QUESTS: QuestDef[] = [
  {
    id: "gloam-toads",
    title: "Capture 6 bog toads",
    goal: { kind: "capture", target: "bogToad", count: 6 },
    prereqs: [],
    reward: { biomass: 34, xp: 28 },
  },
  {
    id: "gloam-open-mire",
    title: "Open the dock gate",
    goal: { kind: "unlockDoor", door: "gloam-door-mire" },
    prereqs: ["gloam-toads"],
    reward: { bogiron: 3, xp: 38 },
  },
  {
    id: "gloam-darters",
    title: "Catch 8 reed darters",
    goal: { kind: "capture", target: "reedDarter", count: 8 },
    prereqs: ["gloam-open-mire"],
    reward: { genetic: 12, xp: 68 },
  },
  {
    id: "gloam-open-reeds",
    title: "Push through the reed screen (west of the mire)",
    goal: { kind: "unlockDoor", door: "gloam-door-reeds" },
    prereqs: ["gloam-darters"],
    reward: { xp: 72 },
  },
  {
    id: "gloam-pods",
    title: "Burst 5 peat pods",
    goal: { kind: "capture", target: "peatPod", count: 5 },
    prereqs: ["gloam-open-reeds"],
    reward: { bogiron: 8, xp: 115 },
  },
  {
    id: "gloam-open-chapel",
    title: "Force the chapel doors (east of the mire)",
    goal: { kind: "unlockDoor", door: "gloam-door-chapel" },
    prereqs: ["gloam-pods"],
    reward: { xp: 105 },
  },
  {
    id: "gloam-brutes",
    title: "Capture 5 bog brutes",
    goal: { kind: "capture", target: "bogBrute", count: 5 },
    prereqs: ["gloam-open-chapel"],
    reward: { parts: 7, xp: 165 },
  },
  {
    id: "gloam-open-causeway",
    title: "Open the causeway sluice",
    goal: { kind: "unlockDoor", door: "gloam-door-causeway" },
    prereqs: ["gloam-brutes"],
    reward: { xp: 110 },
  },
  {
    id: "gloam-iron",
    title: "Bank 22 bog iron",
    goal: { kind: "bank", currency: "bogiron", count: 22 },
    prereqs: ["gloam-open-causeway"],
    reward: { biomass: 72, xp: 120 },
  },
  {
    id: "gloam-open-pool",
    title: "Climb the pool weir",
    goal: { kind: "unlockDoor", door: "gloam-door-pool" },
    prereqs: ["gloam-iron"],
    reward: { xp: 210 },
  },
  {
    id: "gloam-boss",
    title: "Defeat the mire leviathan",
    goal: { kind: "defeatBoss" },
    prereqs: ["gloam-open-pool"],
    reward: { parts: 15, bogiron: 10, xp: 460 },
  },
];

export const GLOAM: BiomeDef = {
  id: "gloam",
  name: "Gloam",
  region: "Portal world: sunken marsh",
  arrival: "Warm water to the knees and a stink of rot. The portal sank you into a marsh where something very large is breathing under the surface.",
  map: GLOAM_MAP,
  quests: GLOAM_QUESTS,
  objective: {
    name: "Marsh lantern",
    task: "Relight the marsh lantern",
    doneTitle: "Lantern lit",
    doneBody: "The lantern burns through the mist and the portal stirs with new coordinates. It's at the pool's edge: step through when you're ready.",
    x: 0,
    z: 79.5,
    halfSize: 0.9,
    interactRadius: 3,
    repair: { quests: ["gloam-boss"], cost: { bogiron: 23, parts: 18, biomass: 420 } },
  },
  exit: { x: 0, z: 61.5, radius: 1.4, name: "Portal", action: "Step through the portal" },
  sites: { vat: { x: -13.5, z: 12 }, refinery: { x: 8.5, z: -12 }, outpost: { x: -10, z: 40 } },
  // On the causeway, by the sluice.
  outpost: { gate: "gloam-open-causeway", cost: { bogiron: 18, biomass: 240 } },
  structureGate: "gloam-open-mire",
  summon: { cost: { bogiron: 9, biomass: 80 }, types: ["bogToad", "reedDarter"] },
};
