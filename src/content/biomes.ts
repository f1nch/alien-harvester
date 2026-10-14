import type { Requirements } from "../domain/requirements";
import { FACILITY, type MapDef } from "./map";
import { QUESTS, type QuestDef } from "./quests";
import { CRYO_LABS } from "./cryo";
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
  /** Persistent: never rename (saves record depth, which indexes this list). */
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
  sites: { vat: { x: number; z: number } };
  /** Quest that unlocks building structures here (they're carried over once built). */
  structureGate: string;
}

/**
 * Hand-made biomes in story order (docs/EXPANSION_DESIGN.md). Depth d plays
 * BIOMES[d % length]; after the last one they repeat at higher depth and scaling.
 * Only append: depth indexes this list.
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
    sites: { vat: { x: 12.5, z: 25.5 } },
    structureGate: "q-open-service",
  },
  CRYO_LABS,
];
