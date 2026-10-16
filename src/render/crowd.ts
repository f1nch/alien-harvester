import {
  Color3, InstancedMesh, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, TransformNode, Vector3,
} from "@babylonjs/core";
import { WARDEN, type BossTuning } from "../content/reactor";
import { TARGETS, type TargetTypeId } from "../content/targets";
import type { HazardStyle } from "../game/systems/boss";
import type { TargetEntity } from "../game/world";

interface Visual {
  type: TargetTypeId;
  /** Attack telegraph for hostile types: an outline at strike range and a fill that grows during the windup. */
  telegraph?: { ring: Mesh; fill: Mesh };
  /** The warden's charge lane. */
  lane?: { outline: Mesh; fill: Mesh };
  node: TransformNode;
  parts: InstancedMesh[];
  /** Instances that swing from a pivot (hip or shoulder). */
  limbs: Array<{ inst: InstancedMesh; role: LimbRole; joint: boolean }>;
  phase: number;
  stride: number;
  initialized: boolean;
  /** How far a burrowing boss has sunk below the floor (0..1). */
  sink: number;
  accessories: Array<{ inst: InstancedMesh; rotor: boolean }>;
}

type LimbRole = "legL" | "legR" | "armL" | "armR" | "insectL0" | "insectL1" | "insectL2" | "insectR0" | "insectR1" | "insectR2";

/** A template: rigid parts baked in place, plus limbs baked with their pivot at the origin. */
interface Template {
  meshes: Mesh[];
  limbs: Array<{ index: number; role: LimbRole; pivot: Vector3; parentIndex?: number }>;
}

const SCALE = 1.2;

/** Bosses that tower over the rest get drawn bigger (the sim's hit radius is unchanged). */
/** How big a type is drawn: a variant's own size, else the boss sizes below. */
function sizeOf(type: TargetTypeId): number {
  return TARGETS[type].appearance?.size ?? BOSS_SIZE[type] ?? 1;
}

const BOSS_SIZE: Partial<Record<TargetTypeId, number>> = { hiveQueen: 1.15, sandWyrm: 1.15, tideKraken: 1.2, overseerMech: 1.05 };
/** How high a flying boss soars while out of reach. */
const FLY_HEIGHT = 7;
/** World units a burrowed boss sinks: enough that only its crest shows. */
const BURROW_DEPTH = 3.4;

/** Small creatures that hover and bob instead of walking. */
const FLYERS = new Set<TargetTypeId>(["patrolDrone", "ashMoth", "driftJelly", "skyRay"]);

/** Hovers instead of walking. */
function flyingBoss(type: TargetTypeId): boolean {
  return type === "cryoSentinel";
}

interface Dissolve {
  visual: Visual;
  t: number;
  from: Vector3;
}

const DISSOLVE_SECONDS = 0.35;
/** Height a tentacle grabs a target at. */
export const GRAB_HEIGHT = 0.9;

function mat(scene: Scene, name: string, r: number, g: number, b: number, spec = 0.1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = new Color3(r, g, b);
  m.specularColor = new Color3(spec, spec, spec);
  m.specularPower = 48;
  return m;
}

/**
 * Stylised humans. Each type differs in silhouette as well as colour, so
 * types stay distinguishable without relying on colour alone. Legs and arms
 * are separate pieces that swing from hip and shoulder pivots.
 */
