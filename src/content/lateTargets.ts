import { WARDEN } from "./reactor";
import type { CombatDef, TargetDef, TargetTypeId } from "./targets";

/**
 * Creatures of the later portal worlds (Pyrra, Thessa, Kharon, Gloam, Aether). Numbers are
 * depth-0 equivalents, a little above Maren's and rising world by world; a fresh run meets
 * Pyrra at depth 7. Most are kin of earlier species and are drawn as recoloured versions
 * of their models (`appearance`); the rest have models of their own.
 *
 * Persistent IDs: saves name these in cargo and the bestiary. Never rename them.
 */
export const LATE_TARGET_IDS = [
  "cinderBeetle", "ashMoth", "magmaGolem", "emberGeode", "calderaTitan",
  "capGrazer", "sporeling", "mycelidLasher", "puffcap", "sporemother",
  "crystalMite", "driftJelly", "voidMantis", "moonGeode", "shardHydra",
  "bogToad", "reedDarter", "bogBrute", "peatPod", "mireLeviathan",
  "cliffStrider", "skyRay", "galeHarrier", "nestEgg", "stormRoc",
] as const;
export type LateTargetId = (typeof LATE_TARGET_IDS)[number];

/** A guard's fight, scaled from a shared base so each world's defenders step up evenly. */
function guard(k: number, over: Partial<CombatDef> = {}): CombatDef {
  return {
    detectRadius: 7,
    leashRadius: 10,
    chaseSpeed: 2.3,
    attackRange: 2,
    damage: Math.round(23 * k),
    windupSeconds: 0.75,
    cooldownSeconds: 2.1,
    heldCreepSpeed: 0.4,
    ...over,
  };
}

/** Every boss of these worlds: multi-grab, weightless, returns after a while for farming. */
const BOSS_BASE = { behavior: "boss", weight: 0, multiGrab: true, captureDecaySeconds: 20, respawnSeconds: 180 } as const;

