import type { BiomeDef } from "./biomes";
import { box, rect, spawns, type MapDef, type Rect, withCrowds } from "./map";
import type { QuestDef } from "./quests";

/**
 * Ashkar: the second portal world, desert ruins under an ochre sky. Sandstorms sweep the
 * open dunes and the old market every so often, cutting capture reach for anyone caught
 * in the open; the colonnade and the tomb are sheltered, and stone canopies give shade.
 * Sand skinks and dune runners carry relic shards, relic golems fight back, burial urns
 * are worth cracking open, and the sand wyrm guards the star dial. Numbers are depth-0
 * equivalents; a fresh run first reaches Ashkar at depth 5.
 */

const HALF_W = 15;
const GAP = 1.5;

function divider(minZ: number, maxZ: number, x: number): Rect[] {
  return [rect(-HALF_W, x - GAP, minZ, maxZ), rect(x + GAP, HALF_W, minZ, maxZ)];
}

function gap(minZ: number, maxZ: number, x: number): Rect {
  return rect(x - GAP, x + GAP, minZ, maxZ);
}

export const ASHKAR_MAP: MapDef = {
  bounds: rect(-HALF_W, HALF_W, -17, 112),
  storms: true,
  look: {
    kind: "wild",
    props: "pillars",
    floor: "#6e5735",
    speckle: "#8f7346",
    wall: [0.42, 0.31, 0.19],
    glow: [1, 0.72, 0.3],
    prop: [0.55, 0.43, 0.28],
    door: [1, 0.55, 0.2],
    sky: [0.3, 0.2, 0.1],
    ambient: [0.24, 0.17, 0.1],
    flora: [1, 0.8, 0.35],
    haze: [0.72, 0.53, 0.3],
  },
  zones: [
    { id: "oasis", name: "Portal oasis", theme: "dunes", exposed: true, rect: rect(-11, 11, -17, 12), tint: [1.1, 1.0, 0.85] },
    { id: "dunes", name: "Shifting dunes", theme: "dunes", exposed: true, rect: rect(-15, 15, 13, 40), tint: [1.15, 1.0, 0.8] },
    { id: "colonnade", name: "Sunken colonnade", theme: "ruins", rect: rect(-13, 13, 41, 66), tint: [0.95, 0.85, 0.75] },
    { id: "market", name: "Buried market", theme: "dunes", exposed: true, rect: rect(-14, 14, 67, 90), tint: [1.15, 0.95, 0.75] },
    { id: "tomb", name: "Wyrm's tomb", theme: "ruins", rect: rect(-11, 11, 91, 112), tint: [0.9, 0.75, 0.7] },
  ],
  base: { x: 0, z: -13, radius: 2.6 },
  playerSpawn: { x: 0, z: -9.5 },
  walls: [
    rect(-HALF_W, -11, -17, 12), rect(11, HALF_W, -17, 12),
    rect(-HALF_W, -13, 41, 66), rect(13, HALF_W, 41, 66),
    rect(-HALF_W, -14, 67, 90), rect(14, HALF_W, 67, 90),
    rect(-HALF_W, -11, 91, 112), rect(11, HALF_W, 91, 112),
    ...divider(12, 13, 5),
    ...divider(40, 41, -7),
    ...divider(66, 67, 6),
    ...divider(90, 91, 0),
  ],
  props: [
    // Portal oasis: toppled statues.
    box(-6, -4, 1.4, 1.4),
    box(6, 0, 1.6, 1.6),
    box(-2, 8, 1.2, 1.2),
    // Shifting dunes: lone pillars half-buried in sand.
    box(-11, 17, 1.6, 1.6),
    box(10, 18, 1.4, 1.4),
    box(-1, 25, 1.6, 1.6),
    box(11, 30, 1.4, 1.4),
    box(-12, 33, 1.4, 1.4),
    box(3, 36, 1.2, 1.2),
    // Sunken colonnade: two rows of columns either side of the aisle.
    box(-6, 45, 1.2, 1.2),
    box(6, 45, 1.2, 1.2),
    box(-6, 52, 1.2, 1.2),
    box(6, 52, 1.2, 1.2),
    box(-6, 59, 1.2, 1.2),
    box(6, 59, 1.2, 1.2),
    // Buried market: collapsed stalls.
    box(-10, 71, 1.4, 1.4),
    box(10, 72, 1.4, 1.4),
    box(-3, 78, 1.6, 1.6),
    box(5, 82, 1.6, 1.6),
    box(-11, 87, 1.2, 1.2),
    // Wyrm's tomb: carved columns, and the star dial.
    box(-5.5, 97, 1.4, 1.4),
    box(5.5, 97, 1.4, 1.4),
    box(-5.5, 105, 1.4, 1.4),
    box(5.5, 105, 1.4, 1.4),
    box(0, 109.5, 1.8, 1.8),
  ],
  // Stone canopies out in the open: shelter from the storms.
  shade: [
    { x: -7, z: 6, radius: 1.8 },
    { x: 2, z: -3, radius: 1.8 },
    { x: -7, z: 21, radius: 2 },
    { x: 8, z: 33, radius: 2 },
    { x: -7, z: 81, radius: 2 },
    { x: 9, z: 86, radius: 1.8 },
  ],
  doors: [
    {
      id: "ashkar-door-dunes",
      name: "Sand-choked arch",
      rect: gap(12, 13, 5),
      from: "oasis",
      to: "dunes",
      requirements: { quests: ["ashkar-skinks"], cost: { biomass: 100, shards: 3 } },
    },
    {
      id: "ashkar-door-colonnade",
      name: "Colonnade steps",
      rect: gap(40, 41, -7),
      from: "dunes",
      to: "colonnade",
      requirements: { quests: ["ashkar-shards"], cost: { biomass: 260, shards: 8 } },
    },
    {
      id: "ashkar-door-market",
      name: "Market gate",
      rect: gap(66, 67, 6),
      from: "colonnade",
      to: "market",
      requirements: { quests: ["ashkar-urns"], cost: { biomass: 340, shards: 13, genetic: 20 } },
    },
    {
      id: "ashkar-door-tomb",
      name: "Tomb seal",
      rect: gap(90, 91, 0),
      from: "market",
      to: "tomb",
      requirements: { quests: ["ashkar-golems"], cost: { biomass: 410, shards: 20, parts: 10 } },
    },
  ],
  spawns: withCrowds([
    ...spawns("ashkar-oasis-k", "sandSkink", [[-7, -8], [3, -7], [8, -3], [-8, 2], [1, 2], [-3, -3]]),
    ...spawns("ashkar-oasis-r", "duneRunner", [[6, 6], [-9, 9]], 3),
    ...spawns("ashkar-dunes-k", "sandSkink", [[-6, 16], [3, 20], [-12, 26], [12, 24]]),
    ...spawns("ashkar-dunes-r", "duneRunner", [[-5, 36], [9, 37], [-8, 28], [7, 28]], 3.5),
    ...spawns("ashkar-dunes-g", "relicGolem", [[1, 31]], 1.5),
    ...spawns("ashkar-colonnade-u", "burialUrn", [[-11, 44], [11, 44], [-11, 63], [10.5, 63], [0, 62]], 0),
    ...spawns("ashkar-colonnade-r", "duneRunner", [[-2, 47], [3, 51], [9, 57]], 3),
    ...spawns("ashkar-colonnade-g", "relicGolem", [[-4, 63], [-9, 54]], 1.5),
    ...spawns("ashkar-market-g", "relicGolem", [[-7, 76], [7, 77], [-1, 88]], 1.5),
    ...spawns("ashkar-market-k", "sandSkink", [[-12, 70], [12, 69], [10, 88]], 2),
    ...spawns("ashkar-market-r", "duneRunner", [[-12, 83], [2, 70]], 3),
    ...spawns("ashkar-tomb-boss", "sandWyrm", [[0, 103]], 0),
    ...spawns("ashkar-tomb-r", "duneRunner", [[-8, 110], [8, 110], [-8, 94], [8, 94]], 1.5),
    // Supply pods (salvage that came through the portal), one per area.
    ...spawns("ashkar-pod-oasis", "pod", [[9.5, 10.5]], 0),
    ...spawns("ashkar-pod-dunes", "pod", [[13.5, 38.5]], 0),
    ...spawns("ashkar-pod-colonnade", "pod", [[11.5, 65.3]], 0),
    ...spawns("ashkar-pod-market", "pod", [[-12.5, 68.5]], 0),
  ]),
};

