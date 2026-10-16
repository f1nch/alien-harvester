import type { BiomeDef } from "./biomes";
import { box, carveWalls, rect, spawns, type DoorDef, type MapDef, type ZoneDef } from "./map";
import type { QuestDef } from "./quests";

/**
 * Thessa: the fifth portal world, fungal hollows lit only by what grows there. Sticky
 * spore mats slow you down. The way north branches: the cap field opens off the west of
 * the portal grotto and the spore pits off the east of the glade, and each is needed to
 * go on. Numbers are depth-0 equivalents; a fresh run first reaches Thessa at depth 8.
 */

const ZONES: ZoneDef[] = [
  { id: "grotto", name: "Portal grotto", theme: "jungle", rect: rect(-11, 11, -17, 10), tint: [0.9, 0.85, 1.1] },
  { id: "caps", name: "Cap field", theme: "jungle", rect: rect(-34, -12, -12, 8), tint: [0.95, 0.85, 1.15] },
  { id: "glade", name: "Glow glade", theme: "hive", rect: rect(-14, 14, 11, 38), tint: [0.85, 1.05, 1.0] },
  { id: "pits", name: "Spore pits", theme: "hive", rect: rect(15, 37, 14, 34), tint: [0.9, 1.1, 0.9] },
  { id: "vault", name: "Mycelium vault", theme: "jungle", rect: rect(-12, 12, 39, 60), tint: [0.85, 0.9, 1.15] },
  { id: "heart", name: "The heart", theme: "hive", rect: rect(-11, 11, 61, 82), tint: [0.9, 1.15, 0.85] },
];

const DOORS: DoorDef[] = [
  {
    // West, off the side of the portal grotto.
    id: "thessa-door-caps", name: "Root curtain", rect: rect(-12, -11, -3, 0), from: "grotto", to: "caps",
    requirements: { quests: ["thessa-grazers"], cost: { biomass: 100, spores: 3 } },
  },
  {
    id: "thessa-door-glade", name: "Gill gate", rect: rect(2.5, 5.5, 10, 11), from: "grotto", to: "glade",
    requirements: { quests: ["thessa-puffcaps"], cost: { biomass: 150, spores: 6 } },
  },
  {
    // East, off the side of the glade.
    id: "thessa-door-pits", name: "Spore veil", rect: rect(14, 15, 22.5, 25.5), from: "glade", to: "pits",
    requirements: { quests: ["thessa-sporelings"], cost: { biomass: 230, spores: 9 } },
  },
  {
    id: "thessa-door-vault", name: "Hyphal knot", rect: rect(-5.5, -2.5, 38, 39), from: "glade", to: "vault",
    requirements: { quests: ["thessa-lashers"], cost: { biomass: 290, spores: 14, genetic: 22 } },
  },
  {
    id: "thessa-door-heart", name: "Heart membrane", rect: rect(-1.5, 1.5, 60, 61), from: "vault", to: "heart",
    requirements: { quests: ["thessa-spores"], cost: { biomass: 380, spores: 21, parts: 11 } },
  },
];

const BOUNDS = rect(-34, 37, -17, 82);

