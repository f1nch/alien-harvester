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

function makeTemplate(scene: Scene, type: TargetTypeId): Mesh[] {
  // Stylised worker: jumpsuit capsule, head, hard hat. Colours plus distinct shapes per type.
  const suit = new StandardMaterial(`${type}Suit`, scene);
  suit.diffuseColor = new Color3(0.95, 0.5, 0.12);
  suit.specularColor = new Color3(0.1, 0.1, 0.1);
  const skin = new StandardMaterial(`${type}Skin`, scene);
  skin.diffuseColor = new Color3(0.93, 0.74, 0.6);
  skin.specularColor = new Color3(0.05, 0.05, 0.05);
  const hat = new StandardMaterial(`${type}Hat`, scene);
  hat.diffuseColor = new Color3(0.98, 0.88, 0.2);
  hat.specularColor = new Color3(0.4, 0.4, 0.3);

  const body = MeshBuilder.CreateCapsule(`${type}Body`, { height: 0.95, radius: 0.22, tessellation: 10 }, scene);
  body.position.y = 0.5;
  body.material = suit;
  const head = MeshBuilder.CreateSphere(`${type}Head`, { diameter: 0.34, segments: 10 }, scene);
  head.position.y = 1.12;
  head.material = skin;
  const helmet = MeshBuilder.CreateSphere(`${type}Hat`, { diameter: 0.38, segments: 10, slice: 0.5 }, scene);
  helmet.position.y = 1.17;
  helmet.material = hat;
  const parts = [body, head, helmet];
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