/** Persistent IDs: never rename or reuse them, saves reference them. */
export const ASHKAR_QUESTS: QuestDef[] = [
  {
    id: "ashkar-skinks",
    title: "Capture 6 sand skinks",
    goal: { kind: "capture", target: "sandSkink", count: 6 },
    prereqs: [],
    reward: { biomass: 25, xp: 20 },
  },
  {
    id: "ashkar-open-dunes",
    title: "Dig out the arch",
    goal: { kind: "unlockDoor", door: "ashkar-door-dunes" },
    prereqs: ["ashkar-skinks"],
    reward: { shards: 3, xp: 30 },
  },
  {
    id: "ashkar-runners",
    title: "Catch 8 dune runners",
    goal: { kind: "capture", target: "duneRunner", count: 8 },
    prereqs: ["ashkar-open-dunes"],
    reward: { genetic: 10, xp: 50 },
  },
  {
    id: "ashkar-shards",
    title: "Bank 15 relic shards",
    goal: { kind: "bank", currency: "shards", count: 15 },
    prereqs: ["ashkar-open-dunes"],
    reward: { biomass: 50, xp: 50 },
  },
  {
    id: "ashkar-open-colonnade",
    title: "Descend the colonnade steps",
    goal: { kind: "unlockDoor", door: "ashkar-door-colonnade" },
    prereqs: ["ashkar-shards"],
    reward: { xp: 60 },
  },
  {
    id: "ashkar-urns",
    title: "Crack open 5 burial urns",
    goal: { kind: "capture", target: "burialUrn", count: 5 },
    prereqs: ["ashkar-open-colonnade"],
    reward: { shards: 8, xp: 100 },
  },
  {
    id: "ashkar-open-market",
    title: "Open the market gate",
    goal: { kind: "unlockDoor", door: "ashkar-door-market" },
    prereqs: ["ashkar-urns"],
    reward: { xp: 80 },
  },
  {
    id: "ashkar-golems",
    title: "Capture 6 relic golems",
    goal: { kind: "capture", target: "relicGolem", count: 6 },
    prereqs: ["ashkar-open-market"],
    reward: { parts: 6, xp: 130 },
  },
  {
    id: "ashkar-open-tomb",
    title: "Break the tomb seal",
    goal: { kind: "unlockDoor", door: "ashkar-door-tomb" },
    prereqs: ["ashkar-golems"],
    reward: { xp: 160 },
  },
  {
    id: "ashkar-boss",
    title: "Defeat the sand wyrm",
    goal: { kind: "defeatBoss" },
    prereqs: ["ashkar-open-tomb"],
    reward: { parts: 12, shards: 10, xp: 360 },
  },
];