function makeTemplate(scene: Scene, type: TargetTypeId): Template {
  const skin = mat(scene, `${type}Skin`, 0.93, 0.74, 0.6, 0.05);
  const meshes: Mesh[] = [];
  const limbs: Template["limbs"] = [];
  const add = (m: Mesh, material: StandardMaterial, y: number, x = 0, z = 0) => {
    m.position.set(x, y, z);
    m.material = material;
    meshes.push(m);
  };
  /** Two segments per limb, with an elbow/knee and a shaped hand/foot. */
  const pair = (kind: "leg" | "arm", length: number, radius: number, material: StandardMaterial, px: number, py: number) => {
    for (const side of [-1, 1] as const) {
      const upperLength = length * 0.52;
      const lowerLength = length * 0.48;
      const m = MeshBuilder.CreateCapsule(`${type}${kind}`, { height: upperLength + radius, radius, tessellation: 18 }, scene);
      m.position.y = -upperLength / 2;
      m.scaling.setAll(SCALE);
      m.position.scaleInPlace(SCALE);
      m.bakeCurrentTransformIntoVertices();
      m.material = material;
      m.isVisible = false;
      const role = `${kind}${side < 0 ? "L" : "R"}` as LimbRole;
      const parentIndex = meshes.length;
      limbs.push({ index: parentIndex, role, pivot: new Vector3(px * side, py, 0).scaleInPlace(SCALE) });
      meshes.push(m);
      const lower = MeshBuilder.CreateCapsule(`${type}${kind}Lower`, { height: lowerLength + radius * 0.7, radius: radius * 0.82, tessellation: 18 }, scene);
      lower.position.y = -lowerLength / 2;
      const end = MeshBuilder.CreateSphere(`${type}${kind}End`, { diameter: radius * 2.2, segments: 18 }, scene);
      end.position.set(0, -lowerLength + radius * 0.4, kind === "leg" ? radius * 0.65 : 0);
      end.scaling.set(1, kind === "leg" ? 0.65 : 1.05, kind === "leg" ? 1.65 : 0.85);
      lower.material = end.material = material;
      const segment = Mesh.MergeMeshes([lower, end], true, true)!;
      segment.scaling.setAll(SCALE);
      segment.bakeCurrentTransformIntoVertices();
      segment.isVisible = false;
      limbs.push({ index: meshes.length, role, pivot: new Vector3(0, -upperLength * SCALE, 0), parentIndex });
      meshes.push(segment);
    }
  };

  if (type === "worker") {
    // Stocky jumpsuit with a hard hat.
    const suit = mat(scene, "workerSuit", 0.95, 0.5, 0.12);
    add(MeshBuilder.CreateCapsule("workerBody", { height: 0.66, radius: 0.22, tessellation: 16 }, scene), suit, 0.72);
    add(MeshBuilder.CreateSphere("workerHead", { diameter: 0.34, segments: 16 }, scene), skin, 1.12);
    add(MeshBuilder.CreateSphere("workerHat", { diameter: 0.38, segments: 16, slice: 0.5 }, scene), mat(scene, "workerHat", 0.98, 0.88, 0.2, 0.4), 1.17);
    pair("leg", 0.46, 0.085, mat(scene, "workerBoots", 0.55, 0.3, 0.1), 0.1, 0.45);
    pair("arm", 0.42, 0.07, suit, 0.27, 0.95);
  } else if (type === "runner") {
    // Tall and thin with a headband and trailing ponytail: reads as fast.
    const suit = mat(scene, "runnerSuit", 0.2, 0.55, 1);
    add(MeshBuilder.CreateCapsule("runnerBody", { height: 0.62, radius: 0.15, tessellation: 16 }, scene), suit, 0.84);
    add(MeshBuilder.CreateSphere("runnerHead", { diameter: 0.3, segments: 16 }, scene), skin, 1.22);
    add(MeshBuilder.CreateTorus("runnerBand", { diameter: 0.3, thickness: 0.06, tessellation: 16 }, scene), mat(scene, "runnerBand", 1, 0.25, 0.4), 1.27);
    add(MeshBuilder.CreateCapsule("runnerTail", { height: 0.32, radius: 0.05, tessellation: 10 }, scene), mat(scene, "runnerHair", 0.25, 0.15, 0.1), 1.18, 0, -0.17);
    pair("leg", 0.55, 0.07, mat(scene, "runnerLegs", 0.12, 0.3, 0.7), 0.08, 0.56);
    pair("arm", 0.46, 0.055, skin, 0.2, 1.04);
  } else if (type === "guard") {
    // Security guard: navy uniform, peaked cap, baton held forward.
    const suit = mat(scene, "guardSuit", 0.12, 0.17, 0.38);
    add(MeshBuilder.CreateCapsule("guardBody", { height: 0.68, radius: 0.24, tessellation: 16 }, scene), suit, 0.78);
    add(MeshBuilder.CreateSphere("guardHead", { diameter: 0.33, segments: 16 }, scene), skin, 1.15);
    add(MeshBuilder.CreateCylinder("guardCap", { height: 0.1, diameter: 0.38, tessellation: 20 }, scene), mat(scene, "guardCap", 0.08, 0.1, 0.22, 0.3), 1.29);
    add(MeshBuilder.CreateBox("guardVisor", { width: 0.3, height: 0.03, depth: 0.14 }, scene), mat(scene, "guardVisor", 0.05, 0.05, 0.07, 0.5), 1.25, 0, 0.17);
    const baton = MeshBuilder.CreateCylinder("guardBaton", { height: 0.6, diameter: 0.06, tessellation: 10 }, scene);
    baton.rotation.x = Math.PI / 2.4;
    add(baton, mat(scene, "guardBaton", 0.9, 0.85, 0.2, 0.6), 0.75, 0.3, 0.22);
    pair("leg", 0.47, 0.09, mat(scene, "guardTrousers", 0.08, 0.1, 0.22), 0.11, 0.47);
    pair("arm", 0.45, 0.075, suit, 0.3, 1.0);
  } else if (type === "boss") {
    // The reactor warden: a hulking armored figure with horns and a glowing reactor core.
    const plate = mat(scene, "wardenPlate", 0.32, 0.3, 0.36, 0.7);
    const dark = mat(scene, "wardenDark", 0.12, 0.1, 0.14, 0.4);
    const core = mat(scene, "wardenCore", 0, 0, 0);
    core.emissiveColor = new Color3(1, 0.35, 0.1);
    add(MeshBuilder.CreateCapsule("wardenBody", { height: 2.2, radius: 0.75, tessellation: 20 }, scene), dark, 1.15);
    add(MeshBuilder.CreateBox("wardenChest", { width: 1.7, height: 1.1, depth: 1.1 }, scene), plate, 1.55);
    add(MeshBuilder.CreateSphere("wardenCore", { diameter: 0.5, segments: 18 }, scene), core, 1.55, 0, 0.55);
    for (const side of [-1, 1]) {
      add(MeshBuilder.CreateSphere("wardenShoulder", { diameter: 0.85, segments: 16 }, scene), plate, 2.05, side * 0.95);
      const horn = MeshBuilder.CreateCylinder("wardenHorn", { diameterTop: 0, diameterBottom: 0.22, height: 0.7, tessellation: 12 }, scene);
      horn.rotation.z = -side * 0.5;
      add(horn, plate, 2.85, side * 0.35);
    }
    add(MeshBuilder.CreateSphere("wardenHelm", { diameter: 0.8, segments: 18 }, scene), plate, 2.5);
    const visor = mat(scene, "wardenVisor", 0, 0, 0);
    visor.emissiveColor = new Color3(1, 0.1, 0.05);
    add(MeshBuilder.CreateBox("wardenVisor", { width: 0.55, height: 0.1, depth: 0.12 }, scene), visor, 2.52, 0, 0.36);
    // Massive arms that swing as it stomps.
    pair("arm", 1.5, 0.28, dark, 1.05, 2.0);
  } else if (type === "armoredGuard") {
    // Armored guard: broad and plated with a visored helmet; reads as heavy at a glance.
    const plate = mat(scene, "armorPlate", 0.42, 0.45, 0.5, 0.6);
    const suit = mat(scene, "armorSuit", 0.2, 0.22, 0.26, 0.3);
    add(MeshBuilder.CreateCapsule("armorBody", { height: 0.72, radius: 0.31, tessellation: 18 }, scene), suit, 0.82);
    add(MeshBuilder.CreateBox("armorChest", { width: 0.6, height: 0.42, depth: 0.42 }, scene), plate, 0.8);
    for (const side of [-1, 1]) add(MeshBuilder.CreateSphere("armorShoulder", { diameter: 0.3, segments: 12 }, scene), plate, 1.0, side * 0.36);
    add(MeshBuilder.CreateSphere("armorHelmet", { diameter: 0.4, segments: 18 }, scene), plate, 1.2);
    const visor = mat(scene, "armorVisor", 0, 0, 0);
    visor.emissiveColor = new Color3(0.9, 0.15, 0.1);
    add(MeshBuilder.CreateBox("armorVisorStrip", { width: 0.28, height: 0.06, depth: 0.08 }, scene), visor, 1.22, 0, 0.18);
    pair("leg", 0.46, 0.12, plate, 0.15, 0.47);
    pair("arm", 0.5, 0.11, suit, 0.43, 0.98);
  } else if (type === "pod") {
    // Supply pod: a squat crate with glowing seams, so it reads as loot rather than a person.
    const shell = mat(scene, "podShell", 0.3, 0.32, 0.36, 0.4);
    const seam = mat(scene, "podSeam", 0, 0, 0);
    seam.emissiveColor = new Color3(1, 0.75, 0.25);
    add(MeshBuilder.CreateBox("podBody", { width: 0.62, height: 0.46, depth: 0.62 }, scene), shell, 0.23);
    add(MeshBuilder.CreateBox("podLid", { width: 0.68, height: 0.08, depth: 0.68 }, scene), shell, 0.5);
    add(MeshBuilder.CreateBox("podSeamH", { width: 0.64, height: 0.05, depth: 0.64 }, scene), seam, 0.3);
    add(MeshBuilder.CreateBox("podLight", { width: 0.14, height: 0.06, depth: 0.14 }, scene), seam, 0.57);
  } else if (type === "cryoScientist") {
    // Cryo scientist: puffy insulated parka, fur-lined hood, and a glowing crystal canister on the back.
    const parka = mat(scene, "cryoParka", 0.78, 0.88, 0.97);
    const fur = mat(scene, "cryoFur", 0.96, 0.97, 1);
    const crystal = mat(scene, "cryoCanisterGlow", 0, 0, 0);
    crystal.emissiveColor = new Color3(0.2, 0.9, 1);
    add(MeshBuilder.CreateCapsule("cryoSciBody", { height: 0.7, radius: 0.29, tessellation: 18 }, scene), parka, 0.76);
    add(MeshBuilder.CreateTorus("cryoSciBelt", { diameter: 0.56, thickness: 0.06, tessellation: 20 }, scene), mat(scene, "cryoBelt", 0.25, 0.3, 0.4), 0.7);
    add(MeshBuilder.CreateSphere("cryoSciHead", { diameter: 0.3, segments: 16 }, scene), skin, 1.15, 0, 0.02);
    // Hood: a fur ring around the face and a puffy cowl behind it.
    const ruff = MeshBuilder.CreateTorus("cryoSciRuff", { diameter: 0.4, thickness: 0.11, tessellation: 20 }, scene);
    ruff.rotation.x = Math.PI / 2.3;
    add(ruff, fur, 1.16, 0, 0.03);
    add(MeshBuilder.CreateSphere("cryoSciHood", { diameter: 0.42, segments: 16, slice: 0.6 }, scene), parka, 1.2, 0, -0.04);
    add(MeshBuilder.CreateCylinder("cryoCanister", { height: 0.5, diameter: 0.2, tessellation: 16 }, scene), crystal, 0.9, 0, -0.34);
    add(MeshBuilder.CreateBox("cryoCanisterStrap", { width: 0.3, height: 0.06, depth: 0.1 }, scene), mat(scene, "cryoStrap", 0.25, 0.3, 0.4), 0.9, 0, -0.3);
    pair("leg", 0.4, 0.1, mat(scene, "cryoSciBoots", 0.3, 0.38, 0.5), 0.12, 0.4);
    pair("arm", 0.42, 0.095, parka, 0.34, 0.98);
  } else if (type === "frostRunner") {
    // Frost runner: lean thermal suit, trailing scarf and goggles; no pack, so it reads sleek and fast.
    const suit = mat(scene, "frostSuit", 0.82, 0.93, 1);
    const scarf = mat(scene, "frostScarf", 0.35, 0.7, 0.95);
    add(MeshBuilder.CreateCapsule("frostBody", { height: 0.64, radius: 0.14, tessellation: 16 }, scene), suit, 0.84);
    add(MeshBuilder.CreateSphere("frostHead", { diameter: 0.28, segments: 16 }, scene), skin, 1.22);
    add(MeshBuilder.CreateTorus("frostCowl", { diameter: 0.22, thickness: 0.09, tessellation: 18 }, scene), scarf, 1.07);
    add(MeshBuilder.CreateCapsule("frostScarfTail", { height: 0.5, radius: 0.045, tessellation: 10 }, scene), scarf, 0.98, 0.07, -0.14);
    const goggles = MeshBuilder.CreateBox("frostGoggles", { width: 0.27, height: 0.07, depth: 0.1 }, scene);
    add(goggles, mat(scene, "frostLens", 0.15, 0.6, 0.9, 0.8), 1.24, 0, 0.12);
    pair("leg", 0.56, 0.065, mat(scene, "frostLegs", 0.55, 0.78, 0.95), 0.07, 0.56);
    pair("arm", 0.46, 0.05, suit, 0.19, 1.04);
  } else if (type === "patrolDrone") {
    // Patrol drone: a hovering rounded body with a red sensor eye and side rotors; no limbs.
    const hull = mat(scene, "droneHull", 0.55, 0.6, 0.66, 0.6);
    const dark = mat(scene, "droneDark", 0.14, 0.15, 0.2, 0.4);
    const eye = mat(scene, "droneEye", 0, 0, 0);
    eye.emissiveColor = new Color3(1, 0.1, 0.08);
    const body = MeshBuilder.CreateSphere("droneBody", { diameter: 0.7, segments: 18 }, scene);
    // Flatten now: the generic bake below resets scaling to SCALE.
    body.scaling.y = 0.6;
    body.bakeCurrentTransformIntoVertices();
    add(body, hull, 1.0);
    add(MeshBuilder.CreateSphere("droneEye", { diameter: 0.2, segments: 12 }, scene), eye, 1.0, 0, 0.3);
    add(MeshBuilder.CreateTorus("droneBelt", { diameter: 0.72, thickness: 0.05, tessellation: 16 }, scene), dark, 0.98);
    add(MeshBuilder.CreateCylinder("droneSensor", { height: 0.14, diameterTop: 0.04, diameterBottom: 0.1, tessellation: 10 }, scene), dark, 1.3);
    for (const side of [-1, 1]) {
      add(MeshBuilder.CreateBox("droneFin", { width: 0.34, height: 0.04, depth: 0.2 }, scene), dark, 1.0, side * 0.5);
      add(MeshBuilder.CreateCylinder("droneRotor", { height: 0.02, diameter: 0.3, tessellation: 18 }, scene), hull, 1.08, side * 0.58);
    }
  } else if (type === "cryoSentinel") {
    // The cryo sentinel: a legless crystal colossus hovering over the ice, faceted all over,
    // with a ring of shards floating at its waist and a cold core.
    const plate = mat(scene, "sentinelPlate", 0.78, 0.92, 0.98, 0.8);
    const dark = mat(scene, "sentinelDark", 0.3, 0.46, 0.58, 0.5);
    const glow = mat(scene, "sentinelGlow", 0, 0, 0);
    glow.emissiveColor = new Color3(0.25, 0.95, 1);
    // An inverted crystal tapering to a point instead of legs.
    add(MeshBuilder.CreateCylinder("sentinelBody", { diameterTop: 1.5, diameterBottom: 0.05, height: 1.9, tessellation: 6 }, scene), dark, 1.0);
    const chest = MeshBuilder.CreatePolyhedron("sentinelChest", { type: 1, size: 0.95 }, scene);
    chest.scaling.set(1.05, 0.85, 0.75);
    chest.bakeCurrentTransformIntoVertices();
    add(chest, plate, 1.95);
    add(MeshBuilder.CreatePolyhedron("sentinelCore", { type: 1, size: 0.26 }, scene), glow, 1.95, 0, 0.6);
    for (const side of [-1, 1]) {
      add(MeshBuilder.CreatePolyhedron("sentinelShoulder", { type: 1, size: 0.45 }, scene), plate, 2.35, side * 0.95);
      const spike = MeshBuilder.CreateCylinder("sentinelShoulderSpike", { diameterTop: 0, diameterBottom: 0.3, height: 1.1, tessellation: 5 }, scene);
      spike.rotation.z = -side * 0.45;
      add(spike, glow, 2.95, side * 1.15);
      const back = MeshBuilder.CreateCylinder("sentinelBackSpike", { diameterTop: 0, diameterBottom: 0.26, height: 1.0, tessellation: 5 }, scene);
      back.rotation.x = -0.6;
      back.rotation.z = -side * 0.25;
      add(back, glow, 2.3, side * 0.4, -0.75);
    }
    // Shards hanging in the air around its waist.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const shard = MeshBuilder.CreateCylinder("sentinelShard", { diameterTop: 0, diameterBottom: 0.2, height: 0.55, tessellation: 4 }, scene);
      shard.rotation.z = Math.cos(a) * 0.5;
      shard.rotation.x = Math.sin(a) * 0.5;
      add(shard, i % 2 ? plate : glow, 1.05 + (i % 3) * 0.15, Math.cos(a) * 1.25, Math.sin(a) * 1.25);
    }
    const crest = MeshBuilder.CreateCylinder("sentinelCrest", { diameterTop: 0, diameterBottom: 0.34, height: 1.0, tessellation: 5 }, scene);
    crest.rotation.x = -0.25;
    add(crest, glow, 3.25, 0, -0.05);
    add(MeshBuilder.CreatePolyhedron("sentinelHelm", { type: 1, size: 0.42 }, scene), plate, 2.8);
    add(MeshBuilder.CreateBox("sentinelVisor", { width: 0.5, height: 0.09, depth: 0.12 }, scene), glow, 2.82, 0, 0.3);
    // Long crystalline arms, hanging free.
    pair("arm", 1.7, 0.24, dark, 1.15, 2.3);
  } else if (type === "handler") {
    // Handler: padded olive keeper suit, face shield, and a long catch-pole held forward.
    const suit = mat(scene, "handlerSuit", 0.42, 0.48, 0.28);
    const pad = mat(scene, "handlerPad", 0.3, 0.34, 0.2, 0.2);
    add(MeshBuilder.CreateCapsule("handlerBody", { height: 0.7, radius: 0.27, tessellation: 18 }, scene), suit, 0.78);
    add(MeshBuilder.CreateBox("handlerVest", { width: 0.5, height: 0.34, depth: 0.4 }, scene), pad, 0.84);
    add(MeshBuilder.CreateSphere("handlerHead", { diameter: 0.32, segments: 16 }, scene), skin, 1.16);
    add(MeshBuilder.CreateBox("handlerShield", { width: 0.3, height: 0.2, depth: 0.04 }, scene), mat(scene, "handlerVisor", 0.6, 0.85, 0.75, 0.9), 1.16, 0, 0.17);
    const pole = MeshBuilder.CreateCylinder("handlerPole", { height: 1.1, diameter: 0.05, tessellation: 10 }, scene);
    pole.rotation.x = Math.PI / 2.2;
    add(pole, mat(scene, "handlerPoleMat", 0.75, 0.75, 0.7, 0.5), 0.85, 0.3, 0.4);
    add(MeshBuilder.CreateTorus("handlerLoop", { diameter: 0.18, thickness: 0.03, tessellation: 18 }, scene), mat(scene, "handlerLoopMat", 0.95, 0.6, 0.1), 0.95, 0.3, 0.95);
    pair("leg", 0.42, 0.1, pad, 0.12, 0.42);
    pair("arm", 0.44, 0.085, suit, 0.33, 0.98);
  } else if (type === "lurker") {
    // Lurker: a low, pale, many-eyed escapee on spindly legs. No clothes: plainly not staff.
    const hide = mat(scene, "lurkerHide", 0.75, 0.8, 0.7, 0.3);
    const eye = mat(scene, "lurkerEye", 0, 0, 0);
    eye.emissiveColor = new Color3(0.6, 1, 0.3);
    const body = MeshBuilder.CreateSphere("lurkerBody", { diameter: 0.6, segments: 18 }, scene);
    body.scaling.set(0.8, 0.6, 1.3);
    body.bakeCurrentTransformIntoVertices();
    add(body, hide, 0.6);
    add(MeshBuilder.CreateSphere("lurkerHead", { diameter: 0.3, segments: 16 }, scene), hide, 0.72, 0, 0.38);
    for (const [x, y] of [[-0.07, 0.8], [0.07, 0.8], [0, 0.86]]) {
      add(MeshBuilder.CreateSphere("lurkerEyeBall", { diameter: 0.07, segments: 10 }, scene), eye, y!, x!, 0.5);
    }
    pair("leg", 0.5, 0.045, hide, 0.16, 0.5);
    pair("arm", 0.5, 0.045, hide, 0.16, 0.62);
  } else if (type === "chimera") {
    // Chimera: a hunched hybrid with a plated back, bone spurs, and a glowing red maw.
    const flesh = mat(scene, "chimeraFlesh", 0.55, 0.3, 0.32, 0.2);
    const plate = mat(scene, "chimeraPlate", 0.3, 0.26, 0.22, 0.5);
    const maw = mat(scene, "chimeraMaw", 0, 0, 0);
    maw.emissiveColor = new Color3(1, 0.2, 0.15);
    const body = MeshBuilder.CreateSphere("chimeraBody", { diameter: 0.8, segments: 18 }, scene);
    body.scaling.set(0.9, 0.75, 1.2);
    body.bakeCurrentTransformIntoVertices();
    add(body, flesh, 0.8);
    add(MeshBuilder.CreateBox("chimeraBack", { width: 0.6, height: 0.16, depth: 0.7 }, scene), plate, 1.1, 0, -0.05);
    for (const z of [-0.25, 0.05, 0.3]) {
      add(MeshBuilder.CreateCylinder("chimeraSpur", { diameterTop: 0, diameterBottom: 0.12, height: 0.3, tessellation: 10 }, scene), plate, 1.3, 0, z);
    }
    add(MeshBuilder.CreateSphere("chimeraHead", { diameter: 0.42, segments: 16 }, scene), flesh, 0.95, 0, 0.5);
    add(MeshBuilder.CreateBox("chimeraJaw", { width: 0.26, height: 0.06, depth: 0.12 }, scene), maw, 0.88, 0, 0.7);
    pair("leg", 0.45, 0.1, flesh, 0.22, 0.48);
    pair("arm", 0.55, 0.1, plate, 0.4, 0.95);
  } else if (type === "specimenTank") {
    // Specimen tank: a glass cylinder of green fluid with a dark shape inside, on a base.
    const metal = mat(scene, "tankMetal", 0.35, 0.38, 0.42, 0.6);
    const glass = mat(scene, "tankGlass", 0.3, 0.8, 0.5, 0.9);
    glass.alpha = 0.55;
    glass.emissiveColor = new Color3(0.05, 0.35, 0.15);
    add(MeshBuilder.CreateCylinder("tankBase", { height: 0.18, diameter: 0.8, tessellation: 16 }, scene), metal, 0.09);
    add(MeshBuilder.CreateCylinder("tankGlass", { height: 1.1, diameter: 0.66, tessellation: 16 }, scene), glass, 0.73);
    add(MeshBuilder.CreateSphere("tankSpecimen", { diameter: 0.34, segments: 12 }, scene), mat(scene, "tankShape", 0.15, 0.2, 0.15), 0.75);
    add(MeshBuilder.CreateCylinder("tankCap", { height: 0.14, diameter: 0.74, tessellation: 16 }, scene), metal, 1.34);
  } else if (type === "alphaSpecimen") {
    // The alpha specimen: a hunched, four-armed predator that knuckle-walks on huge forearms,
    // its low head thrust forward under a crown of bone spines.
    const hide = mat(scene, "alphaHide", 0.35, 0.18, 0.3, 0.3);
    const bone = mat(scene, "alphaBone", 0.85, 0.82, 0.72, 0.4);
    const glow = mat(scene, "alphaGlow", 0, 0, 0);
    glow.emissiveColor = new Color3(0.5, 1, 0.3);
    // A torso pitched far forward, heavy at the shoulders.
    const body = MeshBuilder.CreateCapsule("alphaBody", { height: 2.3, radius: 0.72, tessellation: 20 }, scene);
    body.rotation.x = 1.05;
    add(body, hide, 1.45, 0, 0.05);
    const chest = MeshBuilder.CreateSphere("alphaChest", { diameter: 1.55, segments: 18 }, scene);
    chest.scaling.set(1.15, 0.9, 1);
    chest.bakeCurrentTransformIntoVertices();
    add(chest, hide, 1.75, 0, 0.55);
    add(MeshBuilder.CreateSphere("alphaCore", { diameter: 0.42, segments: 16 }, scene), glow, 1.35, 0, 1.0);
    add(MeshBuilder.CreateSphere("alphaHead", { diameter: 0.75, segments: 18 }, scene), hide, 1.8, 0, 1.35);
    add(MeshBuilder.CreateBox("alphaJaw", { width: 0.55, height: 0.18, depth: 0.5 }, scene), bone, 1.52, 0, 1.5);
    add(MeshBuilder.CreateBox("alphaEyes", { width: 0.5, height: 0.08, depth: 0.12 }, scene), glow, 1.88, 0, 1.68);
    for (let i = 0; i < 5; i++) {
      const a = (i / 4 - 0.5) * 1.6;
      const spine = MeshBuilder.CreateCylinder("alphaSpine", { diameterTop: 0, diameterBottom: 0.2, height: 0.75, tessellation: 10 }, scene);
      spine.rotation.z = -a * 0.6;
      spine.rotation.x = -0.6;
      add(spine, bone, 2.25, Math.sin(a) * 0.4, 1.05);
    }
    for (const side of [-1, 1]) {
      // The second pair: short clawed arms tucked under the chest.
      const lower = MeshBuilder.CreateCapsule("alphaLowerArm", { height: 0.9, radius: 0.15, tessellation: 12 }, scene);
      lower.rotation.x = 0.9;
      lower.rotation.z = side * 0.3;
      add(lower, bone, 1.05, side * 0.55, 1.05);
    }
    // Huge forearms it walks on, and short hind legs.
    pair("arm", 2.1, 0.28, hide, 1.0, 2.1);
    pair("leg", 0.95, 0.24, hide, 0.45, 0.95);
  } else if (type === "dockhand") {
    // Dockhand: hi-vis orange overalls with reflective stripes, ear defenders, a toolbelt.
    const suit = mat(scene, "dockSuit", 1, 0.45, 0.08);
    const stripe = mat(scene, "dockStripe", 0.85, 0.95, 0.4, 0.6);
    add(MeshBuilder.CreateCapsule("dockBody", { height: 0.68, radius: 0.23, tessellation: 16 }, scene), suit, 0.74);
    add(MeshBuilder.CreateTorus("dockStripeChest", { diameter: 0.46, thickness: 0.05, tessellation: 20 }, scene), stripe, 0.92);
    add(MeshBuilder.CreateTorus("dockStripeWaist", { diameter: 0.48, thickness: 0.05, tessellation: 20 }, scene), stripe, 0.62);
    add(MeshBuilder.CreateSphere("dockHead", { diameter: 0.33, segments: 16 }, scene), skin, 1.14);
    for (const side of [-1, 1]) add(MeshBuilder.CreateSphere("dockEarMuff", { diameter: 0.13, segments: 12 }, scene), mat(scene, "dockMuff", 0.15, 0.15, 0.18), 1.14, side * 0.17);
    pair("leg", 0.45, 0.09, suit, 0.11, 0.45);
    pair("arm", 0.42, 0.075, suit, 0.29, 0.97);
  } else if (type === "mechanic") {
    // Mechanic: grease-stained blue coveralls, a welding visor flipped up, a wrench.
    const suit = mat(scene, "mechSuit", 0.2, 0.32, 0.55);
    add(MeshBuilder.CreateCapsule("mechBody", { height: 0.62, radius: 0.16, tessellation: 16 }, scene), suit, 0.84);
    add(MeshBuilder.CreateSphere("mechHead", { diameter: 0.29, segments: 16 }, scene), skin, 1.2);
    const visor = MeshBuilder.CreateBox("mechVisor", { width: 0.3, height: 0.16, depth: 0.04 }, scene);
    visor.rotation.x = -1.1;
    add(visor, mat(scene, "mechVisorMat", 0.1, 0.12, 0.1, 0.8), 1.36, 0, 0.06);
    const wrench = MeshBuilder.CreateBox("mechWrench", { width: 0.05, height: 0.36, depth: 0.05 }, scene);
    wrench.rotation.x = 0.5;
    add(wrench, mat(scene, "mechWrenchMat", 0.7, 0.72, 0.75, 0.8), 0.7, 0.24, 0.12);
    pair("leg", 0.54, 0.07, suit, 0.08, 0.55);
    pair("arm", 0.45, 0.055, suit, 0.2, 1.03);
  } else if (type === "loaderMech") {
    // Loader mech: a yellow exoskeleton frame around a driver, with lifting forks in front.
    const frame = mat(scene, "loaderFrame", 0.95, 0.75, 0.1, 0.5);
    const dark = mat(scene, "loaderDark", 0.15, 0.15, 0.17, 0.4);
    const light = mat(scene, "loaderLight", 0, 0, 0);
    light.emissiveColor = new Color3(1, 0.55, 0.1);
    add(MeshBuilder.CreateBox("loaderCage", { width: 0.75, height: 0.7, depth: 0.55 }, scene), frame, 1.0);
    add(MeshBuilder.CreateSphere("loaderDriver", { diameter: 0.3, segments: 16 }, scene), skin, 1.22, 0, 0.05);
    add(MeshBuilder.CreateBox("loaderLamp", { width: 0.3, height: 0.06, depth: 0.06 }, scene), light, 1.4, 0, 0.26);
    for (const side of [-1, 1]) {
      add(MeshBuilder.CreateBox("loaderFork", { width: 0.08, height: 0.06, depth: 0.7 }, scene), dark, 0.55, side * 0.22, 0.55);
      add(MeshBuilder.CreateBox("loaderMast", { width: 0.08, height: 0.8, depth: 0.08 }, scene), dark, 0.9, side * 0.3, 0.25);
    }
    pair("leg", 0.55, 0.13, frame, 0.25, 0.6);
    pair("arm", 0.5, 0.11, dark, 0.45, 1.15);
  } else if (type === "fuelCell") {
    // Fuel cell: a squat banded canister with a hazard stripe and a glowing gauge.
    const shell = mat(scene, "fuelShell", 0.75, 0.78, 0.8, 0.6);
    const hazard = mat(scene, "fuelHazard", 0.95, 0.75, 0.1, 0.3);
    const gauge = mat(scene, "fuelGauge", 0, 0, 0);
    gauge.emissiveColor = new Color3(0.3, 0.8, 1);
    add(MeshBuilder.CreateCylinder("fuelBody", { height: 0.9, diameter: 0.6, tessellation: 16 }, scene), shell, 0.45);
    add(MeshBuilder.CreateCylinder("fuelBand", { height: 0.12, diameter: 0.63, tessellation: 16 }, scene), hazard, 0.6);
    add(MeshBuilder.CreateCylinder("fuelValve", { height: 0.16, diameter: 0.18, tessellation: 16 }, scene), mat(scene, "fuelValveMat", 0.3, 0.3, 0.33, 0.6), 0.98);
    add(MeshBuilder.CreateBox("fuelGauge", { width: 0.16, height: 0.1, depth: 0.04 }, scene), gauge, 0.4, 0, 0.3);
  } else if (type === "overseerMech") {
    // The overseer mech: no arms at all. A wide, low hull on long hydraulic legs, a cockpit
    // dome, and a missile pod on each shoulder (its barrage).
    const plate = mat(scene, "overseerPlate", 0.55, 0.55, 0.5, 0.7);
    const dark = mat(scene, "overseerDark", 0.18, 0.18, 0.2, 0.4);
    const stripe = mat(scene, "overseerStripe", 0.95, 0.7, 0.1, 0.4);
    const eye = mat(scene, "overseerEye", 0, 0, 0);
    eye.emissiveColor = new Color3(1, 0.2, 0.1);
    const lamp = mat(scene, "overseerLamp", 0, 0, 0);
    lamp.emissiveColor = new Color3(1, 0.8, 0.3);
    add(MeshBuilder.CreateBox("overseerPelvis", { width: 1.2, height: 0.5, depth: 0.9 }, scene), dark, 1.55);
    add(MeshBuilder.CreateBox("overseerHull", { width: 2.3, height: 0.95, depth: 1.7 }, scene), plate, 2.1);
    add(MeshBuilder.CreateBox("overseerHazard", { width: 2.32, height: 0.12, depth: 1.72 }, scene), stripe, 1.75);
    add(MeshBuilder.CreateSphere("overseerDome", { diameter: 0.95, segments: 18, slice: 0.5 }, scene), mat(scene, "overseerGlass", 0.3, 0.45, 0.55, 0.9), 2.55, 0, 0.25);
    add(MeshBuilder.CreateBox("overseerEye", { width: 0.9, height: 0.12, depth: 0.12 }, scene), eye, 2.15, 0, 0.86);
    const tube = mat(scene, "overseerTube", 0, 0, 0);
    tube.emissiveColor = new Color3(1, 0.45, 0.1);
    for (const side of [-1, 1]) {
      add(MeshBuilder.CreateBox("overseerPod", { width: 0.75, height: 0.7, depth: 1.1 }, scene), dark, 2.55, side * 1.45, -0.1);
      // Four launch tubes, glowing, on each pod's face.
      for (const [tx, ty] of [[-0.17, -0.15], [0.17, -0.15], [-0.17, 0.15], [0.17, 0.15]] as const) {
        const mouth = MeshBuilder.CreateCylinder("overseerTubeMouth", { height: 0.08, diameter: 0.2, tessellation: 12 }, scene);
        mouth.rotation.x = Math.PI / 2 - 0.35;
        add(mouth, tube, 2.6 + ty, side * 1.45 + tx, 0.47);
      }
      add(MeshBuilder.CreateSphere("overseerLamp", { diameter: 0.2, segments: 12 }, scene), lamp, 2.4, side * 0.95, 0.86);
    }
    pair("leg", 1.5, 0.26, dark, 0.75, 1.5);
  } else if (type === "hiveForager" || type === "skitter" || type === "hiveWarrior") {
    // Hive insects: segmented bodies on six thin legs. Foragers carry an amber blob,
    // skitters are small and pale, warriors are plated with scything forelimbs.
    const warrior = type === "hiveWarrior";
    const skit = type === "skitter";
    const shell = mat(scene, `${type}Shell`, warrior ? 0.25 : skit ? 0.65 : 0.45, warrior ? 0.3 : skit ? 0.7 : 0.42, warrior ? 0.12 : skit ? 0.45 : 0.16, 0.6);
    const s = skit ? 0.6 : warrior ? 1.25 : 1;
    const seg = (n: string, d: number, y: number, z: number) => {
      const m = MeshBuilder.CreateSphere(n, { diameter: d * s, segments: 16 }, scene);
      m.scaling.y = 0.75;
      m.bakeCurrentTransformIntoVertices();
      add(m, shell, y * s, 0, z * s);
    };
    seg(`${type}Abdomen`, 0.55, 0.55, -0.32);
    seg(`${type}Thorax`, 0.38, 0.6, 0.05);
    seg(`${type}Head`, 0.3, 0.66, 0.34);
    const eye = mat(scene, `${type}Eye`, 0, 0, 0);
    eye.emissiveColor = warrior ? new Color3(1, 0.3, 0.1) : new Color3(0.4, 1, 0.5);
    for (const side of [-1, 1]) add(MeshBuilder.CreateSphere(`${type}EyeBall`, { diameter: 0.08 * s, segments: 12 }, scene), eye, 0.72 * s, side * 0.1 * s, 0.45 * s);
    for (const side of [-1, 1]) {
      for (const [index, z] of [-0.12, 0.05, 0.22].entries()) {
        const leg = MeshBuilder.CreateCylinder(`${type}Leg`, { diameter: 0.045 * s, height: 0.6 * s, tessellation: 10 }, scene);
        leg.rotation.z = side * 0.9;
        leg.position.set(side * 0.1 * s, -0.15 * s, 0);
        leg.material = shell;
        leg.scaling.setAll(SCALE);
        leg.position.scaleInPlace(SCALE);
        leg.bakeCurrentTransformIntoVertices();
        leg.isVisible = false;
        limbs.push({ index: meshes.length, role: `insect${side < 0 ? "L" : "R"}${index}` as LimbRole, pivot: new Vector3(side * 0.16 * s, 0.53 * s, z * s).scaleInPlace(SCALE) });
        meshes.push(leg);
      }
    }
    if (type === "hiveForager") {
      const amber = mat(scene, "foragerAmber", 0.8, 0.45, 0.05, 0.9);
      amber.emissiveColor = new Color3(0.5, 0.25, 0.02);
      add(MeshBuilder.CreateSphere("foragerLoad", { diameter: 0.32, segments: 16 }, scene), amber, 0.95, 0, -0.3);
    }
    if (warrior) {
      const bladeMat = mat(scene, "warriorBlade", 0.85, 0.85, 0.7, 0.8);
      for (const side of [-1, 1]) {
        const blade = MeshBuilder.CreateCylinder("warriorScythe", { diameterTop: 0, diameterBottom: 0.1, height: 0.7, tessellation: 4 }, scene);
        blade.rotation.x = 1.1;
        add(blade, bladeMat, 0.95, side * 0.22, 0.6);
      }
    }
  } else if (type === "broodSac") {
    // Brood sac: a translucent, glowing egg cluster stuck to the floor.
    const sac = mat(scene, "broodSacMat", 0.95, 0.6, 0.3, 0.6);
    sac.alpha = 0.8;
    sac.emissiveColor = new Color3(0.4, 0.2, 0.05);
    for (const [x, z, d] of [[0, 0, 0.7], [0.32, 0.2, 0.45], [-0.3, 0.18, 0.4], [0.05, -0.32, 0.42]] as const) {
      add(MeshBuilder.CreateSphere("broodEgg", { diameter: d, segments: 16 }, scene), sac, d * 0.45, x, z);
    }
  } else if (type === "hiveQueen") {
    // The hive queen: a vast bloated abdomen behind a crowned, mandibled head.
    const shell = mat(scene, "queenShell", 0.35, 0.22, 0.12, 0.6);
    const belly = mat(scene, "queenBelly", 0.9, 0.55, 0.2, 0.4);
    belly.emissiveColor = new Color3(0.35, 0.18, 0.04);
    const glow = mat(scene, "queenGlow", 0, 0, 0);
    glow.emissiveColor = new Color3(0.5, 1, 0.3);
    const abdomen = MeshBuilder.CreateSphere("queenAbdomen", { diameter: 2.2, segments: 20 }, scene);
    abdomen.scaling.set(1, 0.8, 1.4);
    abdomen.bakeCurrentTransformIntoVertices();
    add(abdomen, belly, 1.2, 0, -1.0);
    add(MeshBuilder.CreateCapsule("queenBody", { height: 2.2, radius: 0.7, tessellation: 14 }, scene), shell, 1.15);
    add(MeshBuilder.CreateSphere("queenHead", { diameter: 0.9, segments: 12 }, scene), shell, 2.3, 0, 0.35);
    add(MeshBuilder.CreateBox("queenEyes", { width: 0.55, height: 0.1, depth: 0.12 }, scene), glow, 2.38, 0, 0.75);
    for (let i = 0; i < 5; i++) {
      const crown = MeshBuilder.CreateCylinder("queenCrown", { diameterTop: 0, diameterBottom: 0.18, height: 0.6, tessellation: 6 }, scene);
      crown.rotation.z = (i - 2) * 0.35;
      add(crown, glow, 2.85, (i - 2) * 0.18, 0.3);
    }
    for (const side of [-1, 1]) {
      const mandible = MeshBuilder.CreateCylinder("queenMandible", { diameterTop: 0, diameterBottom: 0.16, height: 0.6, tessellation: 5 }, scene);
      mandible.rotation.x = Math.PI / 2;
      mandible.rotation.y = side * 0.4;
      add(mandible, shell, 2.05, side * 0.2, 0.95);
    }
    // Heavy forelimbs that swing as it stomps.
    pair("arm", 1.5, 0.26, shell, 1.0, 2.0);
  } else if (type === "sandSkink") {
    // Sand skink: a long, low lizard with a tapering tail and shards glinting along its back.
    const hide = mat(scene, "skinkHide", 0.72, 0.56, 0.32, 0.3);
    const shard = mat(scene, "skinkShard", 0.95, 0.85, 0.55, 0.9);
    shard.emissiveColor = new Color3(0.35, 0.28, 0.1);
    const body = MeshBuilder.CreateCapsule("skinkBody", { height: 0.95, radius: 0.2, tessellation: 10 }, scene);
    body.rotation.x = Math.PI / 2;
    add(body, hide, 0.3);
    add(MeshBuilder.CreateSphere("skinkHead", { diameter: 0.3, segments: 10 }, scene), hide, 0.34, 0, 0.55);
    const tail = MeshBuilder.CreateCylinder("skinkTail", { diameterTop: 0.02, diameterBottom: 0.2, height: 0.75, tessellation: 8 }, scene);
    tail.rotation.x = -Math.PI / 2;
    add(tail, hide, 0.26, 0, -0.8);
    for (const z of [-0.25, 0, 0.25]) {
      add(MeshBuilder.CreateCylinder("skinkSpine", { diameterTop: 0, diameterBottom: 0.1, height: 0.18, tessellation: 4 }, scene), shard, 0.55, 0, z);
    }
    for (const side of [-1, 1]) {
      for (const z of [-0.25, 0.25]) {
        const leg = MeshBuilder.CreateCylinder("skinkLeg", { diameter: 0.07, height: 0.32, tessellation: 5 }, scene);
        leg.rotation.z = side * 1.0;
        add(leg, hide, 0.16, side * 0.24, z);
      }
    }
  } else if (type === "duneRunner") {
    // Dune runner: a lean figure in a sand-coloured hooded wrap, face hidden, satchel of shards.
    const wrap = mat(scene, "runnerWrap", 0.82, 0.68, 0.45);
    const veil = mat(scene, "runnerVeil", 0.25, 0.18, 0.12);
    add(MeshBuilder.CreateCylinder("duneRobe", { height: 0.7, diameterTop: 0.3, diameterBottom: 0.48, tessellation: 10 }, scene), wrap, 0.62);
    add(MeshBuilder.CreateSphere("duneHood", { diameter: 0.36, segments: 10 }, scene), wrap, 1.15);
    add(MeshBuilder.CreateBox("duneVeil", { width: 0.22, height: 0.1, depth: 0.08 }, scene), veil, 1.13, 0, 0.15);
    add(MeshBuilder.CreateBox("duneSatchel", { width: 0.22, height: 0.22, depth: 0.12 }, scene), mat(scene, "duneSatchelMat", 0.45, 0.3, 0.18), 0.75, 0.22, -0.14);
    pair("leg", 0.42, 0.065, veil, 0.08, 0.42);
    pair("arm", 0.44, 0.055, wrap, 0.2, 1.0);
  } else if (type === "relicGolem") {
    // Relic golem: stacked sandstone blocks with glowing carved runes and heavy stone fists.
    const stone = mat(scene, "golemStone", 0.62, 0.5, 0.34, 0.2);
    const rune = mat(scene, "golemRune", 0, 0, 0);
    rune.emissiveColor = new Color3(1, 0.65, 0.2);
    add(MeshBuilder.CreateBox("golemLegs", { width: 0.6, height: 0.45, depth: 0.4 }, scene), stone, 0.3);
    add(MeshBuilder.CreateBox("golemTorso", { width: 0.85, height: 0.6, depth: 0.5 }, scene), stone, 0.85);
    add(MeshBuilder.CreateBox("golemHead", { width: 0.38, height: 0.32, depth: 0.34 }, scene), stone, 1.32);
    add(MeshBuilder.CreateBox("golemEyes", { width: 0.26, height: 0.05, depth: 0.04 }, scene), rune, 1.34, 0, 0.18);
    add(MeshBuilder.CreateBox("golemRune", { width: 0.3, height: 0.08, depth: 0.04 }, scene), rune, 0.9, 0, 0.26);
    for (const side of [-1, 1]) {
      add(MeshBuilder.CreateBox("golemFist", { width: 0.28, height: 0.3, depth: 0.3 }, scene), stone, 0.55, side * 0.6, 0.05);
    }
    pair("arm", 0.5, 0.12, stone, 0.55, 1.05);
  } else if (type === "burialUrn") {
    // Burial urn: a fat, painted clay jar with a sealed lid and a glowing glyph.
    const clay = mat(scene, "urnClay", 0.6, 0.35, 0.2, 0.2);
    const paint = mat(scene, "urnPaint", 0, 0, 0);
    paint.emissiveColor = new Color3(0.9, 0.7, 0.3);
    const jar = MeshBuilder.CreateSphere("urnJar", { diameter: 0.7, segments: 12 }, scene);
    jar.scaling.y = 1.15;
    jar.bakeCurrentTransformIntoVertices();
    add(jar, clay, 0.42);
    add(MeshBuilder.CreateCylinder("urnNeck", { diameterTop: 0.36, diameterBottom: 0.26, height: 0.18, tessellation: 12 }, scene), clay, 0.86);
    add(MeshBuilder.CreateCylinder("urnLid", { diameter: 0.4, height: 0.06, tessellation: 12 }, scene), clay, 0.97);
    add(MeshBuilder.CreateTorus("urnBand", { diameter: 0.68, thickness: 0.04, tessellation: 18 }, scene), paint, 0.5);
  } else if (type === "sandWyrm") {
    // The sand wyrm: a vast segmented worm rearing out of the sand, ringed maw glowing.
    const hide = mat(scene, "wyrmHide", 0.55, 0.4, 0.24, 0.4);
    const plate = mat(scene, "wyrmPlate", 0.4, 0.28, 0.16, 0.6);
    const maw = mat(scene, "wyrmMaw", 0, 0, 0);
    maw.emissiveColor = new Color3(1, 0.45, 0.15);
    for (const [y, z, d] of [[0.5, -1.4, 1.3], [0.8, -0.7, 1.5], [1.3, 0, 1.6], [2.0, 0.4, 1.5], [2.6, 0.6, 1.3]] as const) {
      add(MeshBuilder.CreateSphere("wyrmSegment", { diameter: d, segments: 12 }, scene), hide, y, 0, z);
      add(MeshBuilder.CreateTorus("wyrmRidge", { diameter: d * 0.95, thickness: 0.1, tessellation: 18 }, scene), plate, y, 0, z);
    }
    const mouth = MeshBuilder.CreateTorus("wyrmMaw", { diameter: 0.9, thickness: 0.16, tessellation: 20 }, scene);
    mouth.rotation.x = Math.PI / 2 - 0.4;
    add(mouth, maw, 2.75, 0, 1.1);
    const toothMat = mat(scene, "wyrmToothMat", 0.95, 0.9, 0.8, 0.6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tooth = MeshBuilder.CreateCylinder("wyrmTooth", { diameterTop: 0, diameterBottom: 0.1, height: 0.3, tessellation: 4 }, scene);
      tooth.rotation.x = Math.PI / 2;
      add(tooth, toothMat, 2.75 + Math.sin(a) * 0.35, Math.cos(a) * 0.35, 1.25);
    }
    // Whipping feelers that swing as it moves.
    pair("arm", 1.4, 0.16, plate, 0.8, 2.4);
  } else if (type === "reefCrab") {
    // Reef crab: a wide, flat shell on splayed legs, two raised claws, a pearl glinting beneath.
    const shell = mat(scene, "crabShell", 0.85, 0.32, 0.22, 0.6);
    const pearl = mat(scene, "crabPearl", 0.95, 0.95, 1, 0.9);
    pearl.emissiveColor = new Color3(0.3, 0.35, 0.4);
    const eyeMat = mat(scene, "crabEyeMat", 0.05, 0.05, 0.05, 0.9);
    const body = MeshBuilder.CreateSphere("crabBody", { diameter: 0.8, segments: 12 }, scene);
    body.scaling.set(1, 0.45, 0.8);
    body.bakeCurrentTransformIntoVertices();
    add(body, shell, 0.35);
    add(MeshBuilder.CreateSphere("crabPearl", { diameter: 0.16, segments: 8 }, scene), pearl, 0.2, 0, -0.18);
    for (const side of [-1, 1]) {
      add(MeshBuilder.CreateSphere("crabClaw", { diameter: 0.24, segments: 8 }, scene), shell, 0.48, side * 0.42, 0.34);
      add(MeshBuilder.CreateSphere("crabEye", { diameter: 0.07, segments: 6 }, scene), eyeMat, 0.55, side * 0.1, 0.32);
      for (const z of [-0.2, 0, 0.2]) {
        const leg = MeshBuilder.CreateCylinder("crabLeg", { diameter: 0.06, height: 0.45, tessellation: 5 }, scene);
        leg.rotation.z = side * 1.05;
        add(leg, shell, 0.22, side * 0.42, z);
      }
    }
  } else if (type === "skimmer") {
    // Skimmer: a small, sleek fish-thing on fin-legs, iridescent along its back.
    const scale = mat(scene, "skimmerScale", 0.4, 0.75, 0.9, 0.9);
    scale.emissiveColor = new Color3(0.05, 0.2, 0.28);
    const body = MeshBuilder.CreateSphere("skimmerBody", { diameter: 0.4, segments: 10 }, scene);
    body.scaling.set(0.6, 0.6, 1.4);
    body.bakeCurrentTransformIntoVertices();
    add(body, scale, 0.4);
    const tail = MeshBuilder.CreateCylinder("skimmerTail", { diameterTop: 0, diameterBottom: 0.2, height: 0.3, tessellation: 4 }, scene);
    tail.rotation.x = -Math.PI / 2;
    add(tail, scale, 0.42, 0, -0.38);
    for (const side of [-1, 1]) {
      const fin = MeshBuilder.CreateBox("skimmerFin", { width: 0.3, height: 0.02, depth: 0.16 }, scene);
      fin.rotation.z = side * 0.5;
      add(fin, scale, 0.32, side * 0.18, 0.05);
    }
  } else if (type === "lancerEel") {
    // Lancer eel: a coiled, banded body rearing up, with a long spiked jaw.
    const hide = mat(scene, "eelHide", 0.2, 0.32, 0.3, 0.6);
    const band = mat(scene, "eelBand", 0, 0, 0);
    band.emissiveColor = new Color3(0.2, 0.9, 0.8);
    for (const [y, z, d] of [[0.2, -0.3, 0.42], [0.22, 0.05, 0.4], [0.45, 0.25, 0.36], [0.78, 0.35, 0.32]] as const) {
      add(MeshBuilder.CreateSphere("eelCoil", { diameter: d, segments: 10 }, scene), hide, y, 0, z);
    }
    add(MeshBuilder.CreateTorus("eelBand", { diameter: 0.38, thickness: 0.04, tessellation: 16 }, scene), band, 0.45, 0, 0.25);
    const head = MeshBuilder.CreateSphere("eelHead", { diameter: 0.3, segments: 10 }, scene);
    head.scaling.z = 1.4;
    head.bakeCurrentTransformIntoVertices();
    add(head, hide, 1.02, 0, 0.45);
    const jaw = MeshBuilder.CreateCylinder("eelJaw", { diameterTop: 0, diameterBottom: 0.1, height: 0.45, tessellation: 5 }, scene);
    jaw.rotation.x = Math.PI / 2;
    add(jaw, mat(scene, "eelJawMat", 0.9, 0.9, 0.8, 0.8), 1.0, 0, 0.78);
    for (const side of [-1, 1]) add(MeshBuilder.CreateSphere("eelEye", { diameter: 0.07, segments: 6 }, scene), band, 1.08, side * 0.1, 0.55);
  } else if (type === "pearlClam") {
    // Pearl clam: a ridged shell propped open on a glowing pearl.
    const shell = mat(scene, "clamShell", 0.7, 0.62, 0.78, 0.4);
    const pearl = mat(scene, "clamPearl", 0.95, 0.95, 1, 0.9);
    pearl.emissiveColor = new Color3(0.5, 0.55, 0.65);
    const lower = MeshBuilder.CreateSphere("clamLower", { diameter: 0.9, segments: 12, slice: 0.5 }, scene);
    lower.scaling.y = 0.4;
    lower.rotation.x = Math.PI;
    lower.bakeCurrentTransformIntoVertices();
    add(lower, shell, 0.2);
    const upper = MeshBuilder.CreateSphere("clamUpper", { diameter: 0.9, segments: 12, slice: 0.5 }, scene);
    upper.scaling.y = 0.4;
    upper.rotation.x = -0.5;
    upper.bakeCurrentTransformIntoVertices();
    add(upper, shell, 0.28, 0, -0.08);
    add(MeshBuilder.CreateSphere("clamPearl", { diameter: 0.26, segments: 10 }, scene), pearl, 0.3, 0, 0.1);
  } else if (type === "tideKraken") {
    // The tide kraken: a vast domed mantle on a ring of thick arms, with great glowing eyes.
    const skin = mat(scene, "krakenSkin", 0.45, 0.22, 0.4, 0.5);
    const glow = mat(scene, "krakenGlow", 0, 0, 0);
    glow.emissiveColor = new Color3(0.4, 0.9, 1);
    const mantle = MeshBuilder.CreateSphere("krakenMantle", { diameter: 2.2, segments: 14 }, scene);
    mantle.scaling.set(1, 1.3, 1);
    mantle.bakeCurrentTransformIntoVertices();
    add(mantle, skin, 2.0, 0, -0.2);
    add(MeshBuilder.CreateCapsule("krakenBody", { height: 1.6, radius: 0.8, tessellation: 14 }, scene), skin, 0.9);
    for (const side of [-1, 1]) add(MeshBuilder.CreateSphere("krakenEye", { diameter: 0.38, segments: 10 }, scene), glow, 1.5, side * 0.55, 0.65);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const arm = MeshBuilder.CreateCylinder("krakenArm", { diameterTop: 0.08, diameterBottom: 0.4, height: 1.6, tessellation: 8 }, scene);
      arm.rotation.z = Math.cos(a) * 1.1;
      arm.rotation.x = Math.sin(a) * 1.1;
      add(arm, skin, 0.4, Math.cos(a) * 0.9, Math.sin(a) * 0.9);
    }
    // Two great arms that swing as it moves.
    pair("arm", 1.6, 0.26, skin, 1.0, 1.9);
  } else if (type === "calderaTitan") {
    // The caldera titan: a walking mountain of basalt, cracked with glowing lava, a small
    // smoking volcano on its back and arms like boulders.
    const rock = mat(scene, "titanRock", 0.17, 0.14, 0.14, 0.2);
    const lava = mat(scene, "titanLava", 0, 0, 0);
    lava.emissiveColor = new Color3(1, 0.4, 0.05);
    const body = MeshBuilder.CreatePolyhedron("titanBody", { type: 2, size: 1.15 }, scene);
    body.scaling.set(1.15, 1, 0.95);
    body.bakeCurrentTransformIntoVertices();
    add(body, rock, 1.75);
    add(MeshBuilder.CreatePolyhedron("titanHead", { type: 2, size: 0.42 }, scene), rock, 3.0, 0, 0.35);
    add(MeshBuilder.CreateBox("titanEyes", { width: 0.55, height: 0.09, depth: 0.12 }, scene), lava, 3.02, 0, 0.72);
    for (let i = 0; i < 5; i++) {
      // Glowing cracks across the chest.
      const crack = MeshBuilder.CreateBox("titanCrack", { width: 0.08, height: 0.9 - i * 0.08, depth: 0.08 }, scene);
      crack.rotation.z = (i - 2) * 0.35;
      add(crack, lava, 1.7 + (i % 2) * 0.25, (i - 2) * 0.32, 1.08);
    }
    // The volcano on its back, with a molten crater.
    add(MeshBuilder.CreateCylinder("titanCone", { diameterTop: 0.5, diameterBottom: 1.5, height: 1.1, tessellation: 9 }, scene), rock, 3.0, 0, -0.75);
    add(MeshBuilder.CreateCylinder("titanCrater", { diameter: 0.42, height: 0.08, tessellation: 12 }, scene), lava, 3.56, 0, -0.75);
    for (const side of [-1, 1]) add(MeshBuilder.CreatePolyhedron("titanShoulder", { type: 1, size: 0.55 }, scene), rock, 2.55, side * 1.25);
    pair("arm", 1.7, 0.36, rock, 1.3, 2.4);
    pair("leg", 0.9, 0.32, rock, 0.55, 0.9);
  } else if (type === "sporemother") {
    // The sporemother: a mushroom the size of a house on a thick, rooted stalk, its cap
    // spotted with glowing spore sacs, tendrils hanging from the gills.
    const flesh = mat(scene, "motherFlesh", 0.5, 0.36, 0.55, 0.2);
    const cap = mat(scene, "motherCap", 0.32, 0.18, 0.4, 0.3);
    const glow = mat(scene, "motherGlow", 0, 0, 0);
    glow.emissiveColor = new Color3(0.55, 1, 0.35);
    add(MeshBuilder.CreateCylinder("motherStalk", { diameterTop: 1.0, diameterBottom: 1.6, height: 2.4, tessellation: 16 }, scene), flesh, 1.2);
    const dome = MeshBuilder.CreateSphere("motherCapDome", { diameter: 3.8, segments: 20, slice: 0.5 }, scene);
    dome.scaling.y = 0.7;
    dome.bakeCurrentTransformIntoVertices();
    add(dome, cap, 2.35);
    add(MeshBuilder.CreateCylinder("motherGills", { diameter: 3.6, height: 0.12, tessellation: 24 }, scene), flesh, 2.36);
    for (let i = 0; i < 9; i++) {
      // Spore sacs on the cap's surface.
      const a = (i / 9) * Math.PI * 2;
      const r = i % 3 === 0 ? 0.55 : 1.25;
      add(MeshBuilder.CreateSphere("motherSac", { diameter: 0.36 + (i % 2) * 0.14, segments: 10 }, scene), glow, 2.35 + Math.sqrt(1.9 ** 2 - r * r) * 0.68, Math.cos(a) * r, Math.sin(a) * r);
    }
    for (const side of [-1, 1]) add(MeshBuilder.CreateSphere("motherEye", { diameter: 0.24, segments: 10 }, scene), glow, 1.85, side * 0.35, 0.68);
    for (let i = 0; i < 4; i++) {
      // Root flare at the base.
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const root = MeshBuilder.CreateCylinder("motherRoot", { diameterTop: 0.1, diameterBottom: 0.4, height: 1.1, tessellation: 6 }, scene);
      root.rotation.z = Math.PI / 2.6;
      root.rotation.y = a;
      add(root, flesh, 0.2, Math.cos(a) * 0.9, -Math.sin(a) * 0.9);
    }
    // Tendrils that lash out from under the cap.
    pair("arm", 1.8, 0.16, flesh, 1.3, 2.25);
  } else if (type === "shardHydra") {
    // The shard hydra: a crystal body on stubby legs with five glassy necks fanning out,
    // each ending in a head with a violet eye.
    const crystal = mat(scene, "hydraCrystal", 0.45, 0.48, 0.62, 0.9);
    const dark = mat(scene, "hydraDark", 0.2, 0.18, 0.3, 0.6);
    const glow = mat(scene, "hydraGlow", 0, 0, 0);
    glow.emissiveColor = new Color3(0.8, 0.5, 1);
    const body = MeshBuilder.CreatePolyhedron("hydraBody", { type: 1, size: 1.05 }, scene);
    body.scaling.set(1.2, 0.8, 1.3);
    body.bakeCurrentTransformIntoVertices();
    add(body, crystal, 1.35);
    add(MeshBuilder.CreatePolyhedron("hydraCore", { type: 1, size: 0.3 }, scene), glow, 1.35, 0, 1.15);
    for (let i = 0; i < 5; i++) {
      const a = (i / 4 - 0.5) * 1.5;
      const neck = MeshBuilder.CreateCylinder("hydraNeck", { diameterTop: 0.18, diameterBottom: 0.34, height: 1.6, tessellation: 6 }, scene);
      neck.rotation.z = -a * 0.75;
      neck.rotation.x = 0.35;
      add(neck, dark, 2.35, Math.sin(a) * 0.75, 0.55);
      const hx = Math.sin(a) * 1.35;
      add(MeshBuilder.CreatePolyhedron("hydraHead", { type: 1, size: 0.3 }, scene), crystal, 3.1 - Math.abs(a) * 0.15, hx, 0.95);
      add(MeshBuilder.CreateSphere("hydraEye", { diameter: 0.14, segments: 8 }, scene), glow, 3.12 - Math.abs(a) * 0.15, hx, 1.2);
    }
    for (let i = 0; i < 4; i++) {
      // Shards jutting from the back.
      const spike = MeshBuilder.CreateCylinder("hydraSpike", { diameterTop: 0, diameterBottom: 0.3, height: 0.9, tessellation: 4 }, scene);
      spike.rotation.x = -0.5;
      spike.rotation.z = (i - 1.5) * 0.3;
      add(spike, glow, 1.9, (i - 1.5) * 0.45, -0.75);
    }
    pair("leg", 0.85, 0.26, dark, 0.75, 0.85);
  } else if (type === "mireLeviathan") {
    // The mire leviathan: coils of a vast eel heaped in the pool, one great neck reared up
    // with a gaping jaw and two pale eyes, fins along its back.
    const hide = mat(scene, "leviHide", 0.22, 0.27, 0.18, 0.5);
    const belly = mat(scene, "leviBelly", 0.55, 0.55, 0.35, 0.3);
    const glow = mat(scene, "leviGlow", 0, 0, 0);
    glow.emissiveColor = new Color3(0.85, 1, 0.45);
    for (let i = 0; i < 7; i++) {
      // A ring of coils round its base.
      const a = (i / 7) * Math.PI * 2;
      const coil = MeshBuilder.CreateSphere("leviCoil", { diameter: 1.1 - (i % 3) * 0.1, segments: 12 }, scene);
      coil.scaling.set(1.2, 0.8, 1);
      coil.bakeCurrentTransformIntoVertices();
      add(coil, hide, 0.45, Math.cos(a) * 1.1, Math.sin(a) * 1.1 - 0.2);
    }
    for (const [y, z, d] of [[1.0, 0.1, 1.15], [1.75, 0.35, 1.0], [2.5, 0.6, 0.9]] as const) {
      add(MeshBuilder.CreateSphere("leviNeck", { diameter: d, segments: 14 }, scene), hide, y, 0, z);
      add(MeshBuilder.CreateSphere("leviThroat", { diameter: d * 0.7, segments: 10 }, scene), belly, y - 0.05, 0, z + d * 0.25);
    }
    const head = MeshBuilder.CreateSphere("leviHead", { diameter: 1.05, segments: 14 }, scene);
    head.scaling.set(1, 0.75, 1.35);
    head.bakeCurrentTransformIntoVertices();
    add(head, hide, 3.15, 0, 1.0);
    const jaw = MeshBuilder.CreateBox("leviJaw", { width: 0.75, height: 0.16, depth: 0.95 }, scene);
    jaw.rotation.x = 0.35;
    add(jaw, belly, 2.78, 0, 1.25);
    for (const side of [-1, 1]) add(MeshBuilder.CreateSphere("leviEye", { diameter: 0.22, segments: 10 }, scene), glow, 3.32, side * 0.38, 1.35);
    for (let i = 0; i < 4; i++) {
      const fin = MeshBuilder.CreateCylinder("leviFin", { diameterTop: 0, diameterBottom: 0.36, height: 0.6, tessellation: 3 }, scene);
      fin.rotation.x = -0.4;
      add(fin, glow, 1.25 + i * 0.6, 0, -0.05 + i * 0.25);
    }
    // Two clawed forelimbs, for the crash at the end of its whirlpool.
    pair("arm", 1.4, 0.2, hide, 0.95, 1.9);
  } else if (type === "stormRoc") {
    // The storm roc: a huge bird, pale with storm-blue barring, wings half spread, a hooked
    // beak and crackling eyes.
    const feather = mat(scene, "rocFeather", 0.78, 0.78, 0.86, 0.2);
    const bar = mat(scene, "rocBar", 0.28, 0.35, 0.55, 0.3);
    const beak = mat(scene, "rocBeak", 0.95, 0.75, 0.3, 0.5);
    const glow = mat(scene, "rocGlow", 0, 0, 0);
    glow.emissiveColor = new Color3(0.55, 0.85, 1);
    const body = MeshBuilder.CreateSphere("rocBody", { diameter: 1.9, segments: 16 }, scene);
    body.scaling.set(1, 1, 1.35);
    body.bakeCurrentTransformIntoVertices();
    add(body, feather, 1.75);
    add(MeshBuilder.CreateSphere("rocHead", { diameter: 0.85, segments: 14 }, scene), feather, 2.75, 0, 1.0);
    const hook = MeshBuilder.CreateCylinder("rocBeak", { diameterTop: 0, diameterBottom: 0.36, height: 0.75, tessellation: 8 }, scene);
    hook.rotation.x = Math.PI / 2 + 0.35;
    add(hook, beak, 2.6, 0, 1.55);
    for (const side of [-1, 1]) {
      add(MeshBuilder.CreateSphere("rocEye", { diameter: 0.16, segments: 8 }, scene), glow, 2.85, side * 0.3, 1.3);
      // Wings, half spread and swept back, barred with storm blue.
      const wing = MeshBuilder.CreateBox("rocWing", { width: 2.6, height: 0.1, depth: 1.1 }, scene);
      wing.rotation.z = side * 0.35;
      wing.rotation.y = side * 0.3;
      add(wing, feather, 2.3, side * 1.95, -0.15);
      const stripe = MeshBuilder.CreateBox("rocWingBar", { width: 2.4, height: 0.12, depth: 0.25 }, scene);
      stripe.rotation.z = side * 0.35;
      stripe.rotation.y = side * 0.3;
      add(stripe, bar, 2.32, side * 1.95, -0.45);
    }
    const tail = MeshBuilder.CreateBox("rocTail", { width: 1.1, height: 0.08, depth: 1.0 }, scene);
    tail.rotation.x = -0.4;
    add(tail, bar, 1.6, 0, -1.6);
    add(MeshBuilder.CreateTorus("rocCrest", { diameter: 0.5, thickness: 0.06, tessellation: 16 }, scene), glow, 3.15, 0, 0.95);
    pair("leg", 0.9, 0.14, beak, 0.4, 0.95);
  } else if (type === "ashMoth") {
    // Ash moth: a furry grey body on broad, ember-edged wings.
    const fur = mat(scene, "mothFur", 0.35, 0.32, 0.3, 0.1);
    const wingMat = mat(scene, "mothWing", 0.45, 0.4, 0.38, 0.1);
    const glow = mat(scene, "mothGlow", 0, 0, 0);
    glow.emissiveColor = new Color3(1, 0.5, 0.15);
    const body = MeshBuilder.CreateCapsule("mothBody", { height: 0.6, radius: 0.13, tessellation: 12 }, scene);
    body.rotation.x = Math.PI / 2;
    add(body, fur, 0.75);
    for (const side of [-1, 1]) {
      add(MeshBuilder.CreateSphere("mothEye", { diameter: 0.08, segments: 8 }, scene), glow, 0.82, side * 0.07, 0.3);
      const wing = MeshBuilder.CreateDisc("mothWingDisc", { radius: 0.38, tessellation: 18 }, scene);
      wing.rotation.x = Math.PI / 2;
      wing.rotation.z = side * 0.4;
      add(wing, wingMat, 0.82, side * 0.36, 0.02);
      const edge = MeshBuilder.CreateTorus("mothWingEdge", { diameter: 0.74, thickness: 0.03, tessellation: 18 }, scene);
      edge.rotation.z = side * 0.4;
      add(edge, glow, 0.82, side * 0.36, 0.02);
    }
  } else if (type === "puffcap") {
    // Puffcap: a squat white stalk under a fat glowing cap, speckled with spore pores.
    const stalk = mat(scene, "puffStalk", 0.85, 0.82, 0.75, 0.1);
    const cap = mat(scene, "puffCap", 0.5, 0.3, 0.6, 0.3);
    const glow = mat(scene, "puffGlow", 0, 0, 0);
    glow.emissiveColor = new Color3(0.55, 1, 0.35);
    add(MeshBuilder.CreateCylinder("puffStem", { diameterTop: 0.3, diameterBottom: 0.42, height: 0.5, tessellation: 14 }, scene), stalk, 0.25);
    add(MeshBuilder.CreateSphere("puffCapDome", { diameter: 0.9, segments: 16, slice: 0.55 }, scene), cap, 0.45);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(MeshBuilder.CreateSphere("puffSpot", { diameter: 0.12, segments: 8 }, scene), glow, 0.75, Math.cos(a) * 0.25, Math.sin(a) * 0.25);
    }
  } else if (type === "driftJelly") {
    // Drift jelly: a translucent bell drifting at head height, trailing glowing threads.
    const bell = mat(scene, "jellyBell", 0.55, 0.6, 0.85, 0.9);
    bell.alpha = 0.75;
    const glow = mat(scene, "jellyGlow", 0, 0, 0);
    glow.emissiveColor = new Color3(0.65, 0.5, 1);
    add(MeshBuilder.CreateSphere("jellyBellDome", { diameter: 0.7, segments: 16, slice: 0.55 }, scene), bell, 1.05);
    add(MeshBuilder.CreateSphere("jellyCore", { diameter: 0.22, segments: 10 }, scene), glow, 1.12);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(MeshBuilder.CreateCylinder("jellyThread", { diameter: 0.035, height: 0.75, tessellation: 5 }, scene), glow, 0.7, Math.cos(a) * 0.18, Math.sin(a) * 0.18);
    }
  } else if (type === "bogToad") {
    // Bog toad: a wide, warty toad with iron nodules on its back and big golden eyes.
    const skin = mat(scene, "toadSkin", 0.32, 0.36, 0.2, 0.3);
    const bellyMat = mat(scene, "toadBelly", 0.7, 0.66, 0.45, 0.1);
    const iron = mat(scene, "toadIron", 0.35, 0.3, 0.28, 0.7);
    const eye = mat(scene, "toadEye", 0, 0, 0);
    eye.emissiveColor = new Color3(1, 0.8, 0.2);
    const body = MeshBuilder.CreateSphere("toadBody", { diameter: 0.85, segments: 16 }, scene);
    body.scaling.set(1.2, 0.7, 1);
    body.bakeCurrentTransformIntoVertices();
    add(body, skin, 0.35);
    const throat = MeshBuilder.CreateSphere("toadThroat", { diameter: 0.5, segments: 12 }, scene);
    throat.scaling.set(1, 0.6, 0.6);
    throat.bakeCurrentTransformIntoVertices();
    add(throat, bellyMat, 0.28, 0, 0.32);
    for (const side of [-1, 1]) {
      add(MeshBuilder.CreateSphere("toadEyeBall", { diameter: 0.17, segments: 10 }, scene), eye, 0.62, side * 0.2, 0.28);
      const haunch = MeshBuilder.CreateSphere("toadHaunch", { diameter: 0.38, segments: 10 }, scene);
      haunch.scaling.set(0.8, 0.6, 1.2);
      haunch.bakeCurrentTransformIntoVertices();
      add(haunch, skin, 0.2, side * 0.45, -0.15);
    }
    for (let i = 0; i < 5; i++) add(MeshBuilder.CreateSphere("toadNodule", { diameter: 0.1, segments: 6 }, scene), iron, 0.62, (i - 2) * 0.12, -0.05 + (i % 2) * 0.12);
  } else if (type === "skyRay") {
    // Sky ray: a pale manta gliding at head height, a long whip tail behind.
    const skin = mat(scene, "raySkin", 0.82, 0.84, 0.94, 0.3);
    const back = mat(scene, "rayBack", 0.45, 0.55, 0.8, 0.3);
    const glow = mat(scene, "rayGlow", 0, 0, 0);
    glow.emissiveColor = new Color3(0.55, 0.85, 1);
    const wings = MeshBuilder.CreateSphere("rayWings", { diameter: 1, segments: 14 }, scene);
    wings.scaling.set(1.6, 0.12, 0.8);
    wings.bakeCurrentTransformIntoVertices();
    add(wings, skin, 1.05);
    const top = MeshBuilder.CreateSphere("rayBackPlate", { diameter: 0.55, segments: 12 }, scene);
    top.scaling.set(1.2, 0.25, 1.1);
    top.bakeCurrentTransformIntoVertices();
    add(top, back, 1.1);
    for (const side of [-1, 1]) add(MeshBuilder.CreateSphere("rayEye", { diameter: 0.07, segments: 8 }, scene), glow, 1.12, side * 0.16, 0.35);
    const tail = MeshBuilder.CreateCylinder("rayTail", { diameterTop: 0.02, diameterBottom: 0.06, height: 0.9, tessellation: 5 }, scene);
    tail.rotation.x = Math.PI / 2;
    add(tail, glow, 1.05, 0, -0.75);
  } else if (type === "nestEgg") {
    // Nest egg: a big speckled egg sat in a ring of silk and twigs.
    const shell = mat(scene, "eggShell", 0.9, 0.88, 0.82, 0.4);
    const silk = mat(scene, "eggSilk", 0.8, 0.82, 0.95, 0.2);
    const speck = mat(scene, "eggSpeck", 0.35, 0.45, 0.65, 0.2);
    const glow = mat(scene, "eggGlow", 0, 0, 0);
    glow.emissiveColor = new Color3(0.6, 0.85, 1);
    add(MeshBuilder.CreateTorus("eggNest", { diameter: 0.85, thickness: 0.22, tessellation: 18 }, scene), silk, 0.12);
    const egg = MeshBuilder.CreateSphere("eggBody", { diameter: 0.62, segments: 16 }, scene);
    egg.scaling.y = 1.3;
    egg.bakeCurrentTransformIntoVertices();
    add(egg, shell, 0.48);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(MeshBuilder.CreateSphere("eggSpot", { diameter: 0.09, segments: 6 }, scene), i % 3 ? speck : glow, 0.45 + (i % 2) * 0.2, Math.cos(a) * 0.28, Math.sin(a) * 0.28);
    }
  } else {
    // Technician: lab coat flare, goggles, and a boxy equipment pack.
    const coat = mat(scene, "techCoat", 0.92, 0.95, 0.97);
    add(MeshBuilder.CreateCylinder("techCoat", { height: 0.56, diameterTop: 0.36, diameterBottom: 0.56, tessellation: 18 }, scene), coat, 0.56);
    add(MeshBuilder.CreateCapsule("techTorso", { height: 0.55, radius: 0.19, tessellation: 16 }, scene), mat(scene, "techShirt", 0.3, 0.75, 0.75), 0.84);
    add(MeshBuilder.CreateSphere("techHead", { diameter: 0.34, segments: 16 }, scene), skin, 1.15);
    const goggles = MeshBuilder.CreateTorus("techGoggles", { diameter: 0.35, thickness: 0.07, tessellation: 16 }, scene);
    goggles.rotation.x = Math.PI / 2;
    add(goggles, mat(scene, "techLens", 0.1, 0.9, 0.85, 0.8), 1.17);
    add(MeshBuilder.CreateBox("techPack", { width: 0.34, height: 0.4, depth: 0.18 }, scene), mat(scene, "techPack", 0.35, 0.37, 0.42, 0.3), 0.85, 0, -0.24);
    pair("leg", 0.36, 0.075, mat(scene, "techTrousers", 0.2, 0.22, 0.28), 0.1, 0.34);
    pair("arm", 0.42, 0.07, coat, 0.25, 0.98);
  }

  // Finish every family with small readable features rather than more large primitives.
  const human = new Set<TargetTypeId>(["worker", "runner", "technician", "guard", "armoredGuard", "cryoScientist", "frostRunner", "handler", "dockhand", "mechanic"]);
  if (human.has(type)) {
    const head = meshes.find((m) => /Head$|Helmet$/.test(m.name));
    if (head) {
      const dark = mat(scene, `${type}Details`, 0.08, 0.11, 0.16, 0.3);
      for (const side of [-1, 1]) {
        add(MeshBuilder.CreateSphere(`${type}Eye`, { diameter: 0.035, segments: 18 }, scene), dark, head.position.y + 0.025, side * 0.065, 0.155);
      }
      add(MeshBuilder.CreateBox(`${type}Zipper`, { width: 0.018, height: 0.3, depth: 0.035 }, scene), dark, head.position.y - 0.36, 0, 0.21);
      add(MeshBuilder.CreateBox(`${type}Belt`, { width: 0.37, height: 0.055, depth: 0.33 }, scene), dark, head.position.y - 0.58);
      add(MeshBuilder.CreateBox(`${type}Pocket`, { width: 0.1, height: 0.1, depth: 0.045 }, scene), dark, head.position.y - 0.25, -0.09, 0.22);
    }
  }
  if (type === "boss") {
    const joint = mat(scene, `${type}Joints`, 0.12, 0.16, 0.2, 0.6);
    pair("leg", 0.6, 0.22, joint, 0.4, 0.6);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        add(MeshBuilder.CreateBox(`${type}ChestVent`, { width: 0.34, height: 0.045, depth: 0.08 }, scene), joint, 1.4 + i * 0.13, side * 0.5, 0.57);
      }
    }
  }
  if (["lurker", "chimera", "alphaSpecimen"].includes(type)) {
    const hide = meshes.find((m) => /Body$/.test(m.name))?.material as StandardMaterial;
    const large = type === "alphaSpecimen";
    for (let i = 0; i < 5; i++) {
      const ridge = MeshBuilder.CreateSphere(`${type}Ridge`, { diameter: large ? 0.8 : 0.32, segments: 16 }, scene);
      ridge.scaling.set(1, 0.3, 0.4);
      ridge.bakeCurrentTransformIntoVertices();
      // The alpha's ridges run down its forward-pitched back.
      if (large) add(ridge, hide, 2.08 + (0.8 - i * 0.35) * 0.5, 0, -0.31 + (0.8 - i * 0.35) * 0.87);
      else add(ridge, hide, 0.78, 0, 0.25 - i * 0.12);
    }
  }
  if (["pod", "fuelCell", "specimenTank", "patrolDrone", "loaderMech", "overseerMech"].includes(type)) {
    const hardware = mat(scene, `${type}Hardware`, 0.2, 0.25, 0.3, 0.7);
    const big = type === "overseerMech";
    for (const side of [-1, 1]) {
      for (const front of [-1, 1]) {
        add(MeshBuilder.CreateSphere(`${type}Fastener`, { diameter: big ? 0.12 : 0.065, segments: 12 }, scene), hardware, big ? 2.58 : 0.52, side * (big ? 0.65 : 0.22), front * (big ? 0.5 : 0.22));
      }
    }
    if (type === "patrolDrone") {
      for (const side of [-1, 1]) {
        add(MeshBuilder.CreateBox("droneRotorBlade", { width: 0.32, height: 0.025, depth: 0.055 }, scene), hardware, 1.11, side * 0.58);
      }
    }
  }
  const limbIndices = new Set(limbs.map((l) => l.index));
  meshes.forEach((m, i) => {
    if (limbIndices.has(i)) return;
    m.position.scaleInPlace(SCALE);
    m.scaling.setAll(SCALE);
    m.bakeCurrentTransformIntoVertices();
    m.isVisible = false;
  });
  // Batch fixed detail by material; joints and moving attachments remain separate.
  const result: Mesh[] = [];
  const remap = new Map<number, number>();
  const fixed = new Map<StandardMaterial, Mesh[]>();
  meshes.forEach((mesh, index) => {
    if (limbIndices.has(index) || /RotorBlade|ScarfTail|runnerTail|guardBaton|handlerPole|handlerLoop|mechWrench/.test(mesh.name)) {
      remap.set(index, result.length);
      result.push(mesh);
    } else {
      const material = mesh.material as StandardMaterial;
      const group = fixed.get(material) ?? [];
      group.push(mesh);
      fixed.set(material, group);
    }
  });
  for (const group of fixed.values()) {
    const mesh = group.length === 1 ? group[0]! : Mesh.MergeMeshes(group, true, true)!;
    mesh.isVisible = false;
    result.push(mesh);
  }
  return {
    meshes: result,
    limbs: limbs.map((limb) => ({ ...limb, index: remap.get(limb.index)!, parentIndex: limb.parentIndex === undefined ? undefined : remap.get(limb.parentIndex)! })),
  };
}

