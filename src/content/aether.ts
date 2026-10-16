import type { BiomeDef } from "./biomes";
import { box, carveWalls, rect, spawns, type DoorDef, type MapDef, type ZoneDef } from "./map";
import type { QuestDef } from "./quests";

/**
 * Aether: the eighth portal world, islands of rock adrift in a pale sky, joined by narrow
 * stone bridges where the wind gusts sideways. The nest isle is a crossroads: a spire on
 * each side, both needed before the sky bridge north to the eyrie. Numbers are depth-0
 * equivalents; a fresh run first reaches Aether at depth 11.
 */

const ZONES: ZoneDef[] = [
  { id: "landing", name: "Landing isle", theme: "ruins", rect: rect(-11, 11, -17, 8), tint: [1.05, 1.05, 1.1] },
  { id: "bridge", name: "Gust bridge", theme: "ruins", rect: rect(-3, 3, 9, 26), tint: [1.0, 1.05, 1.15] },
  { id: "nest", name: "Nest isle", theme: "dunes", rect: rect(-14, 14, 27, 48), tint: [1.1, 1.05, 1.0] },
  { id: "west", name: "West spire", theme: "ruins", rect: rect(-33, -15, 30, 46), tint: [1.0, 1.0, 1.15] },
  { id: "east", name: "East spire", theme: "ruins", rect: rect(15, 33, 30, 46), tint: [1.05, 1.0, 1.15] },
  { id: "skybridge", name: "Sky bridge", theme: "ruins", rect: rect(-3, 3, 49, 62), tint: [1.0, 1.05, 1.2] },
  { id: "eyrie", name: "The eyrie", theme: "core", rect: rect(-12, 12, 63, 86), tint: [1.1, 1.0, 1.1] },
];

const DOORS: DoorDef[] = [
  {
    id: "aether-door-bridge", name: "Bridge chain", rect: rect(-1.5, 1.5, 8, 9), from: "landing", to: "bridge",
    requirements: { quests: ["aether-striders"], cost: { biomass: 160, silk: 5 } },
  },
  {
    id: "aether-door-nest", name: "Nest gate", rect: rect(-1.5, 1.5, 26, 27), from: "bridge", to: "nest",
    requirements: { quests: ["aether-rays"], cost: { biomass: 240, silk: 9 } },
  },
  {
    // West, off the side of the nest isle.
    id: "aether-door-west", name: "West span", rect: rect(-15, -14, 36.5, 39.5), from: "nest", to: "west",
    requirements: { quests: ["aether-eggs"], cost: { biomass: 340, silk: 14, genetic: 28 } },
  },
  {
    // East, off the other side.
    id: "aether-door-east", name: "East span", rect: rect(14, 15, 36.5, 39.5), from: "nest", to: "east",
    requirements: { quests: ["aether-harriers"], cost: { biomass: 400, silk: 18 } },
  },
  {
    id: "aether-door-skybridge", name: "Sky bridge chain", rect: rect(-1.5, 1.5, 48, 49), from: "nest", to: "skybridge",
    requirements: { quests: ["aether-silk"], cost: { biomass: 480, silk: 24 } },
  },
  {
    id: "aether-door-eyrie", name: "Eyrie gate", rect: rect(-1.5, 1.5, 62, 63), from: "skybridge", to: "eyrie",
    requirements: { quests: ["aether-silk"], cost: { biomass: 560, silk: 28, parts: 13 } },
  },
];

const BOUNDS = rect(-33, 33, -17, 86);

