import type { Requirements } from "../domain/requirements";
import type { Reward } from "./currencies";
import { FACILITY, type MapDef } from "./map";
import { QUESTS, type QuestDef } from "./quests";
import type { TargetTypeId } from "./targets";
import { CRYO_LABS } from "./cryo";
import { SPECIMEN_VAULTS } from "./vaults";
import { HANGAR } from "./hangar";
import { REACTOR } from "./reactor";

/** The machine a biome's quest chain ends at (the reactor console in the facility). */
export interface BiomeObjective {
  name: string;
  /** What completing it is called, e.g. "Repair the reactor". */
  task: string;
  /** Shown when it's completed: what it did for the way on. */
  doneTitle: string;
  doneBody: string;
  x: number;
  z: number;
  halfSize: number;
  /** The objective card shows within this distance. */
  interactRadius: number;
  /** Unscaled; costs scale with depth. */
  repair: Requirements;
}

interface Point {
  x: number;
  z: number;
}

/** The way on: the freight elevator in the facility, portals on other worlds. */
export interface BiomeExit {
  x: number;
  z: number;
  radius: number;
  /** e.g. "Freight elevator". */
  name: string;
  /** Button text, e.g. "Take the elevator down". */
  action: string;
}

/** One place in the chain: everything that resets when the player moves on. */
export interface BiomeDef {
  /** Persistent: never rename (saves record the floor they're on by it). New floors go at the end. */
  id: string;
  name: string;
  /** Where it is in the story, e.g. "Facility floor B1". */
  region: string;
  /** One line of story on arrival. */
  arrival: string;
  map: MapDef;
  /** Persistent quest IDs, unique within the biome. */
  quests: readonly QuestDef[];
  objective: BiomeObjective;
  exit: BiomeExit;
  /** Where structures stand on this floor. */
  sites: { vat: Point; refinery: Point; outpost: Point };
  /** The forward base: built once per floor, after this quest, for this (unscaled) cost. */
  outpost: { gate: string; cost: Reward };
  /** Quest that unlocks building structures here (they're carried over once built). */
  structureGate: string;
  /**
   * The objective machine's reward wave: its (unscaled) price once the objective is done,
   * and the free-roaming creatures it summons, cycled in order.
   */
  summon: { cost: Reward; types: readonly TargetTypeId[] };
}

/**
 * Hand-made biomes in story order (docs/EXPANSION_DESIGN.md). Saves record the floor
 * being played by id; moving on goes to the next one here, wrapping round at greater
 * depth and scaling. Only append (a fresh run reaches floor i at depth i).
 */
export const BIOMES: readonly BiomeDef[] = [
  {
    id: "facility",
    name: "Research wing",
    region: "Facility floor B1",
    arrival: "You've broken out of your pod. Somewhere below is the ship they took you from.",
    map: FACILITY,
    quests: QUESTS,
    objective: {
      ...REACTOR,
      task: "Repair the reactor",
      doneTitle: "Reactor repaired",
      doneBody: "Power is back to the freight elevator. It's just inside the reactor hall: take it down when you're ready. Everything you've harvested comes with you.",
    },
    // Just inside the reactor hall door, clear of the pillars and the console.
    exit: { x: 0, z: 79.5, radius: 1.4, name: "Freight elevator", action: "Take the elevator down" },
    sites: { vat: { x: 12.5, z: 25.5 }, refinery: { x: 12.5, z: 37 }, outpost: { x: 10, z: 55.5 } },
    // Halfway: in the security sector, so a trip from the reactor hall is short.
    outpost: { gate: "q-open-security", cost: { biomass: 200, parts: 10 } },
    structureGate: "q-open-service",
    summon: { cost: { biomass: 60 }, types: ["worker", "runner", "technician"] },
  },
  CRYO_LABS,
  SPECIMEN_VAULTS,
  HANGAR,
];