/**
 * A later world's kin of an earlier species: the same model, its colours pulled toward
 * `tint` (keeping each part's light and dark), and its glowing parts in `glow`.
 */
function recolour(t: Template, tint: [number, number, number], glow?: [number, number, number]): Template {
  const done = new Set<StandardMaterial>();
  for (const m of t.meshes) {
    const mat = m.material as StandardMaterial | null;
    if (!mat || done.has(mat)) continue;
    done.add(mat);
    const d = mat.diffuseColor;
    const light = Math.min(1.4, 0.35 + (0.3 * d.r + 0.59 * d.g + 0.11 * d.b) * 1.3);
    mat.diffuseColor = new Color3(tint[0] * light, tint[1] * light, tint[2] * light);
    const e = mat.emissiveColor;
    const strength = Math.max(e.r, e.g, e.b);
    if (strength > 0.05 && glow) mat.emissiveColor = new Color3(glow[0] * strength, glow[1] * strength, glow[2] * strength);
  }
  return t;
}

export class CrowdView {
  private templates = new Map<TargetTypeId, Template>();
  private pools = new Map<TargetTypeId, Visual[]>();
  private live = new Map<number, Visual>();
  private dissolving: Dissolve[] = [];
  private time = 0;
  private seen = new Set<number>();
  private ringMat: StandardMaterial | null = null;
  /** A golden halo over the prized specimen (there is at most one). */
  private halo: Mesh | null = null;
  /** Pooled ground telegraphs for bosses' signature strikes (unit size, scaled per hazard). */
  private hazardCircles: Array<{ ring: Mesh; fill: Mesh }> = [];
  private hazardLanes: Array<{ outline: Mesh; fill: Mesh }> = [];
  private hazardMats = new Map<HazardStyle, { ring: StandardMaterial; fill: StandardMaterial }>();