export const THESSA_MAP: MapDef = {
  bounds: BOUNDS,
  look: {
    kind: "wild",
    props: "trunks",
    floor: "#1e1626",
    speckle: "#3b2a4a",
    wall: [0.14, 0.1, 0.18],
    glow: [0.55, 1, 0.4],
    prop: [0.3, 0.22, 0.35],
    door: [0.6, 1, 0.45],
    sky: [0.03, 0.02, 0.06],
    ambient: [0.1, 0.08, 0.14],
    flora: [0.6, 1, 0.5],
    resin: [0.35, 0.55, 0.2],
  },
  zones: ZONES,
  base: { x: 0, z: -13, radius: 2.6 },
  playerSpawn: { x: 0, z: -9.5 },
  walls: carveWalls(BOUNDS, ZONES.map((z) => z.rect), DOORS.map((d) => d.rect)),
  props: [
    // Portal grotto.
    box(-6, -4, 1.4, 1.4),
    box(6, 0, 1.6, 1.6),
    // Cap field: giant stems.
    box(-27, -6, 1.6, 1.6),
    box(-20, 3, 1.4, 1.4),
    // Glow glade.
    box(-11, 17, 1.6, 1.6),
    box(10, 20, 1.4, 1.4),
    box(-2, 26, 1.4, 1.4),
    box(11, 31, 1.4, 1.4),
    // Spore pits.
    box(24, 20, 1.6, 1.6),
    box(30, 28, 1.4, 1.4),
    // Mycelium vault.
    box(-8, 45, 1.4, 1.4),
    box(8, 46, 1.4, 1.4),
    box(0, 52, 1.6, 1.6),
    box(-9, 58, 1.2, 1.2),
    // The heart: root columns, and the spore beacon.
    box(-6, 68, 1.4, 1.4),
    box(6, 68, 1.4, 1.4),
    box(-6, 76, 1.4, 1.4),
    box(6, 76, 1.4, 1.4),
    box(0, 79.5, 1.8, 1.8),
  ],
  // Sticky spore mats.
  resin: [
    { x: -6, z: 31, radius: 1.8 },
    { x: 6, z: 25, radius: 1.6 },
    { x: 21, z: 27, radius: 1.8 },
    { x: 4, z: 56, radius: 2 },
    { x: -4, z: 48, radius: 1.6 },
  ],
  doors: DOORS,
  spawns: [
    ...spawns("thessa-grotto-g", "capGrazer", [[-7, -8], [4, -7], [8, -2], [-7, 3], [2, 4], [-3, -3]]),
    ...spawns("thessa-grotto-s", "sporeling", [[7, 7], [-8, 7]], 3),
    ...spawns("thessa-caps-p", "puffcap", [[-31, -9], [-31, 5], [-15, -9], [-15, 5], [-23, -2]], 0),
    ...spawns("thessa-caps-g", "capGrazer", [[-27, 1], [-19, -6]], 2),
    ...spawns("thessa-glade-s", "sporeling", [[-5, 35], [9, 35], [-9, 24], [5, 29]], 3),
    ...spawns("thessa-glade-g", "capGrazer", [[-10, 13], [10, 15], [1, 19]], 2),
    ...spawns("thessa-glade-l", "mycelidLasher", [[1, 33]], 1.5),
    ...spawns("thessa-pits-l", "mycelidLasher", [[20, 17], [33, 31], [27, 24]], 1.5),
    ...spawns("thessa-pits-p", "puffcap", [[35.5, 16], [35.5, 32]], 0),
    ...spawns("thessa-pits-s", "sporeling", [[19, 31], [30, 16]], 2.5),
    ...spawns("thessa-vault-l", "mycelidLasher", [[6, 50], [-6, 42]], 1.5),
    ...spawns("thessa-vault-g", "capGrazer", [[-9, 55], [9, 41]], 2),
    ...spawns("thessa-vault-s", "sporeling", [[-3, 57], [10, 55]], 2.5),
    ...spawns("thessa-heart-boss", "sporemother", [[0, 72]], 0),
    ...spawns("thessa-heart-s", "sporeling", [[-8.5, 80], [8.5, 80], [-8.5, 64], [8.5, 64]], 1.5),
    // Supply pods (salvage that came through the portal), one per area.
    ...spawns("thessa-pod-grotto", "pod", [[9.5, 8.5]], 0),
    ...spawns("thessa-pod-caps", "pod", [[-33, 7]], 0),
    ...spawns("thessa-pod-glade", "pod", [[12.5, 36.5]], 0),
    ...spawns("thessa-pod-pits", "pod", [[36, 24]], 0),
  ],
};

