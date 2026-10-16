import type { BiomeDef } from "./biomes";
import { box, carveWalls, rect, spawns, type DoorDef, type MapDef, type ZoneDef } from "./map";
import type { QuestDef } from "./quests";

/**
 * Kharon: the sixth portal world, a shattered moon under a black sky. The ice shelf and the
 * ridge are airless and freezing (geothermal vents thaw you). The route zigzags: east out
 * of the crater onto the shelf, north up the ridge, west into the geode caves, then north
 * to the spire. Numbers are depth-0 equivalents; a fresh run first reaches Kharon at depth 9.
 */

const ZONES: ZoneDef[] = [
  { id: "landing", name: "Impact crater", theme: "ruins", rect: rect(-11, 11, -17, 10), tint: [0.95, 0.95, 1.1] },
  { id: "shelf", name: "Ice shelf", theme: "cold", cold: true, rect: rect(12, 36, -12, 8), tint: [0.85, 0.95, 1.2] },
  { id: "ridge", name: "Frozen ridge", theme: "cold", cold: true, rect: rect(14, 36, 9, 34), tint: [0.85, 0.9, 1.2] },
  { id: "caves", name: "Geode caves", theme: "vault", rect: rect(-12, 13, 14, 34), tint: [1.0, 0.85, 1.2] },
  { id: "spire", name: "Shattered spire", theme: "core", rect: rect(-11, 11, 35, 58), tint: [0.95, 0.85, 1.25] },
];

const DOORS: DoorDef[] = [
  {
    // East, out of the side of the crater.
    id: "kharon-door-shelf", name: "Crater breach", rect: rect(11, 12, -4.5, -1.5), from: "landing", to: "shelf",
    requirements: { quests: ["kharon-mites"], cost: { biomass: 180, moonstone: 5 } },
  },
  {
    id: "kharon-door-ridge", name: "Ice stair", rect: rect(23.5, 26.5, 8, 9), from: "shelf", to: "ridge",
    requirements: { quests: ["kharon-jellies"], cost: { biomass: 280, moonstone: 10 } },
  },
  {
    // West, off the side of the ridge.
    id: "kharon-door-caves", name: "Geode mouth", rect: rect(13, 14, 22.5, 25.5), from: "ridge", to: "caves",
    requirements: { quests: ["kharon-moonstone"], cost: { biomass: 420, moonstone: 16, genetic: 24 } },
  },
  {
    id: "kharon-door-spire", name: "Spire seal", rect: rect(-3.5, -0.5, 34, 35), from: "caves", to: "spire",
    requirements: { quests: ["kharon-mantises"], cost: { biomass: 660, moonstone: 40, parts: 12 } },
  },
];

const BOUNDS = rect(-12, 36, -17, 58);

export const KHARON_MAP: MapDef = {
  bounds: BOUNDS,
  look: {
    kind: "wild",
    props: "pillars",
    floor: "#2c2f3a",
    speckle: "#4a4f63",
    wall: [0.2, 0.21, 0.27],
    glow: [0.6, 0.75, 1],
    prop: [0.32, 0.33, 0.42],
    door: [0.75, 0.55, 1],
    sky: [0.01, 0.01, 0.03],
    ambient: [0.12, 0.12, 0.18],
    flora: [0.75, 0.55, 1],
  },
  zones: ZONES,
  base: { x: 0, z: -13, radius: 2.6 },
  playerSpawn: { x: 0, z: -9.5 },
  walls: carveWalls(BOUNDS, ZONES.map((z) => z.rect), DOORS.map((d) => d.rect)),
  props: [
    // Impact crater: ejecta boulders.
    box(-6, -4, 1.4, 1.4),
    box(6, 2, 1.6, 1.6),
    // Ice shelf.
    box(26, -7, 1.4, 1.4),
    box(24, 3, 1.4, 1.4),
    // Frozen ridge.
    box(20, 23, 1.6, 1.6),
    box(29, 14, 1.4, 1.4),
    // Geode caves: crystal clusters.
    box(-6, 20, 1.4, 1.4),
    box(0, 27, 1.6, 1.6),
    box(6, 19, 1.2, 1.2),
    // Shattered spire: crystal columns, and the relay.
    box(-6, 42, 1.4, 1.4),
    box(6, 42, 1.4, 1.4),
    box(-6, 50, 1.4, 1.4),
    box(6, 50, 1.4, 1.4),
    box(0, 55.5, 1.8, 1.8),
  ],
  // Geothermal vents: the only warmth out on the ice.
  heatVents: [
    { x: 18, z: -6, radius: 1.6 },
    { x: 31, z: 2, radius: 1.6 },
    { x: 18, z: 15, radius: 1.6 },
    { x: 31, z: 27, radius: 1.6 },
  ],
  doors: DOORS,
  spawns: [
    ...spawns("kharon-landing-m", "crystalMite", [[-7, -8], [4, -7], [8, -3], [-7, 3], [2, 6], [-3, -3]]),
    ...spawns("kharon-landing-j", "driftJelly", [[7, 7], [-8, 7]], 3),
    ...spawns("kharon-shelf-j", "driftJelly", [[16, -9], [33, -9], [27, 6], [15, 4]], 3),
    ...spawns("kharon-shelf-m", "crystalMite", [[22, -2], [30, -5], [34, 5]], 2),
    ...spawns("kharon-ridge-g", "moonGeode", [[34.5, 11], [34.5, 32], [15.5, 32], [24, 32.5], [26, 18]], 0),
    ...spawns("kharon-ridge-j", "driftJelly", [[21, 12], [28, 29]], 2.5),
    ...spawns("kharon-ridge-v", "voidMantis", [[25, 26]], 1.5),
    ...spawns("kharon-caves-v", "voidMantis", [[-8, 17], [6, 31], [-4, 24], [9, 26]], 1.5),
    ...spawns("kharon-caves-m", "crystalMite", [[-10, 31], [1, 16]], 2),
    ...spawns("kharon-caves-g", "moonGeode", [[-10.5, 15.5], [11.5, 32.5]], 0),
    ...spawns("kharon-spire-boss", "shardHydra", [[0, 47]], 0),
    ...spawns("kharon-spire-j", "driftJelly", [[-8.5, 56], [8.5, 56], [-8.5, 37.5], [8.5, 37.5]], 1.5),
    // Supply pods (salvage that came through the portal), one per area.
    ...spawns("kharon-pod-landing", "pod", [[9.5, 8.5]], 0),
    ...spawns("kharon-pod-shelf", "pod", [[34.5, -10.5]], 0),
    ...spawns("kharon-pod-ridge", "pod", [[15.5, 10.5]], 0),
    ...spawns("kharon-pod-caves", "pod", [[-10.5, 32.5]], 0),
  ],
};