  /** Ice reads cold, eruptions sandy; shells and lashes keep the usual danger red. */
  private hazardMaterials(style: HazardStyle): { ring: StandardMaterial; fill: StandardMaterial } {
    let m = this.hazardMats.get(style);
    if (m) return m;
    const color = style === "ice" ? new Color3(0.45, 0.85, 1)
      : style === "erupt" ? new Color3(1, 0.6, 0.15)
      : style === "spore" ? new Color3(0.55, 1, 0.3)
      : style === "magma" ? new Color3(1, 0.4, 0.05)
      : new Color3(1, 0.22, 0.12);
    const make = (name: string, alpha: number) => {
      const s = new StandardMaterial(name, this.scene);
      s.diffuseColor = Color3.Black();
      s.emissiveColor = color;
      s.disableLighting = true;
      s.alpha = alpha;
      return s;
    };
    m = { ring: make(`hazardRing-${style}`, 0.7), fill: make(`hazardFill-${style}`, 0.32) };
    this.hazardMats.set(style, m);
    return m;
  }

  private updateHazards(targets: readonly TargetEntity[]): void {
    let circles = 0;
    let lanes = 0;
    for (const t of targets) {
      for (const h of t.boss?.hazards ?? []) {
        const mats = this.hazardMaterials(h.style);
        // Fills grow as the strike's own countdown runs out.
        const k = h.total > 0 ? Math.min(1, Math.max(0.05, 1 - h.timer / h.total)) : 1;
        if (h.shape === "circle") {
          let c = this.hazardCircles[circles];
          if (!c) {
            const ring = MeshBuilder.CreateTorus("hazardRing", { diameter: 2, thickness: 0.06, tessellation: 40 }, this.scene);
            const fill = MeshBuilder.CreateDisc("hazardFill", { radius: 1, tessellation: 40 }, this.scene);
            fill.rotation.x = Math.PI / 2;
            ring.isPickable = fill.isPickable = false;
            this.hazardCircles.push((c = { ring, fill }));
          }
          circles++;
          c.ring.material = mats.ring;
          c.fill.material = mats.fill;
          c.ring.setEnabled(true);
          c.fill.setEnabled(true);
          c.ring.position.set(h.x, 0.045, h.z);
          c.ring.scaling.set(h.radius, 1, h.radius);
          c.fill.position.set(h.x, 0.04, h.z);
          c.fill.scaling.set(h.radius * k, h.radius * k, 1);
        } else {
          let l = this.hazardLanes[lanes];
          if (!l) {
            const outline = MeshBuilder.CreateGround("hazardLane", { width: 1, height: 1 }, this.scene);
            const fill = MeshBuilder.CreateGround("hazardLaneFill", { width: 1, height: 1 }, this.scene);
            outline.isPickable = fill.isPickable = false;
            this.hazardLanes.push((l = { outline, fill }));
          }
          lanes++;
          // A lane is a whole strip, so it takes the faint material and its growing fill the strong one.
          l.outline.material = mats.fill;
          l.fill.material = mats.ring;
          const width = h.halfWidth * 2;
          l.outline.setEnabled(true);
          l.fill.setEnabled(true);
          l.outline.rotation.y = l.fill.rotation.y = Math.atan2(h.dirX, h.dirZ);
          l.outline.scaling.set(width, 1, h.length);
          l.outline.position.set(h.x + (h.dirX * h.length) / 2, 0.03, h.z + (h.dirZ * h.length) / 2);
          // The fill runs out from the boss along the lane.
          l.fill.scaling.set(width, 1, h.length * k);
          l.fill.position.set(h.x + (h.dirX * h.length * k) / 2, 0.035, h.z + (h.dirZ * h.length * k) / 2);
        }
      }
    }
    for (const c of this.hazardCircles.slice(circles)) {
      c.ring.setEnabled(false);
      c.fill.setEnabled(false);
    }
    for (const l of this.hazardLanes.slice(lanes)) {
      l.outline.setEnabled(false);
      l.fill.setEnabled(false);
    }
  }
  private fillMat: StandardMaterial | null = null;