export const AETHER_MAP: MapDef = {
  bounds: BOUNDS,
  look: {
    kind: "wild",
    props: "pillars",
    floor: "#7d7a8c",
    speckle: "#9a97ab",
    wall: [0.42, 0.42, 0.52],
    glow: [0.6, 0.85, 1],
    prop: [0.55, 0.54, 0.62],
    door: [0.7, 0.9, 1],
    sky: [0.55, 0.65, 0.85],
    ambient: [0.3, 0.32, 0.38],
    flora: [1, 0.85, 0.95],
  },
  zones: ZONES,
  base: { x: 0, z: -13, radius: 2.6 },
  playerSpawn: { x: 0, z: -9.5 },
  walls: carveWalls(BOUNDS, ZONES.map((z) => z.rect), DOORS.map((d) => d.rect)),
  props: [
    // Landing isle: wind-carved rocks.
    box(-6, -4, 1.4, 1.4),
    box(6, 0, 1.6, 1.6),
    // Nest isle.
    box(-4, 36, 1.4, 1.4),
    box(4, 36, 1.4, 1.4),
    // West spire.
    box(-24, 32, 1.4, 1.4),
    // East spire.
    box(26, 38, 1.4, 1.4),
    // The eyrie: standing stones, and the wind harp.
    box(-6, 70, 1.4, 1.4),
    box(6, 70, 1.4, 1.4),
    box(-6, 79, 1.4, 1.4),
    box(6, 79, 1.4, 1.4),
    box(0, 83.5, 1.8, 1.8),
  ],
  // Wind gusting across the bridges and the nest isle. The walls keep you on the bridge.
  currents: [
    { rect: rect(-3, 3, 12, 23), dx: 1.3, dz: 0 },
    { rect: rect(-14, 14, 42, 45), dx: -1.4, dz: 0 },
    { rect: rect(-3, 3, 51, 60), dx: -1.3, dz: 0 },
  ],
  doors: DOORS,
  spawns: [
    ...spawns("aether-landing-c", "cliffStrider", [[-7, -8], [4, -7], [8, -2], [-7, 3], [2, 4], [-3, -3]]),
    ...spawns("aether-landing-r", "skyRay", [[7, 6], [-8, 6]], 3),
    ...spawns("aether-bridge-r", "skyRay", [[0, 11], [0, 24.5]], 1),
    ...spawns("aether-nest-r", "skyRay", [[-10, 30], [10, 30], [0, 47]], 2.5),
    ...spawns("aether-nest-e", "nestEgg", [[-12.5, 28.5], [12.5, 28.5], [-12.5, 46.5], [12.5, 46.5], [8, 32]], 0),
    ...spawns("aether-nest-h", "galeHarrier", [[-8, 33]], 1.5),
    ...spawns("aether-nest-c", "cliffStrider", [[9, 40], [-9, 40]], 2),
    ...spawns("aether-west-h", "galeHarrier", [[-29, 34], [-19, 43], [-24, 39], [-30, 43]], 1.5),
    ...spawns("aether-west-r", "skyRay", [[-18, 33], [-27, 45]], 2),
    ...spawns("aether-east-e", "nestEgg", [[31.5, 31.5], [31.5, 44.5], [16.5, 31.5], [16.5, 44.5]], 0),
    ...spawns("aether-east-c", "cliffStrider", [[23, 33], [22, 43]], 2),
    ...spawns("aether-east-h", "galeHarrier", [[29, 38]], 1.5),
    ...spawns("aether-skybridge-r", "skyRay", [[0, 55]], 1),
    ...spawns("aether-eyrie-boss", "stormRoc", [[0, 75]], 0),
    ...spawns("aether-eyrie-r", "skyRay", [[-9.5, 84], [9.5, 84], [-9.5, 66], [9.5, 66]], 1.5),
    // Supply pods (salvage that came through the portal), one per area.
    ...spawns("aether-pod-landing", "pod", [[9.5, 6.5]], 0),
    ...spawns("aether-pod-nest", "pod", [[12.5, 41]], 0),
    ...spawns("aether-pod-west", "pod", [[-31.5, 31.5]], 0),
    ...spawns("aether-pod-east", "pod", [[31.5, 38]], 0),
  ],
};

