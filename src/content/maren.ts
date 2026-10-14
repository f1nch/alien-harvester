import type { BiomeDef } from "./biomes";
import { box, rect, spawns, type MapDef, type Rect } from "./map";
import type { QuestDef } from "./quests";

/**
 * Maren: the third portal world, drowned platforms under a deep-blue sky. Ocean currents
 * run across the reef and the rig deck and back down the pearl beds, pushing you along
 * as you cross; they pulse with the tide (content/tide.ts). Reef crabs and skimmers carry
 * tide pearls, lancer eels strike from range, pearl clams are worth prising open, and the
 * tide kraken guards the beacon in its trench. Numbers are depth-0 equivalents; a fresh
 * run first reaches Maren at depth 6.
 */

const HALF_W = 15;
const GAP = 1.5;

function divider(minZ: number, maxZ: number, x: number): Rect[] {
  return [rect(-HALF_W, x - GAP, minZ, maxZ), rect(x + GAP, HALF_W, minZ, maxZ)];
}

function gap(minZ: number, maxZ: number, x: number): Rect {
  return rect(x - GAP, x + GAP, minZ, maxZ);
}

export const MAREN_MAP: MapDef = {
  bounds: rect(-HALF_W, HALF_W, -17, 112),
  look: {
    kind: "wild",
    props: "pillars",
    floor: "#1d3940",
    speckle: "#2c5a5c",
    wall: [0.12, 0.2, 0.24],
    glow: [0.3, 0.9, 1],
    prop: [0.24, 0.34, 0.36],
    door: [0.3, 0.7, 1],
    sky: [0.02, 0.07, 0.13],
    ambient: [0.06, 0.12, 0.17],
    flora: [0.5, 1, 0.85],
  },
  zones: [
    { id: "jetty", name: "Portal jetty", theme: "reef", rect: rect(-11, 11, -17, 12), tint: [0.85, 1.0, 1.1] },
    { id: "reef", name: "Coral reef", theme: "reef", rect: rect(-15, 15, 13, 40), tint: [0.85, 1.05, 1.15] },
    { id: "beds", name: "Pearl beds", theme: "reef", rect: rect(-13, 13, 41, 66), tint: [0.9, 1.0, 1.2] },
    { id: "deck", name: "Rig deck", theme: "deep", rect: rect(-14, 14, 67, 90), tint: [0.8, 0.9, 1.15] },
    { id: "trench", name: "Kraken's trench", theme: "deep", rect: rect(-11, 11, 91, 112), tint: [0.7, 0.8, 1.2] },
  ],
  base: { x: 0, z: -13, radius: 2.6 },
  playerSpawn: { x: 0, z: -9.5 },
  walls: [
    rect(-HALF_W, -11, -17, 12), rect(11, HALF_W, -17, 12),
    rect(-HALF_W, -13, 41, 66), rect(13, HALF_W, 41, 66),
    rect(-HALF_W, -14, 67, 90), rect(14, HALF_W, 67, 90),
    rect(-HALF_W, -11, 91, 112), rect(11, HALF_W, 91, 112),
    ...divider(12, 13, -4),
    ...divider(40, 41, 7),
    ...divider(66, 67, -6),
    ...divider(90, 91, 0),
  ],
  props: [
    // Portal jetty: mooring posts.
    box(-6, -4, 1.4, 1.4),
    box(6, 0, 1.6, 1.6),
    box(2, 8, 1.2, 1.2),
    // Coral reef: coral heads, clear of the current.
    box(-11, 17, 1.6, 1.6),
    box(10, 18, 1.4, 1.4),
    box(-3, 20, 1.4, 1.4),
    box(11, 33, 1.4, 1.4),
    box(-12, 33, 1.4, 1.4),
    box(2, 35, 1.2, 1.2),
    // Pearl beds: pylons either side of the channel.
    box(-8, 46, 1.4, 1.4),
    box(8, 47, 1.4, 1.4),
    box(-8, 60, 1.4, 1.4),
    box(8, 59, 1.4, 1.4),
    // Rig deck: winches and crates.
    box(-10, 71, 1.4, 1.4),
    box(10, 72, 1.4, 1.4),
    box(-4, 83, 1.6, 1.6),
    box(5, 84, 1.6, 1.6),
    box(-11, 87, 1.2, 1.2),
    // Kraken's trench: barnacled pylons, and the tidal beacon.
    box(-5.5, 97, 1.4, 1.4),
    box(5.5, 97, 1.4, 1.4),
    box(-5.5, 105, 1.4, 1.4),
    box(5.5, 105, 1.4, 1.4),
    box(0, 109.5, 1.8, 1.8),
  ],
  // Speeds are at full flood; the tide scales them down to a third at slack water.
  currents: [
    // Across the reef, running east.
    { rect: rect(-15, 15, 25, 28), dx: 1.6, dz: 0 },
    // Down the middle of the pearl beds, back the way you came.
    // Gentle enough to wade up at half stick.
    { rect: rect(-2, 2, 44, 62), dx: 0, dz: -1.2 },
    // Across the rig deck, running west.
    { rect: rect(-14, 14, 76, 79), dx: -1.6, dz: 0 },
  ],
  doors: [
    {
      id: "maren-door-reef",
      name: "Jetty gate",
      rect: gap(12, 13, -4),
      from: "jetty",
      to: "reef",
      requirements: { quests: ["maren-crabs"], cost: { biomass: 130, pearls: 5 } },
    },
    {
      id: "maren-door-beds",
      name: "Coral arch",
      rect: gap(40, 41, 7),
      from: "reef",
      to: "beds",
      requirements: { quests: ["maren-pearls"], cost: { biomass: 310, pearls: 12 } },
    },
    {
      id: "maren-door-deck",
      name: "Rig hatch",
      rect: gap(66, 67, -6),
      from: "beds",
      to: "deck",
      requirements: { quests: ["maren-clams"], cost: { biomass: 420, pearls: 20, genetic: 20 } },
    },
    {
      id: "maren-door-trench",
      name: "Trench grille",
      rect: gap(90, 91, 0),
      from: "deck",
      to: "trench",
      requirements: { quests: ["maren-eels"], cost: { biomass: 500, pearls: 30, parts: 10 } },
    },
  ],
  spawns: [
    ...spawns("maren-jetty-c", "reefCrab", [[-7, -8], [3, -7], [8, -3], [-8, 2], [1, 2], [-3, -3]]),
    ...spawns("maren-jetty-s", "skimmer", [[7, 6], [-9, 9]], 3),
    ...spawns("maren-reef-c", "reefCrab", [[-6, 16], [4, 20], [-12, 23], [12, 22]], 2),
    ...spawns("maren-reef-s", "skimmer", [[-5, 37], [9, 37], [-8, 31], [7, 31]], 3),
    ...spawns("maren-reef-e", "lancerEel", [[1, 32]], 1.5),
    ...spawns("maren-beds-p", "pearlClam", [[-11, 44], [11, 44], [-11, 64], [10.5, 63], [5, 62]], 0),
    ...spawns("maren-beds-s", "skimmer", [[-5, 48], [5, 52], [9, 56]], 2.5),
    ...spawns("maren-beds-e", "lancerEel", [[4, 57], [-9, 54]], 1.5),
    ...spawns("maren-deck-e", "lancerEel", [[-9, 74], [7, 82], [-1, 88]], 1.5),
    ...spawns("maren-deck-c", "reefCrab", [[-12, 70], [12, 69], [10, 88]], 2),
    ...spawns("maren-deck-s", "skimmer", [[-12, 83], [2, 70]], 3),
    ...spawns("maren-trench-boss", "tideKraken", [[0, 103]], 0),
    ...spawns("maren-trench-s", "skimmer", [[-8, 110], [8, 110], [-8, 94], [8, 94]], 1.5),
    // Supply pods (salvage that came through the portal), one per area.
    ...spawns("maren-pod-jetty", "pod", [[9.5, 10.5]], 0),
    ...spawns("maren-pod-reef", "pod", [[13.5, 38.5]], 0),
    ...spawns("maren-pod-beds", "pod", [[11.5, 65.3]], 0),
    ...spawns("maren-pod-deck", "pod", [[-12.5, 68.5]], 0),
  ],
};