  /** A ground strip the warden's charge will run along, filling as the windup completes. */
  private makeLane(tuning: BossTuning): { outline: Mesh; fill: Mesh } {
    this.ensureTelegraphMaterials();
    const width = tuning.chargeHitRadius * 2;
    const outline = MeshBuilder.CreateGround("laneOutline", { width, height: tuning.chargeDistance }, this.scene);
    outline.material = this.ringMat!;
    const fill = MeshBuilder.CreateGround("laneFill", { width, height: tuning.chargeDistance }, this.scene);
    fill.material = this.fillMat!;
    outline.setEnabled(false);
    fill.setEnabled(false);
    return { outline, fill };
  }

  private ensureTelegraphMaterials(): void {
    if (!this.ringMat || !this.fillMat) {
      this.ringMat = new StandardMaterial("telegraphRing", this.scene);
      this.ringMat.diffuseColor = Color3.Black();
      this.ringMat.emissiveColor = new Color3(1, 0.25, 0.15);
      this.ringMat.disableLighting = true;
      this.ringMat.alpha = 0.55;
      this.fillMat = new StandardMaterial("telegraphFill", this.scene);
      this.fillMat.diffuseColor = Color3.Black();
      this.fillMat.emissiveColor = new Color3(1, 0.2, 0.1);
      this.fillMat.disableLighting = true;
      this.fillMat.alpha = 0.3;
    }
  }