/** Persistent IDs: never rename or reuse them, saves reference them. */
export const THESSA_QUESTS: QuestDef[] = [
  {
    id: "thessa-grazers",
    title: "Capture 6 cap grazers",
    goal: { kind: "capture", target: "capGrazer", count: 6 },
    prereqs: [],
    reward: { biomass: 30, xp: 24 },
  },
  {
    id: "thessa-open-caps",
    title: "Part the root curtain (west of the grotto)",
    goal: { kind: "unlockDoor", door: "thessa-door-caps" },
    prereqs: ["thessa-grazers"],
    reward: { spores: 3, xp: 34 },
  },
  {
    id: "thessa-puffcaps",
    title: "Break open 5 puffcaps",
    goal: { kind: "capture", target: "puffcap", count: 5 },
    prereqs: ["thessa-open-caps"],
    reward: { genetic: 10, xp: 60 },
  },
  {
    id: "thessa-open-glade",
    title: "Open the gill gate",
    goal: { kind: "unlockDoor", door: "thessa-door-glade" },
    prereqs: ["thessa-puffcaps"],
    reward: { xp: 64 },
  },
  {
    id: "thessa-sporelings",
    title: "Catch 8 sporelings",
    goal: { kind: "capture", target: "sporeling", count: 8 },
    prereqs: ["thessa-open-glade"],
    reward: { spores: 8, xp: 100 },
  },
  {
    id: "thessa-open-pits",
    title: "Pass the spore veil (east of the glade)",
    goal: { kind: "unlockDoor", door: "thessa-door-pits" },
    prereqs: ["thessa-sporelings"],
    reward: { xp: 84 },
  },
  {
    id: "thessa-lashers",
    title: "Capture 5 mycelid lashers",
    goal: { kind: "capture", target: "mycelidLasher", count: 5 },
    prereqs: ["thessa-open-pits"],
    reward: { parts: 6, xp: 140 },
  },
  {
    id: "thessa-open-vault",
    title: "Untie the hyphal knot",
    goal: { kind: "unlockDoor", door: "thessa-door-vault" },
    prereqs: ["thessa-lashers"],
    reward: { xp: 96 },
  },
  {
    id: "thessa-spores",
    title: "Bank 20 glow spores",
    goal: { kind: "bank", currency: "spores", count: 20 },
    prereqs: ["thessa-open-vault"],
    reward: { biomass: 64, xp: 110 },
  },
  {
    id: "thessa-open-heart",
    title: "Pierce the heart membrane",
    goal: { kind: "unlockDoor", door: "thessa-door-heart" },
    prereqs: ["thessa-spores"],
    reward: { xp: 190 },
  },
  {
    id: "thessa-boss",
    title: "Defeat the sporemother",
    goal: { kind: "defeatBoss" },
    prereqs: ["thessa-open-heart"],
    reward: { parts: 13, spores: 10, xp: 420 },
  },
];

export const THESSA: BiomeDef = {
  id: "thessa",
  name: "Thessa",
  region: "Portal world: fungal hollows",
  arrival: "Dark, damp and softly glowing. The portal set you down in a cave the size of a city, and everything in it is growing.",
  map: THESSA_MAP,
  quests: THESSA_QUESTS,
  objective: {
    name: "Spore beacon",
    task: "Wake the spore beacon",
    doneTitle: "Beacon awake",
    doneBody: "The beacon pulses green through the whole hollow, and somewhere a portal answers it with new coordinates. It's at the heart's mouth: step through when you're ready.",
    x: 0,
    z: 79.5,
    halfSize: 0.9,
    interactRadius: 3,
    repair: { quests: ["thessa-boss"], cost: { spores: 21, parts: 16, biomass: 320 } },
  },
  exit: { x: 0, z: 63.5, radius: 1.4, name: "Portal", action: "Step through the portal" },
  sites: { vat: { x: -32.5, z: -1.5 }, refinery: { x: 8.5, z: -12 }, outpost: { x: -10, z: 42 } },
  // In the mycelium vault, by the knot.
  outpost: { gate: "thessa-open-vault", cost: { spores: 17, biomass: 180 } },
  structureGate: "thessa-open-caps",
  summon: { cost: { spores: 8, biomass: 70 }, types: ["capGrazer", "sporeling"] },
};
