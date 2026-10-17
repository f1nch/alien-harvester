import type { BiomeDef } from "./biomes";
import { box, rect, spawns, type MapDef, type Rect, withCrowds } from "./map";
import type { QuestDef } from "./quests";

/**
 * Specimen vaults: facility floor B3, where the facility keeps its real experiments.
 * Handlers walk the pens, escaped lurkers bolt between tanks, chimeras fight back,
 * and specimen tanks hold rich genetic material. The alpha specimen waits in its
 * containment at the far end. Numbers are depth-0 equivalents; the floor is played at
 * depth 2 or deeper and scaled from there.
 */

const HALF_W = 14;
const DOOR_HALF = 1.5;

function divider(minZ: number, maxZ: number): Rect[] {
  return [rect(-HALF_W, -DOOR_HALF, minZ, maxZ), rect(DOOR_HALF, HALF_W, minZ, maxZ)];
}

export const VAULTS_MAP: MapDef = {
  bounds: rect(-HALF_W, HALF_W, -17, 112),
  zones: [
    { id: "intake", name: "Specimen intake", theme: "containment", rect: rect(-11, 11, -17, 12), tint: [1.05, 0.95, 0.9] },
    { id: "pens", name: "Holding pens", theme: "security", rect: rect(-14, 14, 13, 40), tint: [1.1, 0.92, 0.85] },
    { id: "tanks", name: "Tank hall", theme: "vault", rect: rect(-12, 12, 41, 66), tint: [0.85, 1.15, 0.9] },
    { id: "surgery", name: "Surgical theatre", theme: "lab", rect: rect(-13, 13, 67, 90), tint: [1.0, 1.0, 1.1] },
    { id: "alpha", name: "Alpha containment", theme: "core", rect: rect(-10, 10, 91, 112), tint: [1.2, 0.85, 0.95] },
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
    // Specimen intake: transport crates and a sorting table.
    box(-6.5, -3, 2.2, 1.4),
    box(6.5, 2, 1.4, 2.4),
    box(-2, 7, 2.4, 1.2),
    // Holding pens: cage blocks along both walls.
    box(-10, 18, 2.4, 2.4),
    box(10, 18, 2.4, 2.4),
    box(-10, 30, 2.4, 2.4),
    box(10, 30, 2.4, 2.4),
    box(0, 25, 1.4, 1.4),
    // Tank hall: rows of empty tanks (the full ones are specimens to crack open).
    box(-6, 46, 1.4, 1.4),
    box(6, 46, 1.4, 1.4),
    box(-6, 60, 1.4, 1.4),
    box(6, 60, 1.4, 1.4),
    // Surgical theatre: operating tables and instrument racks.
    box(-6, 73, 2.6, 1.2),
    box(6, 73, 2.6, 1.2),
    box(0, 80, 1.6, 1.6),
    box(-8, 86, 1.2, 2.4),
    box(8, 86, 1.2, 2.4),
    // Alpha containment: restraint pylons, and the containment override console.
    box(-5.5, 97, 1.4, 1.4),
    box(5.5, 97, 1.4, 1.4),
    box(-5.5, 105, 1.4, 1.4),
    box(5.5, 105, 1.4, 1.4),
    box(0, 109.5, 1.8, 1.8),
  ],
  doors: [
    {
      id: "vault-door-pens",
      name: "Holding pens door",
      rect: rect(-DOOR_HALF, DOOR_HALF, 12, 13),
      from: "intake",
      to: "pens",
      requirements: { quests: ["vault-catch-handlers"], cost: { biomass: 90, genetic: 10 } },
    },
    {
      id: "vault-door-tanks",
      name: "Tank hall door",
      rect: rect(-DOOR_HALF, DOOR_HALF, 40, 41),
      from: "pens",
      to: "tanks",
      requirements: { quests: ["vault-genetic"], cost: { biomass: 240, genetic: 25 } },
    },
    {
      id: "vault-door-surgery",
      name: "Surgical theatre door",
      rect: rect(-DOOR_HALF, DOOR_HALF, 66, 67),
      from: "tanks",
      to: "surgery",
      requirements: { quests: ["vault-tanks"], cost: { biomass: 340, genetic: 35, parts: 4 } },
    },
    {
      id: "vault-door-alpha",
      name: "Alpha containment door",
      rect: rect(-DOOR_HALF, DOOR_HALF, 90, 91),
      from: "surgery",
      to: "alpha",
      requirements: { quests: ["vault-chimeras"], cost: { biomass: 420, genetic: 45, parts: 8 } },
    },
  ],
  spawns: withCrowds([
    ...spawns("vault-intake-w", "worker", [[-7, -8], [3, -7], [8, -2], [-8, 3], [1, 2]]),
    ...spawns("vault-intake-h", "handler", [[-3, -3], [6, 7], [-8, 9]], 2),
    ...spawns("vault-pens-h", "handler", [[-5, 16], [5, 21], [-4, 34]], 2),
    ...spawns("vault-pens-l", "lurker", [[6, 35], [-12, 24], [12, 24], [-6, 27]], 3.5),
    ...spawns("vault-pens-g", "guard", [[4, 29], [-1, 37]], 1.5),
    ...spawns("vault-tanks-t", "specimenTank", [[-9, 44], [9, 44], [-9, 63], [9, 63], [0, 53]], 0),
    ...spawns("vault-tanks-l", "lurker", [[-3, 50], [3, 57], [-8, 53]], 3),
    ...spawns("vault-tanks-c", "chimera", [[6, 52], [-2, 62]], 1.5),
    ...spawns("vault-surgery-t", "technician", [[-10, 70], [10, 70], [-3, 87]], 2),
    ...spawns("vault-surgery-c", "chimera", [[3, 77], [-8, 79], [9, 80]], 1.5),
    ...spawns("vault-surgery-a", "armoredGuard", [[-3, 76]], 1.5),
    ...spawns("vault-surgery-h", "handler", [[4, 86], [11, 76]], 2),
    ...spawns("vault-alpha-boss", "alphaSpecimen", [[0, 103]], 0),
    ...spawns("vault-alpha-l", "lurker", [[-8, 110], [8, 110], [-8, 94], [8, 94]], 1.5),
    // Supply pods, one per room.
    ...spawns("vault-pod-intake", "pod", [[9.5, 10.5]], 0),
    ...spawns("vault-pod-pens", "pod", [[-12.5, 38.5]], 0),
    ...spawns("vault-pod-tanks", "pod", [[10.5, 64.5]], 0),
    ...spawns("vault-pod-surgery", "pod", [[-11.5, 68.5]], 0),
  ]),
};

