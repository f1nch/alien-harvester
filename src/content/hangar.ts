import type { BiomeDef } from "./biomes";
import { box, rect, spawns, type MapDef, type Rect, withCrowds } from "./map";
import type { QuestDef } from "./quests";

/**
 * The hangar: facility floor B4, and the end of act 1. Your ship is here, gutted: its
 * drive core powers the facility's portal machine. Dockhands and mechanics strip
 * wrecks, loader mechs fight back, and fuel cells are worth cracking open. The overseer
 * mech guards the portal chamber. Numbers are depth-0 equivalents; the floor is played
 * at depth 3 or deeper and scaled from there.
 */

const HALF_W = 14;
const DOOR_HALF = 1.5;

function divider(minZ: number, maxZ: number): Rect[] {
  return [rect(-HALF_W, -DOOR_HALF, minZ, maxZ), rect(DOOR_HALF, HALF_W, minZ, maxZ)];
}

export const HANGAR_MAP: MapDef = {
  bounds: rect(-HALF_W, HALF_W, -17, 112),
  zones: [
    { id: "apron", name: "Hangar apron", theme: "dock", rect: rect(-11, 11, -17, 12), tint: [1.0, 0.95, 0.85] },
    { id: "workshops", name: "Repair workshops", theme: "service", rect: rect(-14, 14, 13, 40), tint: [1.05, 0.9, 0.8] },
    { id: "fuel", name: "Fuel depot", theme: "security", rect: rect(-12, 12, 41, 66), tint: [1.15, 1.0, 0.75] },
    { id: "bay", name: "Main bay", theme: "lab", rect: rect(-13, 13, 67, 90), tint: [0.9, 0.95, 1.1] },
    { id: "portal", name: "Portal chamber", theme: "core", rect: rect(-10, 10, 91, 112), tint: [0.95, 0.8, 1.25] },
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
    // Hangar apron: cargo containers and a tug.
    box(-6.5, -3, 2.6, 1.4),
    box(6.5, 2, 1.4, 2.6),
    box(-2, 7, 2.2, 1.2),
    // Repair workshops: workbenches and an engine on a stand.
    box(-10, 18, 2.2, 1.4),
    box(10, 18, 2.2, 1.4),
    box(-10, 30, 1.4, 2.2),
    box(10, 30, 1.4, 2.2),
    box(0, 25, 2, 2),
    // Fuel depot: tank farms on both sides.
    box(-6, 46, 1.6, 1.6),
    box(6, 46, 1.6, 1.6),
    box(-6, 60, 1.6, 1.6),
    box(6, 60, 1.6, 1.6),
    // Main bay: your ship's stripped hull, with gantries either side.
    box(0, 79, 9, 6),
    box(-9, 72, 1.2, 2.4),
    box(9, 72, 1.2, 2.4),
    box(-9, 86, 1.2, 1.2),
    box(9, 86, 1.2, 1.2),
    // Portal chamber: field emitters, and the portal machine.
    box(-5.5, 97, 1.4, 1.4),
    box(5.5, 97, 1.4, 1.4),
    box(-5.5, 105, 1.4, 1.4),
    box(5.5, 105, 1.4, 1.4),
    box(0, 109.5, 1.8, 1.8),
  ],
  doors: [
    {
      id: "hangar-door-workshops",
      name: "Workshop shutter",
      rect: rect(-DOOR_HALF, DOOR_HALF, 12, 13),
      from: "apron",
      to: "workshops",
      requirements: { quests: ["hangar-dockhands"], cost: { biomass: 100, parts: 4 } },
    },
    {
      id: "hangar-door-fuel",
      name: "Fuel depot door",
      rect: rect(-DOOR_HALF, DOOR_HALF, 40, 41),
      from: "workshops",
      to: "fuel",
      requirements: { quests: ["hangar-parts"], cost: { biomass: 260, parts: 10 } },
    },
    {
      id: "hangar-door-bay",
      name: "Main bay door",
      rect: rect(-DOOR_HALF, DOOR_HALF, 66, 67),
      from: "fuel",
      to: "bay",
      requirements: { quests: ["hangar-fuel"], cost: { biomass: 360, parts: 14, genetic: 20 } },
    },
    {
      id: "hangar-door-portal",
      name: "Portal chamber door",
      rect: rect(-DOOR_HALF, DOOR_HALF, 90, 91),
      from: "bay",
      to: "portal",
      requirements: { quests: ["hangar-loaders"], cost: { biomass: 440, parts: 18, alloy: 4 } },
    },
  ],
  spawns: withCrowds([
    ...spawns("hangar-apron-d", "dockhand", [[-7, -8], [3, -7], [8, -2], [-8, 3], [1, 2], [-3, -3]]),
    ...spawns("hangar-apron-w", "worker", [[6, 7], [-8, 9]], 2),
    ...spawns("hangar-shop-m", "mechanic", [[-5, 16], [5, 21], [-4, 34], [6, 35]], 3.5),
    ...spawns("hangar-shop-d", "dockhand", [[-12, 24], [12, 24], [-6, 27]], 2),
    ...spawns("hangar-shop-g", "guard", [[4, 29], [-1, 37]], 1.5),
    ...spawns("hangar-fuel-c", "fuelCell", [[-9, 44], [9, 44], [-9, 63], [9, 63], [0, 53]], 0),
    ...spawns("hangar-fuel-m", "mechanic", [[-3, 50], [3, 57], [-8, 53]], 3),
    ...spawns("hangar-fuel-l", "loaderMech", [[6, 52], [-2, 62]], 1.5),
    ...spawns("hangar-bay-l", "loaderMech", [[-7, 76], [7, 82], [-6, 88]], 1.5),
    ...spawns("hangar-bay-t", "technician", [[-11, 70], [11, 70], [3, 87]], 2),
    ...spawns("hangar-bay-a", "armoredGuard", [[6, 75]], 1.5),
    ...spawns("hangar-bay-d", "patrolDrone", [[-11, 80], [11, 80]], 1.5),
    ...spawns("hangar-portal-boss", "overseerMech", [[0, 103]], 0),
    ...spawns("hangar-portal-m", "mechanic", [[-8, 110], [8, 110], [-8, 94], [8, 94]], 1.5),
    // Supply pods, one per room.
    ...spawns("hangar-pod-apron", "pod", [[9.5, 10.5]], 0),
    ...spawns("hangar-pod-shop", "pod", [[-12.5, 38.5]], 0),
    ...spawns("hangar-pod-fuel", "pod", [[10.5, 64.5]], 0),
    ...spawns("hangar-pod-bay", "pod", [[-11.5, 68.5]], 0),
  ]),
};