  private makeTelegraph(range: number): { ring: Mesh; fill: Mesh } {
    this.ensureTelegraphMaterials();
    const ring = MeshBuilder.CreateTorus("telegraphRing", { diameter: range * 2, thickness: 0.05, tessellation: 40 }, this.scene);
    ring.material = this.ringMat;
    const fill = MeshBuilder.CreateDisc("telegraphFill", { radius: range, tessellation: 40 }, this.scene);
    fill.rotation.x = Math.PI / 2;
    fill.material = this.fillMat;
    ring.isPickable = fill.isPickable = false;
    ring.setEnabled(false);
    fill.setEnabled(false);
    return { ring, fill };
  }

  constructor(private scene: Scene, private shadows: ShadowGenerator | null) {}

  private updateHalo(targets: readonly TargetEntity[], alpha: number): void {
    const prized = targets.find((t) => t.prized);
    if (!prized) {
      this.halo?.setEnabled(false);
      return;
    }
    if (!this.halo) {
      const m = new StandardMaterial("prizedHalo", this.scene);
      m.diffuseColor = Color3.Black();
      m.emissiveColor = new Color3(1, 0.82, 0.3);
      m.disableLighting = true;
      this.halo = MeshBuilder.CreateTorus("prizedHalo", { diameter: 0.7, thickness: 0.07, tessellation: 32 }, this.scene);
      this.halo.material = m;
      this.halo.isPickable = false;
    }
    const x = prized.prevX + (prized.x - prized.prevX) * alpha;
    const z = prized.prevZ + (prized.z - prized.prevZ) * alpha;
    this.halo.setEnabled(true);
    this.halo.position.set(x, 1.85 + Math.sin(this.time * 4) * 0.08, z);
    this.halo.rotation.y = this.time * 0.8;
  }