/** Persistent IDs: never rename or reuse them, saves reference them. */
export const VAULT_QUESTS: QuestDef[] = [
  {
    id: "vault-catch-handlers",
    title: "Capture 4 handlers",
    goal: { kind: "capture", target: "handler", count: 4 },
    prereqs: [],
    reward: { biomass: 20, xp: 20 },
  },
  {
    id: "vault-open-pens",
    title: "Open the holding pens",
    goal: { kind: "unlockDoor", door: "vault-door-pens" },
    prereqs: ["vault-catch-handlers"],
    reward: { genetic: 5, xp: 30 },
  },
  {
    id: "vault-lurkers",
    title: "Catch 6 lurkers",
    goal: { kind: "capture", target: "lurker", count: 6 },
    prereqs: ["vault-open-pens"],
    reward: { genetic: 10, xp: 50 },
  },
  {
    id: "vault-genetic",
    title: "Bank 25 genetic material",
    goal: { kind: "bank", currency: "genetic", count: 25 },
    prereqs: ["vault-open-pens"],
    reward: { biomass: 50, xp: 50 },
  },
  {
    id: "vault-open-tanks",
    title: "Open the tank hall",
    goal: { kind: "unlockDoor", door: "vault-door-tanks" },
    prereqs: ["vault-genetic"],
    reward: { xp: 60 },
  },
  {
    id: "vault-tanks",
    title: "Crack open 5 specimen tanks",
    goal: { kind: "capture", target: "specimenTank", count: 5 },
    prereqs: ["vault-open-tanks"],
    reward: { parts: 3, xp: 100 },
  },
  {
    id: "vault-open-surgery",
    title: "Enter the surgical theatre",
    goal: { kind: "unlockDoor", door: "vault-door-surgery" },
    prereqs: ["vault-tanks"],
    reward: { xp: 80 },
  },
  {
    id: "vault-chimeras",
    title: "Capture 6 chimeras",
    goal: { kind: "capture", target: "chimera", count: 6 },
    prereqs: ["vault-open-surgery"],
    reward: { genetic: 20, xp: 120 },
  },
  {
    id: "vault-open-alpha",
    title: "Break into alpha containment",
    goal: { kind: "unlockDoor", door: "vault-door-alpha" },
    prereqs: ["vault-chimeras"],
    reward: { xp: 150 },
  },
  {
    id: "vault-boss",
    title: "Defeat the alpha specimen",
    goal: { kind: "defeatBoss" },
    prereqs: ["vault-open-alpha"],
    reward: { parts: 10, xp: 300 },
  },
];

export const SPECIMEN_VAULTS: BiomeDef = {
  id: "vaults",
  name: "Specimen vaults",
  region: "Facility floor B3",
  arrival: "Tanks, cages, restraints. You aren't the only thing they caught, and some of the others are hungry too.",
  map: VAULTS_MAP,
  quests: VAULT_QUESTS,
  objective: {
    name: "Containment override",
    task: "Override containment",
    doneTitle: "Containment overridden",
    doneBody: "Every cell on the floor unlocks at once, and in the chaos the freight elevator below comes back to life. It's just inside alpha containment: take it down when you're ready.",
    x: 0,
    z: 109.5,
    halfSize: 0.9,
    interactRadius: 3,
    repair: { quests: ["vault-boss"], cost: { genetic: 60, parts: 12, biomass: 320 } },
  },
  exit: { x: 0, z: 95.5, radius: 1.4, name: "Freight elevator", action: "Take the elevator down" },
  sites: { vat: { x: -11.5, z: 36 }, refinery: { x: 8.5, z: -12 }, outpost: { x: 9.5, z: 53 } },
  // In the tank hall, halfway down the floor.
  outpost: { gate: "vault-open-tanks", cost: { genetic: 30, biomass: 200 } },
  structureGate: "vault-open-pens",
  summon: { cost: { genetic: 20, biomass: 60 }, types: ["handler", "lurker"] },
};