/** Persistent IDs: never rename or reuse them, saves reference them. */
export const HANGAR_QUESTS: QuestDef[] = [
  {
    id: "hangar-dockhands",
    title: "Capture 6 dockhands",
    goal: { kind: "capture", target: "dockhand", count: 6 },
    prereqs: [],
    reward: { biomass: 25, xp: 20 },
  },
  {
    id: "hangar-open-workshops",
    title: "Open the workshops",
    goal: { kind: "unlockDoor", door: "hangar-door-workshops" },
    prereqs: ["hangar-dockhands"],
    reward: { parts: 2, xp: 30 },
  },
  {
    id: "hangar-mechanics",
    title: "Catch 6 mechanics",
    goal: { kind: "capture", target: "mechanic", count: 6 },
    prereqs: ["hangar-open-workshops"],
    reward: { genetic: 10, xp: 50 },
  },
  {
    id: "hangar-parts",
    title: "Bank 12 machine parts",
    goal: { kind: "bank", currency: "parts", count: 12 },
    prereqs: ["hangar-open-workshops"],
    reward: { biomass: 50, xp: 50 },
  },
  {
    id: "hangar-open-fuel",
    title: "Open the fuel depot",
    goal: { kind: "unlockDoor", door: "hangar-door-fuel" },
    prereqs: ["hangar-parts"],
    reward: { xp: 60 },
  },
  {
    id: "hangar-fuel",
    title: "Crack open 5 fuel cells",
    goal: { kind: "capture", target: "fuelCell", count: 5 },
    prereqs: ["hangar-open-fuel"],
    reward: { parts: 4, xp: 100 },
  },
  {
    id: "hangar-open-bay",
    title: "Enter the main bay",
    goal: { kind: "unlockDoor", door: "hangar-door-bay" },
    prereqs: ["hangar-fuel"],
    reward: { xp: 80 },
  },
  {
    id: "hangar-loaders",
    title: "Capture 6 loader mechs",
    goal: { kind: "capture", target: "loaderMech", count: 6 },
    prereqs: ["hangar-open-bay"],
    // Exactly the portal door's alloy (both scale the same way): no refinery needed.
    reward: { parts: 6, alloy: 4, xp: 120 },
  },
  {
    id: "hangar-open-portal",
    title: "Break into the portal chamber",
    goal: { kind: "unlockDoor", door: "hangar-door-portal" },
    prereqs: ["hangar-loaders"],
    reward: { xp: 150 },
  },
  {
    id: "hangar-boss",
    title: "Defeat the overseer mech",
    goal: { kind: "defeatBoss" },
    prereqs: ["hangar-open-portal"],
    reward: { parts: 12, xp: 320 },
  },
];

export const HANGAR: BiomeDef = {
  id: "hangar",
  name: "Hangar",
  region: "Facility floor B4",
  arrival: "Your ship! Or what's left of it. They pulled its drive core to power a portal machine at the far end of the hangar.",
  map: HANGAR_MAP,
  quests: HANGAR_QUESTS,
  objective: {
    name: "Portal machine",
    task: "Charge the portal",
    doneTitle: "Portal open",
    doneBody: "Your ship's drive core hums inside the machine and the portal tears open onto somewhere else entirely. You can't fly home yet, but you can go through. It's just inside the portal chamber: step through when you're ready.",
    x: 0,
    z: 109.5,
    halfSize: 0.9,
    interactRadius: 3,
    repair: { quests: ["hangar-boss"], cost: { parts: 24, alloy: 7, biomass: 360 } },
  },
  exit: { x: 0, z: 95.5, radius: 1.4, name: "Portal", action: "Step through the portal" },
  sites: { vat: { x: -11.5, z: 36 }, refinery: { x: 8.5, z: -12 }, outpost: { x: 9.5, z: 53 } },
  // In the fuel depot, halfway down the floor.
  outpost: { gate: "hangar-open-fuel", cost: { parts: 12, biomass: 220 } },
  structureGate: "hangar-open-workshops",
  summon: { cost: { parts: 6, biomass: 60 }, types: ["dockhand", "mechanic"] },
};