export const ASHKAR: BiomeDef = {
  id: "ashkar",
  name: "Ashkar",
  region: "Portal world: desert ruins",
  arrival: "Heat, glare and grit. The portal opens onto ruins half-swallowed by dunes, and on the horizon a wall of sand is rolling in.",
  map: ASHKAR_MAP,
  quests: ASHKAR_QUESTS,
  objective: {
    name: "Star dial",
    task: "Align the star dial",
    doneTitle: "Star dial aligned",
    doneBody: "The dial grinds round to a new constellation and the portal at the tomb's mouth flares with a new set of coordinates. It's just inside the tomb: step through when you're ready.",
    x: 0,
    z: 109.5,
    halfSize: 0.9,
    interactRadius: 3,
    repair: { quests: ["ashkar-boss"], cost: { shards: 20, parts: 14, biomass: 340 } },
  },
  exit: { x: 0, z: 95.5, radius: 1.4, name: "Portal", action: "Step through the portal" },
  sites: { vat: { x: -13.3, z: 37 }, refinery: { x: 8.5, z: -12 }, outpost: { x: 9.5, z: 53 } },
  // In the sheltered colonnade, halfway along.
  outpost: { gate: "ashkar-open-colonnade", cost: { shards: 17, biomass: 190 } },
  structureGate: "ashkar-open-dunes",
  summon: { cost: { shards: 8, biomass: 60 }, types: ["sandSkink", "duneRunner"] },
};
