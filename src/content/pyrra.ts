import type { BiomeDef } from "./biomes";
import { box, carveWalls, rect, spawns, type DoorDef, type MapDef, type ZoneDef } from "./map";
import type { QuestDef } from "./quests";

/**
 * Pyrra: the fourth portal world, an ember caldera under a smoke-red sky. Ash storms sweep
 * the open lava fields and the vent gallery (basalt overhangs are shelter). The path
 * doesn't run straight: the glassworks open off the east side of the lava fields and the
 * forge off the west side of the gallery, and each holds what the next door north needs.
 * Numbers are depth-0 equivalents; a fresh run first reaches Pyrra at depth 7.
 */

const ZONES: ZoneDef[] = [
  { id: "landing", name: "Portal shelf", theme: "ruins", rect: rect(-11, 11, -17, 12), tint: [1.1, 0.85, 0.75] },
  { id: "fields", name: "Lava fields", theme: "dunes", exposed: true, rect: rect(-15, 15, 13, 40), tint: [1.2, 0.8, 0.65] },
  { id: "glassworks", name: "Glassworks", theme: "ruins", rect: rect(16, 38, 18, 36), tint: [1.15, 0.9, 0.7] },
  { id: "gallery", name: "Vent gallery", theme: "dunes", exposed: true, rect: rect(-13, 13, 41, 64), tint: [1.2, 0.75, 0.6] },
  { id: "forge", name: "Old forge", theme: "core", rect: rect(-36, -14, 45, 62), tint: [1.2, 0.8, 0.6] },
  { id: "crater", name: "Caldera heart", theme: "core", rect: rect(-11, 11, 65, 86), tint: [1.25, 0.7, 0.55] },
];

const DOORS: DoorDef[] = [
  {
    id: "pyrra-door-fields", name: "Basalt gate", rect: rect(1.5, 4.5, 12, 13), from: "landing", to: "fields",
    requirements: { quests: ["pyrra-beetles"], cost: { biomass: 90, glass: 3 } },
  },
  {
    // East, off the side of the lava fields.
    id: "pyrra-door-glassworks", name: "Glassworks arch", rect: rect(15, 16, 25.5, 28.5), from: "fields", to: "glassworks",
    requirements: { quests: ["pyrra-moths"], cost: { biomass: 140, glass: 6 } },
  },
  {
    id: "pyrra-door-gallery", name: "Vent stair", rect: rect(-6.5, -3.5, 40, 41), from: "fields", to: "gallery",
    requirements: { quests: ["pyrra-geodes"], cost: { biomass: 220, glass: 9 } },
  },
  {
    // West, off the side of the vent gallery.
    id: "pyrra-door-forge", name: "Forge door", rect: rect(-14, -13, 51.5, 54.5), from: "gallery", to: "forge",
    requirements: { quests: ["pyrra-glass"], cost: { biomass: 270, glass: 13, genetic: 20 } },
  },
  {
    id: "pyrra-door-crater", name: "Caldera rim", rect: rect(-1.5, 1.5, 64, 65), from: "gallery", to: "crater",
    requirements: { quests: ["pyrra-golems"], cost: { biomass: 350, glass: 20, parts: 10 } },
  },
];

const BOUNDS = rect(-36, 38, -17, 86);

