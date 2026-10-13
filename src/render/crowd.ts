import {
  Color3, InstancedMesh, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, TransformNode, Vector3,
} from "@babylonjs/core";
import type { TargetTypeId } from "../content/targets";
import type { TargetEntity } from "../game/world";

interface Visual {
  type: TargetTypeId;
  node: TransformNode;
  parts: InstancedMesh[];
  phase: number;
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
  return m;
}

/**
 * Stylised humans. Each type differs in silhouette as well as colour, so
 * types stay distinguishable without relying on colour alone.
 */
function makeTemplate(scene: Scene, type: TargetTypeId): Mesh[] {
  const skin = mat(scene, `${type}Skin`, 0.93, 0.74, 0.6, 0.05);
  const parts: Mesh[] = [];
  const add = (m: Mesh, material: StandardMaterial, y: number, x = 0, z = 0) => {
    m.position.set(x, y, z);
    m.material = material;
    parts.push(m);
  };

  if (type === "worker") {
    // Stocky jumpsuit with a hard hat.
    add(MeshBuilder.CreateCapsule("workerBody", { height: 0.95, radius: 0.22, tessellation: 10 }, scene), mat(scene, "workerSuit", 0.95, 0.5, 0.12), 0.5);
    add(MeshBuilder.CreateSphere("workerHead", { diameter: 0.34, segments: 10 }, scene), skin, 1.12);
    add(MeshBuilder.CreateSphere("workerHat", { diameter: 0.38, segments: 10, slice: 0.5 }, scene), mat(scene, "workerHat", 0.98, 0.88, 0.2, 0.4), 1.17);
  } else if (type === "runner") {
    // Tall and thin with a headband and trailing ponytail: reads as fast.
    add(MeshBuilder.CreateCapsule("runnerBody", { height: 1.05, radius: 0.16, tessellation: 10 }, scene), mat(scene, "runnerSuit", 0.2, 0.55, 1), 0.55);
    add(MeshBuilder.CreateSphere("runnerHead", { diameter: 0.3, segments: 10 }, scene), skin, 1.22);
    add(MeshBuilder.CreateTorus("runnerBand", { diameter: 0.3, thickness: 0.06, tessellation: 16 }, scene), mat(scene, "runnerBand", 1, 0.25, 0.4), 1.27);
    add(MeshBuilder.CreateCapsule("runnerTail", { height: 0.32, radius: 0.05, tessellation: 6 }, scene), mat(scene, "runnerHair", 0.25, 0.15, 0.1), 1.18, 0, -0.17);
  } else {
    // Technician: lab coat flare, goggles, and a boxy equipment pack.
    add(MeshBuilder.CreateCylinder("techCoat", { height: 0.8, diameterTop: 0.36, diameterBottom: 0.56, tessellation: 12 }, scene), mat(scene, "techCoat", 0.92, 0.95, 0.97), 0.42);
    add(MeshBuilder.CreateCapsule("techTorso", { height: 0.55, radius: 0.19, tessellation: 10 }, scene), mat(scene, "techShirt", 0.3, 0.75, 0.75), 0.82);
    add(MeshBuilder.CreateSphere("techHead", { diameter: 0.34, segments: 10 }, scene), skin, 1.15);
    const goggles = MeshBuilder.CreateTorus("techGoggles", { diameter: 0.35, thickness: 0.07, tessellation: 16 }, scene);
    goggles.rotation.x = Math.PI / 2;
    add(goggles, mat(scene, "techLens", 0.1, 0.9, 0.85, 0.8), 1.17);
    add(MeshBuilder.CreateBox("techPack", { width: 0.34, height: 0.4, depth: 0.18 }, scene), mat(scene, "techPack", 0.35, 0.37, 0.42, 0.3), 0.85, 0, -0.24);
  }

  for (const p of parts) {
    p.position.scaleInPlace(1.2);
    p.scaling.setAll(1.2);
    p.bakeCurrentTransformIntoVertices();
    p.isVisible = false;
  }
  return parts;
}

export class CrowdView {
  private templates = new Map<TargetTypeId, Mesh[]>();
  private pools = new Map<TargetTypeId, Visual[]>();
  private live = new Map<number, Visual>();
  private dissolving: Dissolve[] = [];
  private time = 0;
  private seen = new Set<number>();

  constructor(private scene: Scene, private shadows: ShadowGenerator | null) {}

  private template(type: TargetTypeId): Mesh[] {
    let t = this.templates.get(type);
    if (!t) {
      t = makeTemplate(this.scene, type);
      this.templates.set(type, t);
      for (const m of t) this.shadows?.addShadowCaster(m);
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
    const parts = this.template(type).map((m, i) => {
      const inst = m.createInstance(`${type}Inst${i}`);
      inst.parent = node;
      return inst;
    });
    return { type, node, parts, phase: Math.random() * 10 };
  }

  private releaseVisual(v: Visual): void {
    v.node.setEnabled(false);
    let pool = this.pools.get(v.type);
    if (!pool) this.pools.set(v.type, (pool = []));
    pool.push(v);
  }

  /** Detach a captured target's visual and play its dissolve toward the creature. */
  captured(t: TargetEntity): void {
    const v = this.live.get(t.id);
    if (!v) return;
    this.live.delete(t.id);
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
      v.phase += dt * (moving ? 9 : 0);
      let y = moving ? Math.abs(Math.sin(v.phase)) * 0.07 : 0;
      let rotZ = 0;
      let rotX = 0;
      if (t.held) {
        // Struggle and lift slightly as capture progresses.
        rotZ = Math.sin(this.time * 22 + t.id) * 0.18;
        rotX = -0.15 - t.progress * 0.2;
        y += t.progress * 0.25;
      }
      v.node.position.set(x, y, z);
      v.node.rotation.set(rotX, t.held ? Math.atan2(creature.x - x, creature.z - z) : t.heading, rotZ);
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
