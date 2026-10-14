import type { BiomeDef } from "./biomes";
import { box, rect, spawns, type MapDef, type Rect } from "./map";
import type { QuestDef } from "./quests";

/**
 * Cryo labs: facility floor B2. Three freezing rooms (chill builds away from heat
 * vents), crystal-carrying scientists, frost runners, patrol drones, and the cryo
 * sentinel guarding the frozen core. Numbers are depth-0 equivalents; the floor is
 * played at depth 1 or deeper and scaled from there.
 */

const HALF_W = 14;
const DOOR_HALF = 1.5;

function divider(minZ: number, maxZ: number): Rect[] {
  return [rect(-HALF_W, -DOOR_HALF, minZ, maxZ), rect(DOOR_HALF, HALF_W, minZ, maxZ)];
}

export const CRYO_MAP: MapDef = {
  bounds: rect(-HALF_W, HALF_W, -17, 112),
  zones: [
    { id: "dock", name: "Intake dock", theme: "dock", rect: rect(-11, 11, -17, 12), tint: [0.85, 0.92, 1.05] },
    { id: "coldStorage", name: "Cold storage", theme: "cold", cold: true, rect: rect(-14, 14, 13, 40), tint: [0.8, 0.95, 1.2] },
    { id: "vaults", name: "Cryo vaults", theme: "vault", cold: true, rect: rect(-12, 12, 41, 66), tint: [0.75, 0.9, 1.25] },
    { id: "spire", name: "Research spire", theme: "lab", rect: rect(-13, 13, 67, 90), tint: [0.95, 0.88, 1.1] },
    { id: "core", name: "Frozen core", theme: "core", cold: true, rect: rect(-10, 10, 91, 112), tint: [0.7, 0.95, 1.3] },
  ],
  base: { x: 0, z: -13, radius: 2.6 },
  playerSpawn: { x: 0, z: -9.5 },
  walls: [
    rect(-HALF_W, -11, -17, 12), rect(11, HALF_W, -17, 12),
    rect(-HALF_W, -12, 41, 66), rect(12, HALF_W, 41, 66),
    rect(-HALF_W, -13, 67, 90), rect(13, HALF_W, 67, 90),
    rect(-HALF_W, -10, 91, 112), rect(10, HALF_W, 91, 112),
    ...divider(12, 13),
    ...divider(40, 41),
    ...divider(66, 67),
    ...divider(90, 91),
  ],
  props: [
    // Intake dock: stacked crates.
    box(-6, -2, 2.4, 1.6),
    box(6, 4, 1.6, 2.6),
    box(-3, 8, 1.4, 1.4),
    // Cold storage: freezer units.
    box(-9, 21, 3, 1.6),
    box(8, 24, 1.6, 3),
    box(-4, 31, 1.4, 1.4),
    box(6, 35, 3, 1.2),
    // Cryo vaults: sealed pods in two rows, a console between.
    box(-7, 47, 1.6, 1.6),
    box(7, 47, 1.6, 1.6),
    box(-7, 59, 1.6, 1.6),
    box(7, 59, 1.6, 1.6),
    box(0, 53, 2.2, 1.2),
    // Research spire: benches and server stacks.
    box(-8, 72, 3, 1.2),
    box(8, 76, 1.4, 3),
    box(-3, 83, 1.4, 1.4),
    box(6, 86, 3, 1.2),
    // Frozen core: pillars to dodge around, and the heat exchanger's console.
    box(-5.5, 97, 1.4, 1.4),
    box(5.5, 97, 1.4, 1.4),
    box(-5.5, 105, 1.4, 1.4),
    box(5.5, 105, 1.4, 1.4),
    box(0, 109.5, 1.8, 1.8),
  ],
  heatVents: [
    { x: -10, z: 16, radius: 1.6 },
    { x: 10, z: 30, radius: 1.6 },
    { x: 0, z: 38, radius: 1.6 },
    { x: 0, z: 44, radius: 1.6 },
    { x: -9.5, z: 53, radius: 1.6 },
    { x: 9.5, z: 53, radius: 1.6 },
    { x: 0, z: 63.5, radius: 1.6 },
    { x: -7, z: 93, radius: 1.6 },
    { x: 7, z: 93, radius: 1.6 },
    { x: 0, z: 100.5, radius: 1.4 },
  ],
  doors: [
    {
      id: "cryo-door-cold",
      name: "Cold storage door",
      rect: rect(-DOOR_HALF, DOOR_HALF, 12, 13),
      from: "dock",
      to: "coldStorage",
      requirements: { quests: ["cryo-catch-crew"], cost: { biomass: 80 } },
    },
    {
      id: "cryo-door-vaults",
      name: "Cryo vaults door",
      rect: rect(-DOOR_HALF, DOOR_HALF, 40, 41),
      from: "coldStorage",
      to: "vaults",
      requirements: { quests: ["cryo-crystals"], cost: { biomass: 220, crystals: 15 } },
    },
    {
      id: "cryo-door-spire",
      name: "Research spire door",
      rect: rect(-DOOR_HALF, DOOR_HALF, 66, 67),
      from: "vaults",
      to: "spire",
      requirements: { quests: ["cryo-drones"], cost: { biomass: 320, crystals: 25, genetic: 15 } },
    },
    {
      id: "cryo-door-core",
      name: "Frozen core door",
      rect: rect(-DOOR_HALF, DOOR_HALF, 90, 91),
      from: "spire",
      to: "core",
      requirements: { quests: ["cryo-spire-staff"], cost: { biomass: 400, parts: 8, crystals: 30 } },
    },
  ],
  spawns: [
    ...spawns("cryo-dock-w", "worker", [
      [-7, -7], [-2, -5], [4, -7], [8, -3],
      [-8, 2], [-1, 2], [3, 0], [8, 8],
    ]),
    ...spawns("cryo-cold-s", "cryoScientist", [[-6, 17], [5, 18], [-10, 27], [3, 28], [-2, 36]], 2),
    ...spawns("cryo-cold-r", "frostRunner", [[11, 17], [-7, 34], [10, 38]], 3.5),
    ...spawns("cryo-cold-w", "worker", [[-12, 31], [1, 22], [12, 34]]),
    ...spawns("cryo-vault-d", "patrolDrone", [[-4, 50], [4, 50], [-4, 62], [5, 63]], 1.5),
    ...spawns("cryo-vault-s", "cryoScientist", [[-10, 44], [10, 44], [-1, 57]], 1.5),
    ...spawns("cryo-spire-t", "technician", [[-10, 70], [10, 70], [-6, 79], [2, 88]], 2),
    ...spawns("cryo-spire-a", "armoredGuard", [[4, 74], [-9, 85]], 1.5),
    ...spawns("cryo-spire-d", "patrolDrone", [[9, 81], [-1, 77]], 1.5),
    ...spawns("cryo-spire-r", "runner", [[-11, 76], [11, 88]], 3),
    ...spawns("cryo-core-boss", "cryoSentinel", [[0, 103]], 0),
    ...spawns("cryo-core-w", "worker", [[-8, 110], [8, 110], [-8, 94], [8, 94]], 1.5),
    // Supply pods, one per room.
    ...spawns("cryo-pod-dock", "pod", [[-9.5, 10.5]], 0),
    ...spawns("cryo-pod-cold", "pod", [[12.5, 14.5]], 0),
    ...spawns("cryo-pod-vault", "pod", [[-10.5, 64.5]], 0),
    ...spawns("cryo-pod-spire", "pod", [[11.5, 68.5]], 0),
  ],
};