  private template(type: TargetTypeId): Template {
    let t = this.templates.get(type);
    if (!t) {
      const look = TARGETS[type].appearance;
      t = look ? recolour(makeTemplate(this.scene, look.like), look.tint, look.glow) : makeTemplate(this.scene, type);
      this.templates.set(type, t);
      for (const m of t.meshes) this.shadows?.addShadowCaster(m);
    }
    return t;
  }

  private acquire(type: TargetTypeId): Visual {
    const pool = this.pools.get(type);
    const v = pool?.pop();
    if (v) {
      v.node.setEnabled(true);
      v.node.scaling.setAll(sizeOf(type));
      return v;
    }
    const node = new TransformNode(`${type}Node`, this.scene);
    node.scaling.setAll(sizeOf(type));
    const tpl = this.template(type);
    const parts = tpl.meshes.map((m, i) => {
      const inst = m.createInstance(`${type}Inst${i}`);
      inst.parent = node;
      return inst;
    });
    const limbs = tpl.limbs.map((l) => {
      const inst = parts[l.index]!;
      inst.position.copyFrom(l.pivot);
      if (l.parentIndex !== undefined) inst.parent = parts[l.parentIndex]!;
      return { inst, role: l.role, joint: l.parentIndex !== undefined };
    });
    const accessories = tpl.meshes.flatMap((mesh, i) => {
      if (/guardBaton|handlerPole|handlerLoop|mechWrench/.test(mesh.name)) {
        const forearm = tpl.limbs.find((limb) => limb.role === "armR" && limb.parentIndex !== undefined);
        if (forearm) {
          const shoulder = tpl.limbs.find((limb) => limb.index === forearm.parentIndex)!;
          parts[i]!.parent = parts[forearm.index]!;
          parts[i]!.position.copyFrom(shoulder.pivot.add(forearm.pivot).scale(-1));
        }
        return [];
      }
      if (!/RotorBlade|ScarfTail|runnerTail/.test(mesh.name)) return [];
      // Baked template coordinates are world-local; recenter around an attachment pivot.
      const inst = parts[i]!;
      const bounds = mesh.getBoundingInfo().boundingBox.center.clone();
      // A separate pivot preserves the baked geometry and supports independent follow-through.
      const pivot = new TransformNode(`${mesh.name}Pivot`, this.scene);
      pivot.parent = node;
      pivot.position.copyFrom(bounds);
      inst.parent = pivot;
      inst.position.copyFrom(bounds.scale(-1));
      return [{ inst, rotor: /RotorBlade/.test(mesh.name) }];
    });
    const isBoss = TARGETS[type].behavior === "boss";
    const tuning = TARGETS[type].bossTuning ?? WARDEN;
    const range = isBoss ? tuning.slamRadius : TARGETS[type].combat?.attackRange;
    return {
      type, node, parts, limbs, accessories, phase: Math.random() * 10, stride: 0, initialized: false, sink: 0,
      telegraph: range ? this.makeTelegraph(range) : undefined,
      lane: isBoss ? this.makeLane(tuning) : undefined,
    };
  }