/** Persistent IDs: never rename or reuse them, saves reference them. */
export const MAREN_QUESTS: QuestDef[] = [
  {
    id: "maren-crabs",
    title: "Capture 6 reef crabs",
    goal: { kind: "capture", target: "reefCrab", count: 6 },
    prereqs: [],
    reward: { biomass: 25, xp: 20 },
  },
  {
    id: "maren-open-reef",
    title: "Open the jetty gate",
    goal: { kind: "unlockDoor", door: "maren-door-reef" },
    prereqs: ["maren-crabs"],
    reward: { pearls: 3, xp: 30 },
  },
  {
    id: "maren-skimmers",
    title: "Catch 8 skimmers",
    goal: { kind: "capture", target: "skimmer", count: 8 },
    prereqs: ["maren-open-reef"],
    reward: { genetic: 10, xp: 50 },
  },
  {
    id: "maren-pearls",
    title: "Bank 15 tide pearls",
    goal: { kind: "bank", currency: "pearls", count: 15 },
    prereqs: ["maren-open-reef"],
    reward: { biomass: 50, xp: 50 },
  },
  {
    id: "maren-open-beds",
    title: "Swim through the coral arch",
    goal: { kind: "unlockDoor", door: "maren-door-beds" },
    prereqs: ["maren-pearls"],
    reward: { xp: 60 },
  },
  {
    id: "maren-clams",
    title: "Prise open 5 pearl clams",
    goal: { kind: "capture", target: "pearlClam", count: 5 },
    prereqs: ["maren-open-beds"],
    reward: { pearls: 8, xp: 100 },
  },
  {
    id: "maren-open-deck",
    title: "Climb onto the rig deck",
    goal: { kind: "unlockDoor", door: "maren-door-deck" },
    prereqs: ["maren-clams"],
    reward: { xp: 80 },
  },
  {
    id: "maren-eels",
    title: "Capture 6 lancer eels",
    goal: { kind: "capture", target: "lancerEel", count: 6 },
    prereqs: ["maren-open-deck"],
    reward: { parts: 6, xp: 140 },
  },
  {
    id: "maren-open-trench",
    title: "Prise open the trench grille",
    goal: { kind: "unlockDoor", door: "maren-door-trench" },
    prereqs: ["maren-eels"],
    reward: { xp: 170 },
  },
  {
    id: "maren-boss",
    title: "Defeat the tide kraken",
    goal: { kind: "defeatBoss" },
    prereqs: ["maren-open-trench"],
    reward: { parts: 12, pearls: 10, xp: 380 },
  },
];

