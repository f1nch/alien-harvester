import {
  Color3, InstancedMesh, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, TransformNode, Vector3,
} from "@babylonjs/core";
import { WARDEN } from "../content/reactor";
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
  private fillMat: StandardMaterial | null = null;

  /** A ground strip the warden's charge will run along, filling as the windup completes. */
  private makeLane(): { outline: Mesh; fill: Mesh } {
    this.ensureTelegraphMaterials();
    const width = WARDEN.chargeHitRadius * 2;
    const outline = MeshBuilder.CreateGround("laneOutline", { width, height: WARDEN.chargeDistance }, this.scene);
    outline.material = this.ringMat!;
    const fill = MeshBuilder.CreateGround("laneFill", { width, height: WARDEN.chargeDistance }, this.scene);
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
    const isBoss = type === "boss";
    const range = isBoss ? WARDEN.slamRadius : TARGETS[type].combat?.attackRange;
    return {
      type, node, parts, limbs, phase: Math.random() * 10,
      telegraph: range ? this.makeTelegraph(range) : undefined,
      lane: isBoss ? this.makeLane() : undefined,
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
        const slam = bs.state === "slamWindup";
        const charge = bs.state === "chargeWindup";
        v.telegraph.ring.setEnabled(slam);
        v.telegraph.fill.setEnabled(slam);
        if (slam) {
          const k = 1 - Math.max(0, bs.timer) / WARDEN.slamWindup;
          v.telegraph.ring.position.set(x, 0.04, z);
          v.telegraph.fill.position.set(x, 0.035, z);
          v.telegraph.fill.scaling.set(Math.max(0.05, k), Math.max(0.05, k), 1);
          rotX = -0.3 * k;
        }
        v.lane.outline.setEnabled(charge);
        v.lane.fill.setEnabled(charge);
        if (charge) {
          const k = 1 - Math.max(0, bs.timer) / WARDEN.chargeWindup;
          const yaw = Math.atan2(bs.dirX, bs.dirZ);
          const half = WARDEN.chargeDistance / 2;
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