export const PYRRA_MAP: MapDef = {
  bounds: BOUNDS,
  look: {
    kind: "wild",
    props: "pillars",
    floor: "#2a1a17",
    speckle: "#5a2a18",
    wall: [0.16, 0.12, 0.12],
    glow: [1, 0.45, 0.1],
    prop: [0.24, 0.18, 0.17],
    door: [1, 0.45, 0.15],
    sky: [0.14, 0.04, 0.02],
    ambient: [0.18, 0.09, 0.06],
    flora: [1, 0.55, 0.15],
    haze: [0.35, 0.14, 0.08],
  },
  storms: true,
  zones: ZONES,
  base: { x: 0, z: -13, radius: 2.6 },
  playerSpawn: { x: 0, z: -9.5 },
  walls: carveWalls(BOUNDS, ZONES.map((z) => z.rect), DOORS.map((d) => d.rect)),
  props: [
    // Portal shelf: cooled basalt boulders.
    box(-6, -4, 1.4, 1.4),
    box(6, 0, 1.6, 1.6),
    // Lava fields.
    box(-11, 17, 1.6, 1.6),
    box(10, 18, 1.4, 1.4),
    box(-2, 24, 1.4, 1.4),
    box(11, 31, 1.4, 1.4),
    // Glassworks: cooling racks.
    box(24, 22, 1.6, 1.2),
    box(30, 31, 1.6, 1.2),
    // Vent gallery: fumarole spires.
    box(-8, 46, 1.4, 1.4),
    box(8, 45, 1.4, 1.4),
    box(0, 54, 1.6, 1.6),
    box(-9, 62, 1.2, 1.2),
    // Old forge: anvils.
    box(-25, 48, 1.8, 1.2),
    box(-31, 57, 1.4, 1.4),
    // Caldera heart: basalt columns, and the vent seal.
    box(-6, 72, 1.4, 1.4),
    box(6, 72, 1.4, 1.4),
    box(-6, 80, 1.4, 1.4),
    box(6, 80, 1.4, 1.4),
    box(0, 83.5, 1.8, 1.8),
  ],
  // Basalt overhangs out in the open: shelter from the ash storms.
  shade: [
    { x: -9, z: 21, radius: 2 },
    { x: 8, z: 35, radius: 2 },
    { x: 9, z: 50, radius: 2 },
    { x: -6, z: 58, radius: 2 },
  ],
  doors: DOORS,
  spawns: [
    ...spawns("pyrra-landing-b", "cinderBeetle", [[-7, -8], [3, -7], [8, -3], [-8, 2], [1, 3], [-3, -3]]),
    ...spawns("pyrra-landing-m", "ashMoth", [[7, 8], [-8, 9]], 3),
    ...spawns("pyrra-fields-b", "cinderBeetle", [[-6, 15], [5, 22], [-12, 28], [12, 24]], 2),
    ...spawns("pyrra-fields-m", "ashMoth", [[-4, 37], [9, 37], [-8, 31], [4, 29]], 3),
    ...spawns("pyrra-fields-g", "magmaGolem", [[1, 34]], 1.5),
    ...spawns("pyrra-glass-e", "emberGeode", [[19, 20], [35, 20], [19, 34], [35, 34], [33, 27]], 0),
    ...spawns("pyrra-glass-m", "ashMoth", [[22, 27], [27, 25], [26, 33]], 2.5),
    ...spawns("pyrra-gallery-g", "magmaGolem", [[5, 58], [-4, 47]], 1.5),
    ...spawns("pyrra-gallery-b", "cinderBeetle", [[-10, 52], [10, 61], [3, 43]], 2),
    ...spawns("pyrra-gallery-m", "ashMoth", [[-4, 61], [10, 55]], 3),
    ...spawns("pyrra-forge-g", "magmaGolem", [[-30, 50], [-20, 58], [-24, 53]], 1.5),
    ...spawns("pyrra-forge-e", "emberGeode", [[-34.5, 60], [-34.5, 47]], 0),
    ...spawns("pyrra-crater-boss", "calderaTitan", [[0, 76]], 0),
    ...spawns("pyrra-crater-m", "ashMoth", [[-8.5, 84], [8.5, 84], [-8.5, 68], [8.5, 68]], 1.5),
    // Supply pods (salvage that came through the portal), one per area.
    ...spawns("pyrra-pod-landing", "pod", [[9.5, 10.5]], 0),
    ...spawns("pyrra-pod-fields", "pod", [[13.5, 38.5]], 0),
    ...spawns("pyrra-pod-glass", "pod", [[36.5, 34.5]], 0),
    ...spawns("pyrra-pod-forge", "pod", [[-15.5, 46.5]], 0),
  ],
};

