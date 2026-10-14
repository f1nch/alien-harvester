import {
  AnimationGroupMakeAnimationAdditive, Color3, PBRMaterial, RawTexture, StandardMaterial, Texture, TransformNode,
  type AnimationGroup, type InstantiatedEntries, type Mesh, type Scene, type ShadowGenerator, type Vector3,
} from "@babylonjs/core";
import type { LoadedCreatureSource } from "./creatureAssets";
import { formForTier, type CreatureForm } from "./creatureContract";
import type { CreatureLook } from "./creatureLook";
import type { ProceduralCreature } from "./proceduralCreature";

interface ModelView {
  root: TransformNode;
  entries: InstantiatedEntries;
  clips: Map<string, AnimationGroup>;
  sockets: TransformNode[];
  meshes: Mesh[];
  materials: StandardMaterial[];
  gaitSpeed: number;
  detailTextures: RawTexture[];
}

/** Fine directional fibers give the authored tissue and shell light-catching relief.
 * Generated once per form, with no external texture fetch or per-frame allocation. */
function surfaceDetail(scene: Scene, shell: boolean): RawTexture {
  const size = 128;
  const pixels = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size * Math.PI * 2;
      const v = y / size * Math.PI * 2;
      const nx = Math.cos(u * (shell ? 18 : 10) + Math.sin(v * 3) * 0.6) * (shell ? 0.12 : 0.22);
      const ny = Math.cos(v * 8 + Math.sin(u * 4)) * 0.07;
      const offset = (y * size + x) * 3;
      pixels[offset] = Math.round((nx * 0.5 + 0.5) * 255);
      pixels[offset + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      pixels[offset + 2] = Math.round(Math.sqrt(1 - nx * nx - ny * ny) * 127.5 + 127.5);
    }
  }
  const texture = RawTexture.CreateRGBTexture(pixels, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  texture.name = shell ? "chitinMicroRelief" : "tendonMicroRelief";
  texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

/** Authored bodies and animation clips, with independent procedural fallback per form. */
export class GltfCreature implements CreatureLook {
  readonly root: TransformNode;
  private views = new Map<CreatureForm, ModelView>();
  private tier = 0;
  private heading = 0;
  private moveWeight = 0;
  private captureWeight = 0;
  private motionSpeed = 0;
  private turnLean = 0;

  constructor(private scene: Scene, private fallback: ProceduralCreature, private shadows: ShadowGenerator | null) {
    this.root = new TransformNode("loadedCreature", scene);
  }

  addForm(form: CreatureForm, source: Extract<LoadedCreatureSource, { kind: "ready" }>): void {
    if (this.views.has(form)) return;
    const entries = source.container.instantiateModelsToScene((name) => name, false, { doNotInstantiate: true });
    const root = new TransformNode(`loadedCreature.${form}`, this.scene);
    root.parent = this.root;
    for (const node of entries.rootNodes) node.parent = root;
    const meshes = root.getChildMeshes() as Mesh[];
    const replacements = new Map<PBRMaterial, StandardMaterial>();
    const detailTextures: RawTexture[] = [];
    const detail = new Map<boolean, RawTexture>();
    for (const mesh of meshes) {
      const authored = mesh.material;
      if (authored instanceof PBRMaterial) {
        let mat = replacements.get(authored);
        if (!mat) {
          // Preserve the Stalker's dry authored palette in the game's direct-light scene.
          mat = new StandardMaterial(`${form}.${authored.name}`, this.scene);
          mat.diffuseColor = authored.albedoColor.scale(1.4);
          mat.diffuseTexture = authored.albedoTexture;
          mat.emissiveColor = authored.emissiveColor.equals(Color3.Black())
            ? authored.albedoColor.scale(0.25) : authored.emissiveColor.clone();
          mat.emissiveTexture = authored.emissiveTexture;
          mat.bumpTexture = authored.bumpTexture;
          if (!mat.bumpTexture && !/Core|Hook/i.test(authored.name)) {
            const shell = /Chitin/i.test(authored.name);
            let texture = detail.get(shell);
            if (!texture) {
              texture = surfaceDetail(this.scene, shell);
              detail.set(shell, texture);
              detailTextures.push(texture);
            }
            mat.bumpTexture = texture;
          }
          mat.specularColor = new Color3(0.16, 0.16, 0.16);
          mat.specularPower = Math.max(8, (1 - (authored.roughness ?? 0.7)) * 45);
          mat.backFaceCulling = authored.backFaceCulling;
          replacements.set(authored, mat);
        }
        mesh.material = mat;
      }
      mesh.receiveShadows = true;
      this.shadows?.addShadowCaster(mesh);
    }
    const clips = new Map(entries.animationGroups.map((group) => [group.name, group]));
    for (const name of ["capture", "gulp", "hurt", "evolve"]) {
      const group = clips.get(name);
      if (group) AnimationGroupMakeAnimationAdditive(group, { referenceFrame: group.from });
    }
    const sockets = root.getChildTransformNodes().filter((node) => /^socket\.tentacle\.\d+$/.test(node.name));
    const extras = source.container.transformNodes.find((node) => node.name === "Creature")?.metadata?.gltf?.extras;
    const authoredSpeed: unknown = extras?.gaitSpeedMps;
    const gaitSpeed = typeof authoredSpeed === "number" && Number.isFinite(authoredSpeed) && authoredSpeed > 0
      ? authoredSpeed : 3;
    this.views.set(form, { root, entries, clips, sockets, meshes, materials: [...replacements.values()], gaitSpeed, detailTextures });
    this.setForm(this.tier, false);
  }

  private current(): ModelView | undefined { return this.views.get(formForTier(this.tier)); }

  setForm(tier: number, animate: boolean): void {
    this.tier = tier;
    this.fallback.setForm(tier, animate);
    this.moveWeight = 0;
    this.captureWeight = 0;
    for (const [form, view] of this.views) {
      const active = form === formForTier(tier);
      view.root.setEnabled(active);
      for (const group of view.clips.values()) group.stop();
      if (active) {
        for (const name of ["idle", "move", "capture"]) {
          const group = view.clips.get(name);
          if (group) group.start(true, 1, group.from, group.to, name === "capture").setWeightForAllAnimatables(name === "idle" ? 1 : 0);
        }
      }
    }
    const active = this.current();
    this.fallback.setBodyVisible(!active);
    this.fallback.captureRoot = active ? (goal, out) => {
      let best = Infinity;
      for (const socket of active.sockets) {
        const p = socket.getAbsolutePosition();
        const distance = (p.x - goal.x) ** 2 + (p.z - goal.z) ** 2;
        if (distance < best) { best = distance; out.copyFrom(p); }
      }
    } : null;
    if (animate) this.play("evolve");
  }

  private play(name: string): void {
    const clip = this.current()?.clips.get(name);
    if (clip) { clip.stop(); clip.start(false, 1, clip.from, clip.to, true).setWeightForAllAnimatables(1); }
  }

  gulp(): void { this.current() ? this.play("gulp") : this.fallback.gulp(); }
  hurt(): void { this.current() ? this.play("hurt") : this.fallback.hurt(); }

  update(dt: number, x: number, z: number, vx: number, vz: number, goals: Array<Vector3 | null>): void {
    const speed = Math.hypot(vx, vz);
    const blend = 1 - Math.exp(-dt * 9);
    this.motionSpeed += (speed - this.motionSpeed) * blend;
    let turn = 0;
    if (speed > 0.05) {
      const diff = Math.atan2(vx, vz) - this.heading;
      turn = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += turn * (1 - Math.exp(-dt * 10));
    }
    this.turnLean += (Math.max(-0.12, Math.min(0.12, -turn * this.motionSpeed * 0.07)) - this.turnLean) * blend;
    this.root.position.set(x, 0, z);
    this.root.rotation.y = this.heading;
    // Secondary motion supplements the authored gait without moving its planted feet.
    const active = this.current();
    if (active) {
      active.root.rotation.x = Math.min(this.motionSpeed * 0.012, 0.05);
      active.root.rotation.z = this.turnLean;
    }
    this.root.computeWorldMatrix(true);
    const view = this.current();
    if (view) for (const socket of view.sockets) socket.computeWorldMatrix(true);
    this.fallback.update(dt, x, z, vx, vz, goals);
    this.fallback.setBodyVisible(!view);
    if (!view) return;
    this.moveWeight += (Math.min(1, this.motionSpeed / 0.7) - this.moveWeight) * blend;
    view.clips.get("idle")?.setWeightForAllAnimatables(1 - this.moveWeight);
    const move = view.clips.get("move");
    if (move) {
      // The baked stance travels backward at gaitSpeed; match world travel to it.
      move.speedRatio = speed / view.gaitSpeed;
      move.setWeightForAllAnimatables(this.moveWeight);
    }
    this.captureWeight += ((goals.some(Boolean) ? 0.65 : 0) - this.captureWeight) * blend;
    view.clips.get("capture")?.setWeightForAllAnimatables(this.captureWeight);
  }

  dispose(): void {
    this.fallback.captureRoot = null;
    this.fallback.dispose();
    for (const view of this.views.values()) {
      for (const mesh of view.meshes) this.shadows?.removeShadowCaster(mesh);
      view.entries.dispose();
      for (const material of view.materials) material.dispose();
      for (const texture of view.detailTextures) texture.dispose();
      view.root.dispose();
    }
    this.root.dispose();
  }
}