/** Persistent IDs: never rename or reuse them, saves reference them. */
export const CRYO_QUESTS: QuestDef[] = [
  {
    id: "cryo-catch-crew",
    title: "Capture 6 dock workers",
    goal: { kind: "capture", target: "worker", count: 6 },
    prereqs: [],
    reward: { biomass: 15, xp: 15 },
  },
  {
    id: "cryo-open-cold",
    title: "Open cold storage",
    goal: { kind: "unlockDoor", door: "cryo-door-cold" },
    prereqs: ["cryo-catch-crew"],
    reward: { biomass: 25, xp: 30 },
  },
  {
    id: "cryo-crystals",
    title: "Bank 20 cryo crystals",
    goal: { kind: "bank", currency: "crystals", count: 20 },
    prereqs: ["cryo-open-cold"],
    reward: { biomass: 40, xp: 50 },
  },
  {
    id: "cryo-runners",
    title: "Catch 6 frost runners",
    goal: { kind: "capture", target: "frostRunner", count: 6 },
    prereqs: ["cryo-open-cold"],
    reward: { genetic: 10, xp: 50 },
  },
  {
    id: "cryo-open-vaults",
    title: "Open the cryo vaults",
    goal: { kind: "unlockDoor", door: "cryo-door-vaults" },
    prereqs: ["cryo-crystals"],
    reward: { xp: 60 },
  },
  {
    id: "cryo-drones",
    title: "Capture 6 patrol drones",
    goal: { kind: "capture", target: "patrolDrone", count: 6 },
    prereqs: ["cryo-open-vaults"],
    reward: { parts: 3, xp: 100 },
  },
  {
    id: "cryo-open-spire",
    title: "Climb into the research spire",
    goal: { kind: "unlockDoor", door: "cryo-door-spire" },
    prereqs: ["cryo-drones"],
    reward: { xp: 80 },
  },
  {
    id: "cryo-spire-staff",
    title: "Capture 8 spire staff",
    goal: { kind: "capture", target: ["technician", "armoredGuard"], count: 8 },
    prereqs: ["cryo-open-spire"],
    reward: { crystals: 15, xp: 120 },
  },
  {
    id: "cryo-open-core",
    title: "Break into the frozen core",
    goal: { kind: "unlockDoor", door: "cryo-door-core" },
    prereqs: ["cryo-spire-staff"],
    reward: { xp: 150 },
  },
  {
    id: "cryo-boss",
    title: "Defeat the cryo sentinel",
    goal: { kind: "defeatBoss" },
    prereqs: ["cryo-open-core"],
    reward: { parts: 10, xp: 300 },
  },
];

export const CRYO_LABS: BiomeDef = {
  id: "cryo",
  name: "Cryo labs",
  region: "Facility floor B2",
  arrival: "The cold bites. Something in the freezers is still alive, and the staff down here aren't scared of you yet.",
  map: CRYO_MAP,
  quests: CRYO_QUESTS,
  objective: {
    name: "Heat exchanger",
    task: "Restart the heat exchanger",
    doneTitle: "Heat exchanger running",
    doneBody: "Warmth floods the floor and the freight elevator below shudders awake. It's at the far end of the frozen core: take it down when you're ready.",
    x: 0,
    z: 109.5,
    halfSize: 0.9,
    interactRadius: 3,
    repair: { quests: ["cryo-boss"], cost: { crystals: 30, parts: 10, biomass: 300 } },
  },
  exit: { x: 0, z: 95.5, radius: 1.4, name: "Freight elevator", action: "Take the elevator down" },
  sites: { vat: { x: -11.5, z: 37 } },
  structureGate: "cryo-open-cold",
};