export const LATE_TARGETS: Record<LateTargetId, TargetDef> = {
  // --- Pyrra, the ember caldera (portal world 4). Ember glass is its currency.
  // Cinder beetle: a slow, armoured grazer with glowing seams of glass in its shell.
  cinderBeetle: {
    id: "cinderBeetle", name: "Cinder beetle", behavior: "wander",
    resistance: 37, weight: 2, reward: { biomass: 5, glass: 1 }, xp: 14, speed: 0.85, respawnSeconds: 10,
    appearance: { like: "hiveForager", tint: [0.32, 0.16, 0.12], glow: [1, 0.45, 0.1], size: 1.1 },
  },
  // Ash moth: light and skittish, it flutters off the moment you get close.
  ashMoth: {
    id: "ashMoth", name: "Ash moth", behavior: "flee",
    resistance: 24, weight: 1, reward: { biomass: 3, glass: 0.5 }, xp: 10, speed: 1.6, fleeSpeed: 3.6, fleeRadius: 5, respawnSeconds: 7,
  },
  // Magma golem: basalt with a molten core. Slow to anger, hits hard.
  magmaGolem: {
    id: "magmaGolem", name: "Magma golem", behavior: "guard",
    resistance: 78, weight: 4, reward: { biomass: 10, glass: 2, parts: 1 }, xp: 30, speed: 0.9, respawnSeconds: 18,
    combat: guard(1.05, { attackRange: 2.1, heldCreepSpeed: 0.45 }),
    appearance: { like: "relicGolem", tint: [0.18, 0.15, 0.15], glow: [1, 0.35, 0.05], size: 1.05 },
  },
  // Ember geode: a crust of black glass round a glowing heart. Crack it open.
  emberGeode: {
    id: "emberGeode", name: "Ember geode", behavior: "static",
    resistance: 76, weight: 3, reward: { genetic: 3, glass: 3 }, xp: 19, speed: 0, respawnSeconds: 45,
    appearance: { like: "burialUrn", tint: [0.14, 0.12, 0.13], glow: [1, 0.5, 0.1] },
  },
  // The caldera titan: a walking mountain of basalt that bursts the ground in rings.
  calderaTitan: {
    ...BOSS_BASE, id: "calderaTitan", name: "Caldera titan",
    resistance: 1750, reward: { glass: 25, biomass: 260, genetic: 24, parts: 9 }, xp: 750, speed: 0.85,
    bossTuning: {
      ...WARDEN,
      slamRadius: 4, slamDamage: 38, slamWindup: 1.25,
      chargeWindup: 1.4, chargeSpeed: 9, chargeDistance: 12, chargeDamage: 44, walkSpeed: 0.85,
      special: {
        kind: "nova", label: "Eruption rings", minRange: 0, maxRange: 14, cooldown: 8, cast: 1.2,
        waves: 3, spacing: 2.6, radius: 1.2, delay: 1.2, stagger: 0.45, damage: 32,
      },
    },
  },

  // --- Thessa, the fungal hollows (portal world 5). Glow spores are its currency.
  // Cap grazer: a lumbering lizard with mushrooms sprouting along its back.
  capGrazer: {
    id: "capGrazer", name: "Cap grazer", behavior: "wander",
    resistance: 39, weight: 2, reward: { biomass: 5, spores: 1 }, xp: 15, speed: 0.8, respawnSeconds: 10,
    appearance: { like: "sandSkink", tint: [0.45, 0.3, 0.55], glow: [0.5, 1, 0.4], size: 1.1 },
  },
  // Sporeling: a pale little runner that scatters in a puff of spores.
  sporeling: {
    id: "sporeling", name: "Sporeling", behavior: "flee",
    resistance: 25, weight: 1, reward: { biomass: 3, spores: 0.5 }, xp: 10, speed: 1.6, fleeSpeed: 3.5, fleeRadius: 5, respawnSeconds: 7,
    appearance: { like: "skitter", tint: [0.75, 0.9, 0.65], glow: [0.6, 1, 0.4] },
  },
  // Mycelid lasher: a coiled stalk of fungus that whips out a long way. Fights back.
  mycelidLasher: {
    id: "mycelidLasher", name: "Mycelid lasher", behavior: "guard",
    resistance: 80, weight: 3, reward: { biomass: 10, spores: 2, parts: 1 }, xp: 31, speed: 1.1, respawnSeconds: 18,
    combat: guard(1.1, { attackRange: 2.3, windupSeconds: 0.7, heldCreepSpeed: 0.6 }),
    appearance: { like: "lancerEel", tint: [0.35, 0.5, 0.45], glow: [0.5, 1, 0.5] },
  },
  // Puffcap: a fat glowing mushroom. Never moves; break it open for spores.
  puffcap: {
    id: "puffcap", name: "Puffcap", behavior: "static",
    resistance: 78, weight: 3, reward: { genetic: 3, spores: 3 }, xp: 20, speed: 0, respawnSeconds: 45,
  },
  // The sporemother: a mountainous fungus that fills its hollow with bursting spore pods.
  sporemother: {
    ...BOSS_BASE, id: "sporemother", name: "Sporemother",
    resistance: 1850, reward: { spores: 25, biomass: 280, genetic: 26, parts: 9 }, xp: 800, speed: 0.75,
    bossTuning: {
      ...WARDEN,
      slamRadius: 4.2, slamDamage: 38, slamWindup: 1.3,
      chargeWindup: 1.5, chargeSpeed: 8, chargeDistance: 11, chargeDamage: 42, walkSpeed: 0.75,
      special: {
        kind: "icefall", label: "Spore pods bursting", minRange: 0, maxRange: 15, cooldown: 7.5, cast: 1,
        count: 9, radius: 1.7, spread: 0, delay: 1.6, stagger: 0.12, damage: 30, chill: 0, scatter: true, style: "spore",
      },
    },
  },

  // --- Kharon, the shattered moon (portal world 6). Moonstone is its currency.
  // Crystal mite: a sideways-scuttling crab grown over with pale crystal.
  crystalMite: {
    id: "crystalMite", name: "Crystal mite", behavior: "wander",
    resistance: 41, weight: 2, reward: { biomass: 5, moonstone: 1 }, xp: 15, speed: 0.9, respawnSeconds: 10,
    appearance: { like: "reefCrab", tint: [0.6, 0.68, 0.85], glow: [0.5, 0.85, 1] },
  },
  // Drift jelly: floats in the thin air and drifts away from anything that approaches.
  driftJelly: {
    id: "driftJelly", name: "Drift jelly", behavior: "flee",
    resistance: 26, weight: 1, reward: { biomass: 3, moonstone: 0.5 }, xp: 11, speed: 1.4, fleeSpeed: 3.4, fleeRadius: 5.5, respawnSeconds: 7,
  },
  // Void mantis: an ink-black mantis with scythes of violet glass. Fights back.
  voidMantis: {
    id: "voidMantis", name: "Void mantis", behavior: "guard",
    resistance: 84, weight: 3, reward: { biomass: 11, moonstone: 2, parts: 1 }, xp: 33, speed: 1.2, respawnSeconds: 18,
    combat: guard(1.15, { chaseSpeed: 2.6, windupSeconds: 0.65, heldCreepSpeed: 0.6 }),
    appearance: { like: "hiveWarrior", tint: [0.2, 0.16, 0.32], glow: [0.75, 0.45, 1] },
  },
  // Moon geode: a grey shell clamped to the rock, glowing violet inside.
  moonGeode: {
    id: "moonGeode", name: "Moon geode", behavior: "static",
    resistance: 80, weight: 3, reward: { genetic: 3, moonstone: 3 }, xp: 21, speed: 0, respawnSeconds: 45,
    appearance: { like: "pearlClam", tint: [0.55, 0.55, 0.62], glow: [0.8, 0.55, 1] },
  },
  // The shard hydra: a crystal beast with many heads that fires beams in a cross.
  shardHydra: {
    ...BOSS_BASE, id: "shardHydra", name: "Shard hydra",
    resistance: 1950, reward: { moonstone: 25, biomass: 300, genetic: 28, parts: 10 }, xp: 850, speed: 0.9,
    bossTuning: {
      ...WARDEN,
      slamRadius: 4, slamDamage: 40, slamWindup: 1.2,
      chargeWindup: 1.4, chargeSpeed: 9.5, chargeDistance: 12, chargeDamage: 46, walkSpeed: 0.9,
      special: {
        kind: "crossfire", label: "Crossfire beams", minRange: 0, maxRange: 14, cooldown: 7, cast: 1.6,
        length: 14, halfWidth: 0.85, delay: 1.1, second: 0.6, damage: 36,
      },
    },
  },

  // --- Gloam, the sunken marsh (portal world 7). Bog iron is its currency.
  // Bog toad: a wide, warty toad squatting in the shallows, iron nodules in its skin.
  bogToad: {
    id: "bogToad", name: "Bog toad", behavior: "wander",
    resistance: 43, weight: 2, reward: { biomass: 6, bogiron: 1 }, xp: 16, speed: 0.75, respawnSeconds: 10,
  },
  // Reed darter: a slim fish that darts off through the reeds.
  reedDarter: {
    id: "reedDarter", name: "Reed darter", behavior: "flee",
    resistance: 27, weight: 1, reward: { biomass: 3, bogiron: 0.5 }, xp: 11, speed: 1.6, fleeSpeed: 3.5, fleeRadius: 5, respawnSeconds: 7,
    appearance: { like: "skimmer", tint: [0.45, 0.5, 0.25], glow: [0.85, 1, 0.4] },
  },
  // Bog brute: a hulking hybrid of mud and muscle. Fights back.
  bogBrute: {
    id: "bogBrute", name: "Bog brute", behavior: "guard",
    resistance: 88, weight: 4, reward: { biomass: 12, bogiron: 2, parts: 1 }, xp: 35, speed: 0.95, respawnSeconds: 18,
    combat: guard(1.2, { attackRange: 2.1, heldCreepSpeed: 0.45 }),
    appearance: { like: "chimera", tint: [0.32, 0.3, 0.2], glow: [0.8, 1, 0.3], size: 1.1 },
  },
  // Peat pod: a swollen sac rooted in the peat, heavy with iron.
  peatPod: {
    id: "peatPod", name: "Peat pod", behavior: "static",
    resistance: 82, weight: 3, reward: { genetic: 3, bogiron: 3 }, xp: 22, speed: 0, respawnSeconds: 45,
    appearance: { like: "broodSac", tint: [0.38, 0.3, 0.2], glow: [0.75, 1, 0.3] },
  },
  // The mire leviathan: a vast eel-thing that churns the pool into a whirlpool and drags you in.
  mireLeviathan: {
    ...BOSS_BASE, id: "mireLeviathan", name: "Mire leviathan",
    resistance: 2050, reward: { bogiron: 25, biomass: 320, genetic: 30, parts: 10 }, xp: 900, speed: 0.85,
    bossTuning: {
      ...WARDEN,
      slamRadius: 4.2, slamDamage: 42, slamWindup: 1.25,
      chargeWindup: 1.4, chargeSpeed: 9.5, chargeDistance: 13, chargeDamage: 48, walkSpeed: 0.85,
      special: {
        kind: "pull", label: "Whirlpool: swim clear!", minRange: 4.5, maxRange: 12, cooldown: 8, cast: 2.2,
        strength: 1.5, reach: 13, radius: 3.6, damage: 44,
      },
    },
  },

  // --- Aether, the sky reefs (portal world 8). Sky silk is its currency.
  // Cliff strider: a long-legged lizard picking its way along the island edges.
  cliffStrider: {
    id: "cliffStrider", name: "Cliff strider", behavior: "wander",
    resistance: 45, weight: 2, reward: { biomass: 6, silk: 1 }, xp: 16, speed: 0.9, respawnSeconds: 10,
    appearance: { like: "duneRunner", tint: [0.85, 0.82, 0.9], glow: [0.6, 0.8, 1], size: 1.1 },
  },
  // Sky ray: a gliding manta that rides the wind away from you.
  skyRay: {
    id: "skyRay", name: "Sky ray", behavior: "flee",
    resistance: 28, weight: 1, reward: { biomass: 3, silk: 0.5 }, xp: 12, speed: 1.7, fleeSpeed: 3.7, fleeRadius: 5.5, respawnSeconds: 7,
  },
  // Gale harrier: a lean, crested hunter that dives on intruders. Fights back.
  galeHarrier: {
    id: "galeHarrier", name: "Gale harrier", behavior: "guard",
    resistance: 92, weight: 3, reward: { biomass: 12, silk: 2, parts: 1 }, xp: 37, speed: 1.2, respawnSeconds: 18,
    combat: guard(1.25, { chaseSpeed: 2.7, windupSeconds: 0.65, heldCreepSpeed: 0.6 }),
    appearance: { like: "lurker", tint: [0.75, 0.78, 0.92], glow: [0.5, 0.8, 1], size: 1.1 },
  },
  // Nest egg: a big speckled egg in a nest of silk. Never moves.
  nestEgg: {
    id: "nestEgg", name: "Nest egg", behavior: "static",
    resistance: 84, weight: 3, reward: { genetic: 3, silk: 3 }, xp: 23, speed: 0, respawnSeconds: 45,
  },
  // The storm roc: a vast bird that soars out of reach and stoops on you from the clouds.
  stormRoc: {
    ...BOSS_BASE, id: "stormRoc", name: "Storm roc",
    resistance: 2150, reward: { silk: 25, biomass: 340, genetic: 32, parts: 11 }, xp: 950, speed: 1,
    bossTuning: {
      ...WARDEN,
      slamRadius: 4, slamDamage: 42, slamWindup: 1.2,
      chargeWindup: 1.3, chargeSpeed: 10.5, chargeDistance: 13, chargeDamage: 48, walkSpeed: 1,
      special: {
        kind: "burrow", fly: true, label: "Soaring: keep moving", minRange: 0, maxRange: 16, cooldown: 9, cast: 0.9,
        speed: 5.5, maxSeconds: 3.5, eruptWindup: 1.1, radius: 2.8, damage: 44, stun: 2.2,
      },
    },
  },
};

/** Capture goals for "catch N" cravings on these worlds. */
export const LATE_CRAVING_GOALS: Partial<Record<TargetTypeId, number>> = {
  cinderBeetle: 8, ashMoth: 10, magmaGolem: 4, emberGeode: 3,
  capGrazer: 8, sporeling: 10, mycelidLasher: 4, puffcap: 3,
  crystalMite: 8, driftJelly: 10, voidMantis: 4, moonGeode: 3,
  bogToad: 8, reedDarter: 10, bogBrute: 4, peatPod: 3,
  cliffStrider: 8, skyRay: 10, galeHarrier: 4, nestEgg: 3,
};
