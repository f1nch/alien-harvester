import {
  Color3, InstancedMesh, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, TransformNode, Vector3,
} from "@babylonjs/core";
import { WARDEN, type BossTuning } from "../content/reactor";
import { TARGETS, type TargetTypeId } from "../content/targets";
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
  limbs: Array<{ inst: InstancedMesh; role: LimbRole }>;
  phase: number;
}

type LimbRole = "legL" | "legR" | "armL" | "armR";

/** A template: rigid parts baked in place, plus limbs baked with their pivot at the origin. */
interface Template {
  meshes: Mesh[];
  limbs: Array<{ index: number; role: LimbRole; pivot: Vector3 }>;
}

const SCALE = 1.2;

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
  /** A capsule hanging down from its pivot, mirrored left and right. */
  const pair = (kind: "leg" | "arm", length: number, radius: number, material: StandardMaterial, px: number, py: number) => {
    for (const side of [-1, 1] as const) {
      const m = MeshBuilder.CreateCapsule(`${type}${kind}`, { height: length, radius, tessellation: 8 }, scene);
      m.position.y = -length / 2 + radius * 0.5;
      m.scaling.setAll(SCALE);
      m.position.scaleInPlace(SCALE);
      m.bakeCurrentTransformIntoVertices();
      m.material = material;
      m.isVisible = false;
      limbs.push({ index: meshes.length, role: `${kind}${side < 0 ? "L" : "R"}` as LimbRole, pivot: new Vector3(px * side, py, 0).scaleInPlace(SCALE) });
      meshes.push(m);
    }
  };

  if (type === "worker") {
    // Stocky jumpsuit with a hard hat.
    const suit = mat(scene, "workerSuit", 0.95, 0.5, 0.12);
    add(MeshBuilder.CreateCapsule("workerBody", { height: 0.66, radius: 0.22, tessellation: 10 }, scene), suit, 0.72);
    add(MeshBuilder.CreateSphere("workerHead", { diameter: 0.34, segments: 10 }, scene), skin, 1.12);
    add(MeshBuilder.CreateSphere("workerHat", { diameter: 0.38, segments: 10, slice: 0.5 }, scene), mat(scene, "workerHat", 0.98, 0.88, 0.2, 0.4), 1.17);
    pair("leg", 0.46, 0.085, mat(scene, "workerBoots", 0.55, 0.3, 0.1), 0.1, 0.45);
    pair("arm", 0.42, 0.07, suit, 0.27, 0.95);
  } else if (type === "runner") {
    // Tall and thin with a headband and trailing ponytail: reads as fast.
    const suit = mat(scene, "runnerSuit", 0.2, 0.55, 1);
    add(MeshBuilder.CreateCapsule("runnerBody", { height: 0.62, radius: 0.15, tessellation: 10 }, scene), suit, 0.84);
    add(MeshBuilder.CreateSphere("runnerHead", { diameter: 0.3, segments: 10 }, scene), skin, 1.22);
    add(MeshBuilder.CreateTorus("runnerBand", { diameter: 0.3, thickness: 0.06, tessellation: 16 }, scene), mat(scene, "runnerBand", 1, 0.25, 0.4), 1.27);
    add(MeshBuilder.CreateCapsule("runnerTail", { height: 0.32, radius: 0.05, tessellation: 6 }, scene), mat(scene, "runnerHair", 0.25, 0.15, 0.1), 1.18, 0, -0.17);
    pair("leg", 0.55, 0.07, mat(scene, "runnerLegs", 0.12, 0.3, 0.7), 0.08, 0.56);
    pair("arm", 0.46, 0.055, skin, 0.2, 1.04);
  } else if (type === "guard") {
    // Security guard: navy uniform, peaked cap, baton held forward.
    const suit = mat(scene, "guardSuit", 0.12, 0.17, 0.38);
    add(MeshBuilder.CreateCapsule("guardBody", { height: 0.68, radius: 0.24, tessellation: 10 }, scene), suit, 0.78);
    add(MeshBuilder.CreateSphere("guardHead", { diameter: 0.33, segments: 10 }, scene), skin, 1.15);
    add(MeshBuilder.CreateCylinder("guardCap", { height: 0.1, diameter: 0.38, tessellation: 14 }, scene), mat(scene, "guardCap", 0.08, 0.1, 0.22, 0.3), 1.29);
    add(MeshBuilder.CreateBox("guardVisor", { width: 0.3, height: 0.03, depth: 0.14 }, scene), mat(scene, "guardVisor", 0.05, 0.05, 0.07, 0.5), 1.25, 0, 0.17);
    const baton = MeshBuilder.CreateCylinder("guardBaton", { height: 0.6, diameter: 0.06, tessellation: 6 }, scene);
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
    add(MeshBuilder.CreateCapsule("wardenBody", { height: 2.2, radius: 0.75, tessellation: 14 }, scene), dark, 1.15);
    add(MeshBuilder.CreateBox("wardenChest", { width: 1.7, height: 1.1, depth: 1.1 }, scene), plate, 1.55);
    add(MeshBuilder.CreateSphere("wardenCore", { diameter: 0.5, segments: 12 }, scene), core, 1.55, 0, 0.55);
    for (const side of [-1, 1]) {
      add(MeshBuilder.CreateSphere("wardenShoulder", { diameter: 0.85, segments: 10 }, scene), plate, 2.05, side * 0.95);
      const horn = MeshBuilder.CreateCylinder("wardenHorn", { diameterTop: 0, diameterBottom: 0.22, height: 0.7, tessellation: 8 }, scene);
      horn.rotation.z = -side * 0.5;
      add(horn, plate, 2.85, side * 0.35);
    }
    add(MeshBuilder.CreateSphere("wardenHelm", { diameter: 0.8, segments: 12 }, scene), plate, 2.5);
    const visor = mat(scene, "wardenVisor", 0, 0, 0);
    visor.emissiveColor = new Color3(1, 0.1, 0.05);
    add(MeshBuilder.CreateBox("wardenVisor", { width: 0.55, height: 0.1, depth: 0.12 }, scene), visor, 2.52, 0, 0.36);
    // Massive arms that swing as it stomps.
    pair("arm", 1.5, 0.28, dark, 1.05, 2.0);
  } else if (type === "armoredGuard") {
    // Armored guard: broad and plated with a visored helmet; reads as heavy at a glance.
    const plate = mat(scene, "armorPlate", 0.42, 0.45, 0.5, 0.6);
    const suit = mat(scene, "armorSuit", 0.2, 0.22, 0.26, 0.3);
    add(MeshBuilder.CreateCapsule("armorBody", { height: 0.72, radius: 0.31, tessellation: 12 }, scene), suit, 0.82);
    add(MeshBuilder.CreateBox("armorChest", { width: 0.6, height: 0.42, depth: 0.42 }, scene), plate, 0.8);
    for (const side of [-1, 1]) add(MeshBuilder.CreateSphere("armorShoulder", { diameter: 0.3, segments: 8 }, scene), plate, 1.0, side * 0.36);
    add(MeshBuilder.CreateSphere("armorHelmet", { diameter: 0.4, segments: 12 }, scene), plate, 1.2);
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
    add(MeshBuilder.CreateCapsule("cryoSciBody", { height: 0.7, radius: 0.29, tessellation: 12 }, scene), parka, 0.76);
    add(MeshBuilder.CreateTorus("cryoSciBelt", { diameter: 0.56, thickness: 0.06, tessellation: 14 }, scene), mat(scene, "cryoBelt", 0.25, 0.3, 0.4), 0.7);
    add(MeshBuilder.CreateSphere("cryoSciHead", { diameter: 0.3, segments: 10 }, scene), skin, 1.15, 0, 0.02);
    // Hood: a fur ring around the face and a puffy cowl behind it.
    const ruff = MeshBuilder.CreateTorus("cryoSciRuff", { diameter: 0.4, thickness: 0.11, tessellation: 14 }, scene);
    ruff.rotation.x = Math.PI / 2.3;
    add(ruff, fur, 1.16, 0, 0.03);
    add(MeshBuilder.CreateSphere("cryoSciHood", { diameter: 0.42, segments: 10, slice: 0.6 }, scene), parka, 1.2, 0, -0.04);
    add(MeshBuilder.CreateCylinder("cryoCanister", { height: 0.5, diameter: 0.2, tessellation: 10 }, scene), crystal, 0.9, 0, -0.34);
    add(MeshBuilder.CreateBox("cryoCanisterStrap", { width: 0.3, height: 0.06, depth: 0.1 }, scene), mat(scene, "cryoStrap", 0.25, 0.3, 0.4), 0.9, 0, -0.3);
    pair("leg", 0.4, 0.1, mat(scene, "cryoSciBoots", 0.3, 0.38, 0.5), 0.12, 0.4);
    pair("arm", 0.42, 0.095, parka, 0.34, 0.98);
  } else if (type === "frostRunner") {
    // Frost runner: lean thermal suit, trailing scarf and goggles; no pack, so it reads sleek and fast.
    const suit = mat(scene, "frostSuit", 0.82, 0.93, 1);
    const scarf = mat(scene, "frostScarf", 0.35, 0.7, 0.95);
    add(MeshBuilder.CreateCapsule("frostBody", { height: 0.64, radius: 0.14, tessellation: 10 }, scene), suit, 0.84);
    add(MeshBuilder.CreateSphere("frostHead", { diameter: 0.28, segments: 10 }, scene), skin, 1.22);
    add(MeshBuilder.CreateTorus("frostCowl", { diameter: 0.22, thickness: 0.09, tessellation: 12 }, scene), scarf, 1.07);
    add(MeshBuilder.CreateCapsule("frostScarfTail", { height: 0.5, radius: 0.045, tessellation: 6 }, scene), scarf, 0.98, 0.07, -0.14);
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
    const body = MeshBuilder.CreateSphere("droneBody", { diameter: 0.7, segments: 12 }, scene);
    // Flatten now: the generic bake below resets scaling to SCALE.
    body.scaling.y = 0.6;
    body.bakeCurrentTransformIntoVertices();
    add(body, hull, 1.0);
    add(MeshBuilder.CreateSphere("droneEye", { diameter: 0.2, segments: 8 }, scene), eye, 1.0, 0, 0.3);
    add(MeshBuilder.CreateTorus("droneBelt", { diameter: 0.72, thickness: 0.05, tessellation: 16 }, scene), dark, 0.98);
    add(MeshBuilder.CreateCylinder("droneSensor", { height: 0.14, diameterTop: 0.04, diameterBottom: 0.1, tessellation: 6 }, scene), dark, 1.3);
    for (const side of [-1, 1]) {
      add(MeshBuilder.CreateBox("droneFin", { width: 0.34, height: 0.04, depth: 0.2 }, scene), dark, 1.0, side * 0.5);
      add(MeshBuilder.CreateCylinder("droneRotor", { height: 0.02, diameter: 0.3, tessellation: 12 }, scene), hull, 1.08, side * 0.58);
    }
  } else if (type === "cryoSentinel") {
    // The cryo sentinel: an icy warden-sized figure with crystal spikes and a glowing visor.
    const plate = mat(scene, "sentinelPlate", 0.78, 0.92, 0.98, 0.8);
    const dark = mat(scene, "sentinelDark", 0.3, 0.46, 0.58, 0.5);
    const glow = mat(scene, "sentinelGlow", 0, 0, 0);
    glow.emissiveColor = new Color3(0.25, 0.95, 1);
    add(MeshBuilder.CreateCapsule("sentinelBody", { height: 2.2, radius: 0.75, tessellation: 14 }, scene), dark, 1.15);
    add(MeshBuilder.CreateBox("sentinelChest", { width: 1.7, height: 1.1, depth: 1.1 }, scene), plate, 1.55);
    add(MeshBuilder.CreateSphere("sentinelCore", { diameter: 0.45, segments: 10 }, scene), glow, 1.55, 0, 0.55);
    for (const side of [-1, 1]) {
      add(MeshBuilder.CreateSphere("sentinelShoulder", { diameter: 0.85, segments: 10 }, scene), plate, 2.05, side * 0.95);
      const spike = MeshBuilder.CreateCylinder("sentinelShoulderSpike", { diameterTop: 0, diameterBottom: 0.28, height: 0.9, tessellation: 6 }, scene);
      spike.rotation.z = -side * 0.55;
      add(spike, plate, 2.65, side * 1.15);
      const back = MeshBuilder.CreateCylinder("sentinelBackSpike", { diameterTop: 0, diameterBottom: 0.24, height: 0.8, tessellation: 6 }, scene);
      back.rotation.x = -0.5;
      add(back, glow, 2.0, side * 0.35, -0.8);
    }
    const crest = MeshBuilder.CreateCylinder("sentinelCrest", { diameterTop: 0, diameterBottom: 0.3, height: 0.8, tessellation: 6 }, scene);
    crest.rotation.x = -0.3;
    add(crest, plate, 3.0, 0, -0.1);
    add(MeshBuilder.CreateSphere("sentinelHelm", { diameter: 0.8, segments: 12 }, scene), plate, 2.5);
    add(MeshBuilder.CreateBox("sentinelVisor", { width: 0.55, height: 0.1, depth: 0.12 }, scene), glow, 2.52, 0, 0.36);
    // Heavy crystalline arms that swing as it stomps.
    pair("arm", 1.5, 0.28, dark, 1.05, 2.0);
  } else if (type === "handler") {
    // Handler: padded olive keeper suit, face shield, and a long catch-pole held forward.
    const suit = mat(scene, "handlerSuit", 0.42, 0.48, 0.28);
    const pad = mat(scene, "handlerPad", 0.3, 0.34, 0.2, 0.2);
    add(MeshBuilder.CreateCapsule("handlerBody", { height: 0.7, radius: 0.27, tessellation: 12 }, scene), suit, 0.78);
    add(MeshBuilder.CreateBox("handlerVest", { width: 0.5, height: 0.34, depth: 0.4 }, scene), pad, 0.84);
    add(MeshBuilder.CreateSphere("handlerHead", { diameter: 0.32, segments: 10 }, scene), skin, 1.16);
    add(MeshBuilder.CreateBox("handlerShield", { width: 0.3, height: 0.2, depth: 0.04 }, scene), mat(scene, "handlerVisor", 0.6, 0.85, 0.75, 0.9), 1.16, 0, 0.17);
    const pole = MeshBuilder.CreateCylinder("handlerPole", { height: 1.1, diameter: 0.05, tessellation: 6 }, scene);
    pole.rotation.x = Math.PI / 2.2;
    add(pole, mat(scene, "handlerPoleMat", 0.75, 0.75, 0.7, 0.5), 0.85, 0.3, 0.4);
    add(MeshBuilder.CreateTorus("handlerLoop", { diameter: 0.18, thickness: 0.03, tessellation: 12 }, scene), mat(scene, "handlerLoopMat", 0.95, 0.6, 0.1), 0.95, 0.3, 0.95);
    pair("leg", 0.42, 0.1, pad, 0.12, 0.42);
    pair("arm", 0.44, 0.085, suit, 0.33, 0.98);
  } else if (type === "lurker") {
    // Lurker: a low, pale, many-eyed escapee on spindly legs. No clothes: plainly not staff.
    const hide = mat(scene, "lurkerHide", 0.75, 0.8, 0.7, 0.3);
    const eye = mat(scene, "lurkerEye", 0, 0, 0);
    eye.emissiveColor = new Color3(0.6, 1, 0.3);
    const body = MeshBuilder.CreateSphere("lurkerBody", { diameter: 0.6, segments: 12 }, scene);
    body.scaling.set(0.8, 0.6, 1.3);
    body.bakeCurrentTransformIntoVertices();
    add(body, hide, 0.6);
    add(MeshBuilder.CreateSphere("lurkerHead", { diameter: 0.3, segments: 10 }, scene), hide, 0.72, 0, 0.38);
    for (const [x, y] of [[-0.07, 0.8], [0.07, 0.8], [0, 0.86]]) {
      add(MeshBuilder.CreateSphere("lurkerEyeBall", { diameter: 0.07, segments: 6 }, scene), eye, y!, x!, 0.5);
    }
    pair("leg", 0.5, 0.045, hide, 0.16, 0.5);
    pair("arm", 0.5, 0.045, hide, 0.16, 0.62);
  } else if (type === "chimera") {
    // Chimera: a hunched hybrid with a plated back, bone spurs, and a glowing red maw.
    const flesh = mat(scene, "chimeraFlesh", 0.55, 0.3, 0.32, 0.2);
    const plate = mat(scene, "chimeraPlate", 0.3, 0.26, 0.22, 0.5);
    const maw = mat(scene, "chimeraMaw", 0, 0, 0);
    maw.emissiveColor = new Color3(1, 0.2, 0.15);
    const body = MeshBuilder.CreateSphere("chimeraBody", { diameter: 0.8, segments: 12 }, scene);
    body.scaling.set(0.9, 0.75, 1.2);
    body.bakeCurrentTransformIntoVertices();
    add(body, flesh, 0.8);
    add(MeshBuilder.CreateBox("chimeraBack", { width: 0.6, height: 0.16, depth: 0.7 }, scene), plate, 1.1, 0, -0.05);
    for (const z of [-0.25, 0.05, 0.3]) {
      add(MeshBuilder.CreateCylinder("chimeraSpur", { diameterTop: 0, diameterBottom: 0.12, height: 0.3, tessellation: 6 }, scene), plate, 1.3, 0, z);
    }
    add(MeshBuilder.CreateSphere("chimeraHead", { diameter: 0.42, segments: 10 }, scene), flesh, 0.95, 0, 0.5);
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
    add(MeshBuilder.CreateSphere("tankSpecimen", { diameter: 0.34, segments: 8 }, scene), mat(scene, "tankShape", 0.15, 0.2, 0.15), 0.75);
    add(MeshBuilder.CreateCylinder("tankCap", { height: 0.14, diameter: 0.74, tessellation: 16 }, scene), metal, 1.34);
  } else if (type === "alphaSpecimen") {
    // The alpha specimen: a towering four-armed hybrid with a crown of spines and a green core.
    const hide = mat(scene, "alphaHide", 0.35, 0.18, 0.3, 0.3);
    const bone = mat(scene, "alphaBone", 0.85, 0.82, 0.72, 0.4);
    const glow = mat(scene, "alphaGlow", 0, 0, 0);
    glow.emissiveColor = new Color3(0.5, 1, 0.3);
    add(MeshBuilder.CreateCapsule("alphaBody", { height: 2.2, radius: 0.75, tessellation: 14 }, scene), hide, 1.15);
    add(MeshBuilder.CreateSphere("alphaChest", { diameter: 1.5, segments: 12 }, scene), hide, 1.6);
    add(MeshBuilder.CreateSphere("alphaCore", { diameter: 0.45, segments: 10 }, scene), glow, 1.6, 0, 0.62);
    add(MeshBuilder.CreateSphere("alphaHead", { diameter: 0.8, segments: 12 }, scene), hide, 2.5, 0, 0.1);
    add(MeshBuilder.CreateBox("alphaEyes", { width: 0.5, height: 0.08, depth: 0.12 }, scene), glow, 2.55, 0, 0.45);
    for (let i = 0; i < 5; i++) {
      const a = (i / 4 - 0.5) * 1.6;
      const spine = MeshBuilder.CreateCylinder("alphaSpine", { diameterTop: 0, diameterBottom: 0.2, height: 0.75, tessellation: 6 }, scene);
      spine.rotation.z = -a * 0.6;
      add(spine, bone, 3.0, Math.sin(a) * 0.4, -0.1);
    }
    for (const side of [-1, 1]) {
      const lower = MeshBuilder.CreateCapsule("alphaLowerArm", { height: 1.0, radius: 0.18, tessellation: 8 }, scene);
      lower.rotation.z = side * 0.4;
      add(lower, bone, 1.1, side * 1.0, 0.2);
    }
    // Heavy upper arms that swing as it stomps.
    pair("arm", 1.5, 0.28, hide, 1.05, 2.0);
  } else if (type === "dockhand") {
    // Dockhand: hi-vis orange overalls with reflective stripes, ear defenders, a toolbelt.
    const suit = mat(scene, "dockSuit", 1, 0.45, 0.08);
    const stripe = mat(scene, "dockStripe", 0.85, 0.95, 0.4, 0.6);
    add(MeshBuilder.CreateCapsule("dockBody", { height: 0.68, radius: 0.23, tessellation: 10 }, scene), suit, 0.74);
    add(MeshBuilder.CreateTorus("dockStripeChest", { diameter: 0.46, thickness: 0.05, tessellation: 14 }, scene), stripe, 0.92);
    add(MeshBuilder.CreateTorus("dockStripeWaist", { diameter: 0.48, thickness: 0.05, tessellation: 14 }, scene), stripe, 0.62);
    add(MeshBuilder.CreateSphere("dockHead", { diameter: 0.33, segments: 10 }, scene), skin, 1.14);
    for (const side of [-1, 1]) add(MeshBuilder.CreateSphere("dockEarMuff", { diameter: 0.13, segments: 8 }, scene), mat(scene, "dockMuff", 0.15, 0.15, 0.18), 1.14, side * 0.17);
    pair("leg", 0.45, 0.09, suit, 0.11, 0.45);
    pair("arm", 0.42, 0.075, suit, 0.29, 0.97);
  } else if (type === "mechanic") {
    // Mechanic: grease-stained blue coveralls, a welding visor flipped up, a wrench.
    const suit = mat(scene, "mechSuit", 0.2, 0.32, 0.55);
    add(MeshBuilder.CreateCapsule("mechBody", { height: 0.62, radius: 0.16, tessellation: 10 }, scene), suit, 0.84);
    add(MeshBuilder.CreateSphere("mechHead", { diameter: 0.29, segments: 10 }, scene), skin, 1.2);
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
    add(MeshBuilder.CreateSphere("loaderDriver", { diameter: 0.3, segments: 10 }, scene), skin, 1.22, 0, 0.05);
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
    add(MeshBuilder.CreateCylinder("fuelValve", { height: 0.16, diameter: 0.18, tessellation: 10 }, scene), mat(scene, "fuelValveMat", 0.3, 0.3, 0.33, 0.6), 0.98);
    add(MeshBuilder.CreateBox("fuelGauge", { width: 0.16, height: 0.1, depth: 0.04 }, scene), gauge, 0.4, 0, 0.3);
  } else if (type === "overseerMech") {
    // The overseer mech: a hulking walker with a cockpit dome, shoulder lamps and a red eye.
    const plate = mat(scene, "overseerPlate", 0.55, 0.55, 0.5, 0.7);
    const dark = mat(scene, "overseerDark", 0.18, 0.18, 0.2, 0.4);
    const eye = mat(scene, "overseerEye", 0, 0, 0);
    eye.emissiveColor = new Color3(1, 0.2, 0.1);
    const lamp = mat(scene, "overseerLamp", 0, 0, 0);
    lamp.emissiveColor = new Color3(1, 0.8, 0.3);
    add(MeshBuilder.CreateCapsule("overseerBody", { height: 2.2, radius: 0.75, tessellation: 14 }, scene), dark, 1.15);
    add(MeshBuilder.CreateBox("overseerHull", { width: 1.8, height: 1.2, depth: 1.3 }, scene), plate, 1.6);
    add(MeshBuilder.CreateSphere("overseerDome", { diameter: 0.9, segments: 12, slice: 0.5 }, scene), mat(scene, "overseerGlass", 0.3, 0.45, 0.55, 0.9), 2.2);
    add(MeshBuilder.CreateBox("overseerEye", { width: 0.6, height: 0.1, depth: 0.12 }, scene), eye, 1.85, 0, 0.66);
    for (const side of [-1, 1]) {
      add(MeshBuilder.CreateBox("overseerShoulder", { width: 0.6, height: 0.5, depth: 0.8 }, scene), plate, 2.05, side * 1.1);
      add(MeshBuilder.CreateSphere("overseerLamp", { diameter: 0.2, segments: 8 }, scene), lamp, 2.35, side * 1.1, 0.35);
    }
    // Hydraulic arms that swing as it stomps.
    pair("arm", 1.5, 0.28, dark, 1.05, 2.0);
  } else {
    // Technician: lab coat flare, goggles, and a boxy equipment pack.
    const coat = mat(scene, "techCoat", 0.92, 0.95, 0.97);
    add(MeshBuilder.CreateCylinder("techCoat", { height: 0.56, diameterTop: 0.36, diameterBottom: 0.56, tessellation: 12 }, scene), coat, 0.56);
    add(MeshBuilder.CreateCapsule("techTorso", { height: 0.55, radius: 0.19, tessellation: 10 }, scene), mat(scene, "techShirt", 0.3, 0.75, 0.75), 0.84);
    add(MeshBuilder.CreateSphere("techHead", { diameter: 0.34, segments: 10 }, scene), skin, 1.15);
    const goggles = MeshBuilder.CreateTorus("techGoggles", { diameter: 0.35, thickness: 0.07, tessellation: 16 }, scene);
    goggles.rotation.x = Math.PI / 2;
    add(goggles, mat(scene, "techLens", 0.1, 0.9, 0.85, 0.8), 1.17);
    add(MeshBuilder.CreateBox("techPack", { width: 0.34, height: 0.4, depth: 0.18 }, scene), mat(scene, "techPack", 0.35, 0.37, 0.42, 0.3), 0.85, 0, -0.24);
    pair("leg", 0.36, 0.075, mat(scene, "techTrousers", 0.2, 0.22, 0.28), 0.1, 0.34);
    pair("arm", 0.42, 0.07, coat, 0.25, 0.98);
  }

  const limbIndices = new Set(limbs.map((l) => l.index));
  meshes.forEach((m, i) => {
    if (limbIndices.has(i)) return;
    m.position.scaleInPlace(SCALE);
    m.scaling.setAll(SCALE);
    m.bakeCurrentTransformIntoVertices();
    m.isVisible = false;
  });
  return { meshes, limbs };
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
    this.halo.rotation.y += 0.05;
  }

  private template(type: TargetTypeId): Template {
    let t = this.templates.get(type);
    if (!t) {
      t = makeTemplate(this.scene, type);
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
      v.node.scaling.setAll(1);
      return v;
    }
    const node = new TransformNode(`${type}Node`, this.scene);
    const tpl = this.template(type);
    const parts = tpl.meshes.map((m, i) => {
      const inst = m.createInstance(`${type}Inst${i}`);
      inst.parent = node;
      return inst;
    });
    const limbs = tpl.limbs.map((l) => {
      const inst = parts[l.index]!;
      inst.position.copyFrom(l.pivot);
      return { inst, role: l.role };
    });
    const isBoss = TARGETS[type].behavior === "boss";
    const tuning = TARGETS[type].bossTuning ?? WARDEN;
    const range = isBoss ? tuning.slamRadius : TARGETS[type].combat?.attackRange;
    return {
      type, node, parts, limbs, phase: Math.random() * 10,
      telegraph: range ? this.makeTelegraph(range) : undefined,
      lane: isBoss ? this.makeLane(tuning) : undefined,
    };
  }

  private releaseVisual(v: Visual): void {
    v.node.setEnabled(false);
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
    return out.set(v.node.position.x, GRAB_HEIGHT, v.node.position.z);
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
      animateLimbs(v, t, moving ? Math.min(0.9, 0.35 + speed * 0.18) : 0, this.time);
      let y = moving ? Math.abs(Math.sin(v.phase)) * 0.07 : 0;
      let rotZ = 0;
      let rotX = 0;
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
        v.telegraph.ring.setEnabled(slam);
        v.telegraph.fill.setEnabled(slam);
        if (slam) {
          const k = 1 - Math.max(0, bs.timer) / T.slamWindup;
          v.telegraph.ring.position.set(x, 0.04, z);
          v.telegraph.fill.position.set(x, 0.035, z);
          v.telegraph.fill.scaling.set(Math.max(0.05, k), Math.max(0.05, k), 1);
          rotX = -0.3 * k;
        }
        v.lane.outline.setEnabled(charge);
        v.lane.fill.setEnabled(charge);
        if (charge) {
          const k = 1 - Math.max(0, bs.timer) / T.chargeWindup;
          const yaw = Math.atan2(bs.dirX, bs.dirZ);
          const half = T.chargeDistance / 2;
          for (const m of [v.lane.outline, v.lane.fill]) {
            m.rotation.y = yaw;
            m.position.set(x + bs.dirX * half, m === v.lane.fill ? 0.035 : 0.03, z + bs.dirZ * half);
          }
          v.lane.fill.scaling.set(1, 1, Math.max(0.05, k));
          v.lane.fill.position.set(x + bs.dirX * half * k, 0.035, z + bs.dirZ * half * k);
          rotX = 0.35 * k; // crouch forward before the rush
        }
        if (bs.state === "stunned") {
          rotZ = Math.sin(this.time * 6) * 0.15;
          rotX = -0.2;
        }
        v.node.position.set(x, y, z);
        v.node.rotation.set(rotX, t.heading, rotZ);
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
          rotX = 0.5;
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
      v.node.rotation.set(rotX, facing, rotZ);
    }
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
      d.visual.node.scaling.setAll(1 - k * 0.95);
      d.visual.node.rotation.y += dt * 12;
      if (k >= 1) {
        this.dissolving.splice(i, 1);
        this.releaseVisual(d.visual);
      }
    }
  }
}

/** Swing legs and arms: walking gait, flailing when held, raised weapon during a guard windup, idle sway. */
function animateLimbs(v: Visual, t: TargetEntity, stride: number, time: number): void {
  const swing = Math.sin(v.phase);
  const windup = t.ai === "windup" && t.def.combat ? 1 - Math.max(0, t.aiTimer) / t.def.combat.windupSeconds : 0;
  const lunge = t.ai === "recover" && t.def.combat && t.aiTimer > t.def.combat.cooldownSeconds - 0.25;
  for (const { inst, role } of v.limbs) {
    const left = role.endsWith("L");
    const isArm = role.startsWith("arm");
    let rx = 0;
    let rz = 0;
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
    inst.rotation.set(rx, 0, rz);
  }
}