/** Persistent IDs: never rename or reuse them, saves reference them. */
export const AETHER_QUESTS: QuestDef[] = [
  {
    id: "aether-striders",
    title: "Capture 6 cliff striders",
    goal: { kind: "capture", target: "cliffStrider", count: 6 },
    prereqs: [],
    reward: { biomass: 36, xp: 30 },
  },
  {
    id: "aether-open-bridge",
    title: "Lower the bridge chain",
    goal: { kind: "unlockDoor", door: "aether-door-bridge" },
    prereqs: ["aether-striders"],
    reward: { silk: 3, xp: 40 },
  },
  {
    id: "aether-rays",
    title: "Catch 8 sky rays",
    goal: { kind: "capture", target: "skyRay", count: 8 },
    prereqs: ["aether-open-bridge"],
    reward: { genetic: 12, xp: 72 },
  },
  {
    id: "aether-open-nest",
    title: "Open the nest gate",
    goal: { kind: "unlockDoor", door: "aether-door-nest" },
    prereqs: ["aether-rays"],
    reward: { xp: 76 },
  },
  {
    id: "aether-eggs",
    title: "Take 5 nest eggs",
    goal: { kind: "capture", target: "nestEgg", count: 5 },
    prereqs: ["aether-open-nest"],
    reward: { silk: 8, xp: 120 },
  },
  {
    id: "aether-open-west",
    title: "Cross the west span",
    goal: { kind: "unlockDoor", door: "aether-door-west" },
    prereqs: ["aether-eggs"],
    reward: { xp: 110 },
  },
  {
    id: "aether-harriers",
    title: "Capture 5 gale harriers",
    goal: { kind: "capture", target: "galeHarrier", count: 5 },
    prereqs: ["aether-open-west"],
    reward: { parts: 7, xp: 170 },
  },
  {
    id: "aether-open-east",
    title: "Cross the east span",
    goal: { kind: "unlockDoor", door: "aether-door-east" },
    prereqs: ["aether-harriers"],
    reward: { xp: 115 },
  },
  {
    id: "aether-silk",
    title: "Bank 24 sky silk",
    goal: { kind: "bank", currency: "silk", count: 24 },
    prereqs: ["aether-open-east"],
    reward: { biomass: 76, xp: 130 },
  },
  {
    id: "aether-open-skybridge",
    title: "Lower the sky bridge chain",
    goal: { kind: "unlockDoor", door: "aether-door-skybridge" },
    prereqs: ["aether-silk"],
    reward: { xp: 140 },
  },
  {
    id: "aether-open-eyrie",
    title: "Open the eyrie gate",
    goal: { kind: "unlockDoor", door: "aether-door-eyrie" },
    prereqs: ["aether-open-skybridge"],
    reward: { xp: 220 },
  },
  {
    id: "aether-boss",
    title: "Defeat the storm roc",
    goal: { kind: "defeatBoss" },
    prereqs: ["aether-open-eyrie"],
    reward: { parts: 16, silk: 10, xp: 480 },
  },
];

export const AETHER: BiomeDef = {
  id: "aether",
  name: "Aether",
  region: "Portal world: sky reefs",
  arrival: "Wind, light and a long way down. The portal opened onto an island drifting in the clouds, and the ship's signal is louder here than it has ever been.",
  map: AETHER_MAP,
  quests: AETHER_QUESTS,
  objective: {
    name: "Wind harp",
    task: "Tune the wind harp",
    doneTitle: "Harp singing",
    doneBody: "The harp catches the gale and sings, and the portal answers with coordinates that feel very close to home. It's at the eyrie's mouth: step through when you're ready.",
    x: 0,
    z: 83.5,
    halfSize: 0.9,
    interactRadius: 3,
    repair: { quests: ["aether-boss"], cost: { silk: 30, parts: 19, biomass: 480 } },
  },
  exit: { x: 0, z: 65.5, radius: 1.4, name: "Portal", action: "Step through the portal" },
  sites: { vat: { x: -9.5, z: -12 }, refinery: { x: 8.5, z: -12 }, outpost: { x: -31, z: 39 } },
  // Out on the west spire.
  outpost: { gate: "aether-open-west", cost: { silk: 25, biomass: 280 } },
  structureGate: "aether-open-bridge",
  summon: { cost: { silk: 9, biomass: 85 }, types: ["cliffStrider", "skyRay"] },
};