/** Persistent IDs: never rename or reuse them, saves reference them. */
export const PYRRA_QUESTS: QuestDef[] = [
  {
    id: "pyrra-beetles",
    title: "Capture 6 cinder beetles",
    goal: { kind: "capture", target: "cinderBeetle", count: 6 },
    prereqs: [],
    reward: { biomass: 28, xp: 22 },
  },
  {
    id: "pyrra-open-fields",
    title: "Open the basalt gate",
    goal: { kind: "unlockDoor", door: "pyrra-door-fields" },
    prereqs: ["pyrra-beetles"],
    reward: { glass: 3, xp: 32 },
  },
  {
    id: "pyrra-moths",
    title: "Catch 8 ash moths",
    goal: { kind: "capture", target: "ashMoth", count: 8 },
    prereqs: ["pyrra-open-fields"],
    reward: { genetic: 10, xp: 55 },
  },
  {
    id: "pyrra-open-glassworks",
    title: "Open the glassworks (east of the lava fields)",
    goal: { kind: "unlockDoor", door: "pyrra-door-glassworks" },
    prereqs: ["pyrra-moths"],
    reward: { xp: 60 },
  },
  {
    id: "pyrra-geodes",
    title: "Crack open 5 ember geodes",
    goal: { kind: "capture", target: "emberGeode", count: 5 },
    prereqs: ["pyrra-open-glassworks"],
    reward: { glass: 8, xp: 100 },
  },
  {
    id: "pyrra-open-gallery",
    title: "Climb the vent stair",
    goal: { kind: "unlockDoor", door: "pyrra-door-gallery" },
    prereqs: ["pyrra-geodes"],
    reward: { xp: 80 },
  },
  {
    id: "pyrra-glass",
    title: "Bank 18 ember glass",
    goal: { kind: "bank", currency: "glass", count: 18 },
    prereqs: ["pyrra-open-gallery"],
    reward: { biomass: 60, xp: 90 },
  },
  {
    id: "pyrra-open-forge",
    title: "Open the old forge (west of the gallery)",
    goal: { kind: "unlockDoor", door: "pyrra-door-forge" },
    prereqs: ["pyrra-glass"],
    reward: { xp: 90 },
  },
  {
    id: "pyrra-golems",
    title: "Capture 6 magma golems",
    goal: { kind: "capture", target: "magmaGolem", count: 6 },
    prereqs: ["pyrra-open-forge"],
    reward: { parts: 6, xp: 150 },
  },
  {
    id: "pyrra-open-crater",
    title: "Cross the caldera rim",
    goal: { kind: "unlockDoor", door: "pyrra-door-crater" },
    prereqs: ["pyrra-golems"],
    reward: { xp: 180 },
  },
  {
    id: "pyrra-boss",
    title: "Defeat the caldera titan",
    goal: { kind: "defeatBoss" },
    prereqs: ["pyrra-open-crater"],
    reward: { parts: 12, glass: 10, xp: 400 },
  },
];

export const PYRRA: BiomeDef = {
  id: "pyrra",
  name: "Pyrra",
  region: "Portal world: ember caldera",
  arrival: "Heat like a wall and a sky the colour of embers. The portal opened on the lip of a living volcano, and the ash is starting to fall.",
  map: PYRRA_MAP,
  quests: PYRRA_QUESTS,
  objective: {
    name: "Vent seal",
    task: "Seal the magma vent",
    doneTitle: "Vent sealed",
    doneBody: "The seal glows white and holds. With the caldera quiet, the portal's glass ring sings with a new set of coordinates. It's at the crater mouth: step through when you're ready.",
    x: 0,
    z: 83.5,
    halfSize: 0.9,
    interactRadius: 3,
    repair: { quests: ["pyrra-boss"], cost: { glass: 20, parts: 15, biomass: 300 } },
  },
  exit: { x: 0, z: 67.5, radius: 1.4, name: "Portal", action: "Step through the portal" },
  sites: { vat: { x: -13, z: 37 }, refinery: { x: 8.5, z: -12 }, outpost: { x: -11, z: 44 } },
  // In the vent gallery, by the stair.
  outpost: { gate: "pyrra-open-gallery", cost: { glass: 17, biomass: 160 } },
  structureGate: "pyrra-open-fields",
  summon: { cost: { glass: 8, biomass: 65 }, types: ["cinderBeetle", "ashMoth"] },
};