/** Persistent IDs: never rename or reuse them, saves reference them. */
export const KHARON_QUESTS: QuestDef[] = [
  {
    id: "kharon-mites",
    title: "Capture 6 crystal mites",
    goal: { kind: "capture", target: "crystalMite", count: 6 },
    prereqs: [],
    reward: { biomass: 32, xp: 26 },
  },
  {
    id: "kharon-open-shelf",
    title: "Break through to the ice shelf (east of the crater)",
    goal: { kind: "unlockDoor", door: "kharon-door-shelf" },
    prereqs: ["kharon-mites"],
    reward: { moonstone: 3, xp: 36 },
  },
  {
    id: "kharon-jellies",
    title: "Catch 8 drift jellies",
    goal: { kind: "capture", target: "driftJelly", count: 8 },
    prereqs: ["kharon-open-shelf"],
    reward: { genetic: 11, xp: 64 },
  },
  {
    id: "kharon-open-ridge",
    title: "Climb the ice stair",
    goal: { kind: "unlockDoor", door: "kharon-door-ridge" },
    prereqs: ["kharon-jellies"],
    reward: { xp: 68 },
  },
  {
    id: "kharon-geodes",
    title: "Crack open 5 moon geodes",
    goal: { kind: "capture", target: "moonGeode", count: 5 },
    prereqs: ["kharon-open-ridge"],
    reward: { moonstone: 8, xp: 110 },
  },
  {
    id: "kharon-moonstone",
    title: "Bank 20 moonstone",
    goal: { kind: "bank", currency: "moonstone", count: 20 },
    prereqs: ["kharon-geodes"],
    reward: { biomass: 68, xp: 100 },
  },
  {
    id: "kharon-open-caves",
    title: "Enter the geode caves (west of the ridge)",
    goal: { kind: "unlockDoor", door: "kharon-door-caves" },
    prereqs: ["kharon-moonstone"],
    reward: { xp: 100 },
  },
  {
    id: "kharon-mantises",
    title: "Capture 6 void mantises",
    goal: { kind: "capture", target: "voidMantis", count: 6 },
    prereqs: ["kharon-open-caves"],
    reward: { parts: 7, xp: 160 },
  },
  {
    id: "kharon-open-spire",
    title: "Break the spire seal",
    goal: { kind: "unlockDoor", door: "kharon-door-spire" },
    prereqs: ["kharon-mantises"],
    reward: { xp: 200 },
  },
  {
    id: "kharon-boss",
    title: "Defeat the shard hydra",
    goal: { kind: "defeatBoss" },
    prereqs: ["kharon-open-spire"],
    reward: { parts: 14, moonstone: 10, xp: 440 },
  },
];

export const KHARON: BiomeDef = {
  id: "kharon",
  name: "Kharon",
  region: "Portal world: shattered moon",
  arrival: "No air, no sound, and a planet hanging huge overhead. The portal dropped you into a crater on a moon that's been broken into pieces.",
  map: KHARON_MAP,
  quests: KHARON_QUESTS,
  objective: {
    name: "Moon relay",
    task: "Restart the relay",
    doneTitle: "Relay running",
    doneBody: "The relay flickers, finds its old signal, and passes on a fresh set of coordinates. The portal is at the spire's foot: step through when you're ready.",
    x: 0,
    z: 55.5,
    halfSize: 0.9,
    interactRadius: 3,
    repair: { quests: ["kharon-boss"], cost: { moonstone: 40, parts: 17, biomass: 590 } },
  },
  exit: { x: 0, z: 38.5, radius: 1.4, name: "Portal", action: "Step through the portal" },
  sites: { vat: { x: 14, z: 6 }, refinery: { x: 8.5, z: -12 }, outpost: { x: 18, z: 30 } },
  // Up on the ridge, by a vent.
  outpost: { gate: "kharon-open-ridge", cost: { moonstone: 32, biomass: 320 } },
  structureGate: "kharon-open-shelf",
  summon: { cost: { moonstone: 8, biomass: 75 }, types: ["crystalMite", "driftJelly"] },
};