export const MAREN: BiomeDef = {
  id: "maren",
  name: "Maren",
  region: "Portal world: drowned platforms",
  arrival: "Salt spray and a deep, slow swell. The portal set you down on a sunken rig, and the water here moves on its own.",
  map: MAREN_MAP,
  quests: MAREN_QUESTS,
  objective: {
    name: "Tidal beacon",
    task: "Light the beacon",
    doneTitle: "Beacon lit",
    doneBody: "The beacon blazes through the water and the portal at the trench mouth answers with a new set of coordinates. It's just inside the trench: step through when you're ready.",
    x: 0,
    z: 109.5,
    halfSize: 0.9,
    interactRadius: 3,
    repair: { quests: ["maren-boss"], cost: { pearls: 30, parts: 14, biomass: 420 } },
  },
  exit: { x: 0, z: 95.5, radius: 1.4, name: "Portal", action: "Step through the portal" },
  sites: { vat: { x: -13.3, z: 37 }, refinery: { x: 8.5, z: -12 }, outpost: { x: 9.5, z: 53 } },
  // In the pearl beds, halfway along.
  outpost: { gate: "maren-open-beds", cost: { pearls: 25, biomass: 230 } },
  structureGate: "maren-open-reef",
  summon: { cost: { pearls: 8, biomass: 60 }, types: ["reefCrab", "skimmer"] },
};