  private releaseVisual(v: Visual): void {
    v.node.setEnabled(false);
    v.initialized = false;
    v.stride = 0;
    v.sink = 0;
    v.telegraph?.ring.setEnabled(false);
    v.telegraph?.fill.setEnabled(false);
    let pool = this.pools.get(v.type);
    if (!pool) this.pools.set(v.type, (pool = []));
    pool.push(v);
  }

  /** Detach a captured target's visual and play its dissolve toward the creature. */
  captured(t: TargetEntity): void {
    const v = this.live.get(t.id);
    if (!v) return;
    this.live.delete(t.id);
    v.telegraph?.ring.setEnabled(false);
    v.telegraph?.fill.setEnabled(false);
    v.lane?.outline.setEnabled(false);
    v.lane?.fill.setEnabled(false);
    this.dissolving.push({ visual: v, t: 0, from: v.node.position.clone() });
  }

  /** Current grab point of a live target, for tentacle tips. */
  grabPoint(id: number, out: Vector3): Vector3 | null {
    const v = this.live.get(id);
    if (!v) return null;
    // A burrowed boss is held at the surface, not wherever its sunk body is.
    return out.set(v.node.position.x, Math.min(0.5, Math.max(0, v.node.position.y)) + GRAB_HEIGHT, v.node.position.z);
  }

  update(dt: number, targets: readonly TargetEntity[], alpha: number, creature: Vector3): void {
    this.time += dt;
    this.seen.clear();
    for (const t of targets) {
      this.seen.add(t.id);
      let v = this.live.get(t.id);
      if (!v) {
        v = this.acquire(t.def.id);
        this.live.set(t.id, v);
      }
      const x = t.prevX + (t.x - t.prevX) * alpha;
      const z = t.prevZ + (t.z - t.prevZ) * alpha;
      const moving = Math.abs(t.x - t.prevX) + Math.abs(t.z - t.prevZ) > 1e-4;
      // Stride rate follows actual speed, so runners sprint and the warden stomps.
      const speed = Math.hypot(t.x - t.prevX, t.z - t.prevZ) * 30;
      v.phase += dt * (moving ? 4 + speed * 5 : 0);
      v.stride += ((moving ? Math.min(0.9, 0.35 + speed * 0.18) : 0) - v.stride) * (1 - Math.exp(-dt * 10));
      animateLimbs(v, t, v.stride, this.time, dt);
      for (const accessory of v.accessories) {
        const pivot = accessory.inst.parent as TransformNode;
        if (accessory.rotor) pivot.rotation.y += dt * 35;
        else {
          pivot.rotation.x = Math.sin(this.time * 5 + t.id) * 0.12 + v.stride * 0.35;
          pivot.rotation.z = Math.sin(this.time * 3.4 + t.id) * 0.08;
        }
      }
      const flying = FLYERS.has(t.def.id);
      let y = Math.abs(Math.sin(v.phase)) * v.stride * 0.065 + Math.sin(this.time * 2.1 + t.id) * 0.012;
      if (flying) y = Math.sin(this.time * 3 + t.id) * 0.07;
      let rotZ = Math.sin(v.phase) * v.stride * 0.045;
      let rotX = Math.min(speed * 0.035, 0.16);
      if (t.def.behavior === "static") y = rotX = rotZ = 0;
      if (t.held) {
        // Struggle and lift slightly as capture progresses.
        rotZ = Math.sin(this.time * 22 + t.id) * 0.18;
        rotX = -0.15 - t.progress * 0.2;
        y += t.progress * 0.25;
      }
      if (t.boss && v.telegraph && v.lane) {
        const bs = t.boss;
        const T = t.def.bossTuning ?? WARDEN;
        const slam = bs.state === "slamWindup";
        const charge = bs.state === "chargeWindup";
        /** How far through the current windup (0..1). */
        const k = bs.total > 0 ? 1 - Math.max(0, bs.timer) / bs.total : 1;
        if (flyingBoss(t.def.id)) y = 0.35 + Math.sin(this.time * 1.8 + t.id) * 0.12;
        v.telegraph.ring.setEnabled(slam);
        v.telegraph.fill.setEnabled(slam);
        if (slam) {
          v.telegraph.ring.position.set(x, 0.04, z);
          v.telegraph.fill.position.set(x, 0.035, z);
          v.telegraph.fill.scaling.set(Math.max(0.05, k), Math.max(0.05, k), 1);
          rotX = -0.3 * k;
        }
        v.lane.outline.setEnabled(charge);
        v.lane.fill.setEnabled(charge);
        if (charge) {
          const yaw = Math.atan2(bs.dirX, bs.dirZ);
          // The lane mesh is built at the full charge distance; a frenzy's shorter runs scale it down.
          const len = bs.chargeLength / T.chargeDistance;
          const half = bs.chargeLength / 2;
          for (const m of [v.lane.outline, v.lane.fill]) {
            m.rotation.y = yaw;
            m.position.set(x + bs.dirX * half, m === v.lane.fill ? 0.035 : 0.03, z + bs.dirZ * half);
          }
          v.lane.outline.scaling.set(1, 1, len);
          v.lane.fill.scaling.set(1, 1, Math.max(0.05, k) * len);
          v.lane.fill.position.set(x + bs.dirX * half * k, 0.035, z + bs.dirZ * half * k);
          rotX = 0.35 * k; // crouch forward before the rush
        }
        if (bs.state === "stunned") {
          rotZ = Math.sin(this.time * 6) * 0.15;
          rotX = -0.2;
        }
        // Signature moves: rear back while casting; the wyrm sinks out of sight and surges back up.
        const burrow = T.special?.kind === "burrow";
        let sink = 0;
        if (bs.state === "casting") {
          if (burrow) sink = k;
          else rotX = -0.35 * k;
        } else if (bs.state === "burrowed") sink = 1;
        else if (bs.state === "erupting") sink = 1 - Math.max(0, k - 0.8) * 2;
        v.sink += (sink - v.sink) * (1 - Math.exp(-dt * (sink < v.sink ? 14 : 6)));
        if (v.sink > 0.01) {
          if (T.special?.kind === "burrow" && T.special.fly) {
            // Soars up out of reach and banks round overhead, then stoops on the player.
            y += v.sink * FLY_HEIGHT;
            rotZ = Math.sin(this.time * 2.4) * 0.35 * v.sink;
            rotX = 0.3 * v.sink;
          } else {
            // Just the crest breaks the surface while it tunnels, rippling as it goes.
            y -= v.sink * BURROW_DEPTH;
            rotZ = Math.sin(this.time * 9) * 0.08 * v.sink;
          }
        }
        v.node.position.set(x, y, z);
        this.pose(v, rotX, t.heading, rotZ, dt);
        continue;
      }
      const combat = t.def.combat;
      let facing = t.held ? Math.atan2(creature.x - x, creature.z - z) : t.heading;
      if (combat && v.telegraph) {
        const winding = t.ai === "windup";
        // Rear back through the windup, then lunge at the start of recovery.
        if (winding) {
          const k = 1 - Math.max(0, t.aiTimer) / combat.windupSeconds;
          rotX = -0.45 * k;
          facing = t.heading;
          v.telegraph.fill.scaling.set(Math.max(0.05, k), Math.max(0.05, k), 1);
        } else if (t.ai === "recover" && t.aiTimer > combat.cooldownSeconds - 0.25) {
          rotX = 0.5 * Math.max(0, 1 - (combat.cooldownSeconds - t.aiTimer) / 0.25);
          facing = t.heading;
        }
        v.telegraph.ring.setEnabled(winding);
        v.telegraph.fill.setEnabled(winding);
        if (winding) {
          v.telegraph.ring.position.set(x, 0.04, z);
          v.telegraph.fill.position.set(x, 0.035, z);
        }
      }
      v.node.position.set(x, y, z);
      this.pose(v, rotX, facing, rotZ, dt);
    }
    this.updateHazards(targets);
    this.updateHalo(targets, alpha);
    for (const [id, v] of this.live) {
      if (this.seen.has(id)) continue;
      this.live.delete(id);
      this.releaseVisual(v);
    }

    for (let i = this.dissolving.length - 1; i >= 0; i--) {
      const d = this.dissolving[i]!;
      d.t += dt / DISSOLVE_SECONDS;
      const k = Math.min(1, d.t);
      const e = k * k;
      d.visual.node.position.set(
        d.from.x + (creature.x - d.from.x) * e,
        d.from.y + 0.6 * Math.sin(Math.PI * k) + (0.9 - d.from.y) * e,
        d.from.z + (creature.z - d.from.z) * e,
      );
      d.visual.node.scaling.setAll(sizeOf(d.visual.type) * (1 - k * 0.95));
      d.visual.node.rotation.y += dt * 12;
      if (k >= 1) {
        this.dissolving.splice(i, 1);
        this.releaseVisual(d.visual);
      }
    }
  }

  private pose(v: Visual, pitch: number, yaw: number, roll: number, dt: number): void {
    if (!v.initialized) {
      v.node.rotation.set(pitch, yaw, roll);
      v.initialized = true;
      return;
    }
    const blend = 1 - Math.exp(-dt * 14);
    v.node.rotation.x += (pitch - v.node.rotation.x) * blend;
    v.node.rotation.z += (roll - v.node.rotation.z) * blend;
    const turn = yaw - v.node.rotation.y;
    v.node.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * blend;
  }
}

/** Swing legs and arms: walking gait, flailing when held, raised weapon during a guard windup, idle sway. */
function animateLimbs(v: Visual, t: TargetEntity, stride: number, time: number, dt: number): void {
  const swing = Math.sin(v.phase);
  const windup = t.ai === "windup" && t.def.combat ? 1 - Math.max(0, t.aiTimer) / t.def.combat.windupSeconds : 0;
  const lunge = t.ai === "recover" && t.def.combat && t.aiTimer > t.def.combat.cooldownSeconds - 0.25;
  for (const { inst, role, joint } of v.limbs) {
    const left = role.startsWith("insect") ? role.includes("L") : role.endsWith("L");
    const isArm = role.startsWith("arm");
    let rx = 0;
    let rz = 0;
    if (role.startsWith("insect")) {
      const offset = Number(role.slice(-1)) * Math.PI + (left ? 0 : Math.PI);
      rx = Math.sin(v.phase + offset) * stride * 0.65;
      rz = Math.max(0, Math.cos(v.phase + offset)) * stride * (left ? -0.22 : 0.22);
      if (t.held) rx = Math.sin(time * 16 + offset) * 0.5;
      const blend = 1 - Math.exp(-dt * 16);
      inst.rotation.x += (rx - inst.rotation.x) * blend;
      inst.rotation.z += (rz - inst.rotation.z) * blend;
      continue;
    }
    if (t.held) {
      // Flail: arms up and thrashing, legs kicking.
      rx = isArm ? -2.6 + Math.sin(time * 18 + (left ? 0 : 1.7) + t.id) * 0.45 : Math.sin(time * 14 + (left ? 0 : Math.PI)) * 0.5;
      rz = isArm ? (left ? -0.3 : 0.3) : 0;
    } else if (stride > 0) {
      const phase = left ? swing : -swing;
      rx = isArm ? -phase * stride * 0.9 : phase * stride;
    } else if (isArm) {
      rx = Math.sin(time * 1.6 + t.id + (left ? 0 : 1)) * 0.06;
    }
    // Guards raise the baton arm through the windup, then swing it down.
    if (isArm && !left && t.def.combat) {
      if (windup > 0) rx = -2.4 * windup;
      else if (lunge) rx = 0.9;
    }
    // Bosses raise both arms overhead through a slam or a cast, and bring them down after.
    const bs = t.boss;
    if (isArm && !joint && bs) {
      const raising = bs.state === "slamWindup" || bs.state === "casting";
      if (raising) rx = -2.5 * (bs.total > 0 ? 1 - Math.max(0, bs.timer) / bs.total : 1);
      else if (bs.state === "recover" && bs.total - bs.timer < 0.3) rx = 0.8;
    }
    if (joint) {
      const step = Math.sin(v.phase + (left ? 0 : Math.PI));
      rx = isArm ? -0.22 - stride * 0.5 : Math.max(0, -step) * stride * 1.4;
      if (t.held) rx = isArm ? -0.9 + Math.sin(time * 12 + t.id) * 0.3 : 0.7;
      rz = 0;
    } else if (isArm && !t.held) rz += left ? -0.06 : 0.06;
    const blend = 1 - Math.exp(-dt * (t.held ? 22 : 16));
    inst.rotation.x += (rx - inst.rotation.x) * blend;
    inst.rotation.z += (rz - inst.rotation.z) * blend;
  }
}
