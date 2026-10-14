import {
  Camera, Color3, Color4, DefaultRenderingPipeline, DirectionalLight, Engine, FreeCamera, GlowLayer, HemisphericLight, ImageProcessingConfiguration, Matrix, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, Vector3,
} from "@babylonjs/core";
import { zoneAt, type MapDef, type Rect } from "../content/map";
import { inBase } from "../game/systems/deposit";
import type { GameEvent, World } from "../game/world";
import type { LoadedCreatureSource } from "./creatureAssets";
import { CREATURE_FORMS, creatureModelPath, describeSource, isGlb, logSource, type CreatureForm } from "./creatureContract";
import type { CreatureLook } from "./creatureLook";
import type { GltfCreature } from "./gltfCreature";
import { ProceduralCreature } from "./proceduralCreature";
import { CrowdView } from "./crowd";
import { Effects } from "./effects";
import { buildDressing, type Dressing } from "./dressing";
import { StructuresView } from "./structures";
import { buildEnvironment, updateDoors, type Environment } from "./environment";

const CAMERA_OFFSET = new Vector3(0, 16, -11.5);
const CAMERA_FOV = 0.62;

export interface RenderOptions {
  reducedEffects: boolean;
  /** Load creature GLBs when present. False keeps the procedural creature. */
  creatureModels: boolean;
}

interface Bar {
  bg: Mesh;
  fill: Mesh;
}

export class GameRenderer {
  readonly engine: Engine;
  readonly scene: Scene;
  private camera: FreeCamera;
  private look = new Vector3();
  private cameraZone: Rect;
  private creature: CreatureLook;
  private modelCreature: GltfCreature | null = null;
  private shadows: ShadowGenerator | null = null;
  private crowd: CrowdView;
  private structures: StructuresView;
  private dressing: Dressing;
  private effects: Effects;
  private shakeAmount = 0;
  private reducedEffects: boolean;
  private env: Environment;
  private bars: Bar[] = [];
  private radiusRing: Mesh;
  private arrow: Mesh;
  private glow: GlowLayer | null = null;
  private goals: Array<Vector3 | null> = [];
  private goalStore: Vector3[] = [];
  private creaturePos = new Vector3();
  private time = 0;
  private depositPulse = 0;
  /** Evolution tier currently shown by the creature model. */
  private shownForm = 0;
  private snapNext = false;
  /**
   * Each form loads independently, retaining a procedural fallback when unavailable.
   */
  private creatureSources: Record<CreatureForm, LoadedCreatureSource>;
  /** Called whenever a creature source changes (dev panel status). */
  onCreatureSourcesChanged: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, private map: MapDef, opts: RenderOptions) {
    this.engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false, powerPreference: "high-performance" }, false);
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));
    const scene = (this.scene = new Scene(this.engine));
    scene.clearColor = new Color4(0.03, 0.025, 0.05, 1);
    scene.ambientColor = new Color3(0.1, 0.08, 0.14);
    scene.skipPointerMovePicking = true;

    this.camera = new FreeCamera("camera", CAMERA_OFFSET.clone(), scene);
    this.camera.inputs.clear();
    this.camera.fov = CAMERA_FOV;
    this.camera.minZ = 1;
    this.camera.maxZ = 80;

    const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, -0.3), scene);
    hemi.intensity = 0.55;
    hemi.diffuse = new Color3(0.75, 0.78, 0.95);
    hemi.groundColor = new Color3(0.12, 0.06, 0.18);
    const sun = new DirectionalLight("key", new Vector3(-0.45, -1, 0.55), scene);
    sun.position = new Vector3(10, 25, -12);
    sun.intensity = 0.95;
    sun.diffuse = new Color3(1, 0.95, 0.88);

    let shadows: ShadowGenerator | null = null;
    if (!opts.reducedEffects) {
      shadows = new ShadowGenerator(1024, sun);
      shadows.usePercentageCloserFiltering = true;
      shadows.darkness = 0.35;
      sun.shadowMinZ = 1;
      sun.shadowMaxZ = 60;
      this.glow = new GlowLayer("glow", scene, { mainTextureSamples: 1, blurKernelSize: 32 });
      this.glow.intensity = 0.55;
    }

    this.env = buildEnvironment(scene, map, shadows);
    this.shadows = shadows;
    this.glow?.addExcludedMesh(this.env.basePad);
    this.creature = new ProceduralCreature(scene, shadows);
    this.crowd = new CrowdView(scene, shadows);
    this.structures = new StructuresView(scene, shadows);
    this.dressing = buildDressing(scene, map, opts.reducedEffects);
    this.effects = new Effects(scene, !opts.reducedEffects);
    this.reducedEffects = opts.reducedEffects;
    if (!opts.reducedEffects) {
      // Anti-aliasing, filmic tone mapping and a soft vignette. Bloom stays off: the glow
      // layer already handles emissive neon, and doubling it washes the scene out.
      const pipeline = new DefaultRenderingPipeline("post", false, scene, [this.camera]);
      pipeline.fxaaEnabled = true;
      pipeline.imageProcessingEnabled = true;
      pipeline.imageProcessing.toneMappingEnabled = true;
      pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
      pipeline.imageProcessing.exposure = 1.3;
      pipeline.imageProcessing.contrast = 1.12;
      pipeline.imageProcessing.vignetteEnabled = true;
      pipeline.imageProcessing.vignetteWeight = 1.1;
      pipeline.imageProcessing.vignetteColor = new Color4(0.02, 0.0, 0.05, 0);
    }

    const ringMat = new StandardMaterial("radiusMat", scene);
    ringMat.diffuseColor = Color3.Black();
    ringMat.emissiveColor = new Color3(0.45, 0.25, 0.9);
    ringMat.alpha = 0.35;
    ringMat.disableLighting = true;
    this.radiusRing = MeshBuilder.CreateTorus("radius", { diameter: 2, thickness: 0.03, tessellation: 64 }, scene);
    this.radiusRing.material = ringMat;
    this.glow?.addExcludedMesh(this.radiusRing);

    const arrowMat = new StandardMaterial("arrowMat", scene);
    arrowMat.diffuseColor = Color3.Black();
    arrowMat.emissiveColor = new Color3(1, 0.7, 0.15);
    arrowMat.disableLighting = true;
    this.arrow = MeshBuilder.CreateDisc("arrow", { radius: 0.45, tessellation: 3 }, scene);
    this.arrow.rotation.x = Math.PI / 2;
    // Disc triangles start with their tip along +X; headings use local +Z.
    this.arrow.rotation.y = -Math.PI / 2;
    this.arrow.bakeCurrentTransformIntoVertices();
    this.arrow.scaling.set(0.7, 1, 1.2);
    this.arrow.material = arrowMat;
    this.arrow.setEnabled(false);

    const barBg = new StandardMaterial("barBg", scene);
    barBg.diffuseColor = Color3.Black();
    barBg.emissiveColor = new Color3(0.05, 0.05, 0.08);
    barBg.disableLighting = true;
    const barFill = new StandardMaterial("barFill", scene);
    barFill.diffuseColor = Color3.Black();
    barFill.emissiveColor = new Color3(0.3, 1, 0.6);
    barFill.disableLighting = true;
    for (let i = 0; i < 8; i++) {
      const bg = MeshBuilder.CreatePlane(`barBg${i}`, { width: 0.8, height: 0.12 }, scene);
      bg.billboardMode = Mesh.BILLBOARDMODE_ALL;
      bg.material = barBg;
      const fill = MeshBuilder.CreatePlane(`barFill${i}`, { width: 0.76, height: 0.08 }, scene);
      fill.parent = bg;
      fill.position.z = -0.005;
      fill.material = barFill;
      bg.setEnabled(false);
      this.glow?.addExcludedMesh(bg);
      this.bars.push({ bg, fill });
      this.goalStore.push(new Vector3());
    }

    this.cameraZone = map.zones[0]?.rect ?? map.bounds;
    this.resize();

    const initial: LoadedCreatureSource = { kind: opts.creatureModels ? "loading" : "forced" };
    this.creatureSources = { larval: initial, evolved: initial };
    if (opts.creatureModels) for (const form of CREATURE_FORMS) void this.loadCreatureModel(form);
  }

  /** Loads in the background; the procedural creature stays until a model is ready. */
  private async loadCreatureModel(form: CreatureForm): Promise<void> {
    const url = `${import.meta.env.BASE_URL}${creatureModelPath(form)}`;
    const source = await this.fetchCreatureModel(form, url);
    if (this.scene.isDisposed) {
      if (source.kind === "ready") source.container.dispose();
      return;
    }
    logSource(form, url, source);
    this.creatureSources[form] = source;
    if (source.kind === "ready") {
      const { GltfCreature } = await import("./gltfCreature");
      if (this.scene.isDisposed) { source.container.dispose(); return; }
      if (!this.modelCreature) {
        this.modelCreature = new GltfCreature(this.scene, this.creature as ProceduralCreature, this.shadows);
        this.creature = this.modelCreature;
      }
      this.modelCreature.addForm(form, source);
      this.modelCreature.setForm(this.shownForm, false);
    }
    this.onCreatureSourcesChanged?.();
  }

  private async fetchCreatureModel(form: CreatureForm, url: string): Promise<LoadedCreatureSource> {
    let bytes: Uint8Array;
    try {
      const res = await fetch(url);
      if (!res.ok) return { kind: "missing" };
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch {
      return { kind: "missing" };
    }
    // Dev servers answer unknown paths with index.html and status 200, so check the bytes.
    if (!isGlb(bytes)) return { kind: "missing" };
    try {
      // Only now download the glTF loader: without model files it never leaves the server.
      const { loadCreatureGlb } = await import("./creatureAssets");
      return await loadCreatureGlb(this.scene, form, bytes);
    } catch (err) {
      return { kind: "failed", reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /** e.g. "larval: GLB · evolved: procedural (no model)". */
  creatureStatus(): string {
    return CREATURE_FORMS.map((f) => `${f}: ${describeSource(this.creatureSources[f])}`).join(" · ");
  }

  resize(): void {
    this.engine.resize();
    const portrait = this.engine.getRenderHeight() > this.engine.getRenderWidth();
    // Keep horizontal coverage stable on narrow phones; vertical in landscape.
    this.camera.fovMode = portrait ? Camera.FOVMODE_HORIZONTAL_FIXED : Camera.FOVMODE_VERTICAL_FIXED;
  }

  handleEvents(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type === "captured") {
        this.crowd.captured(e.target);
        this.creature.gulp();
        this.effects.burst("capture", e.target.x, 0.9, e.target.z, e.target.def.behavior === "boss" ? 120 : 18);
      } else if (e.type === "deposited") {
        this.depositPulse = 1;
        this.effects.burst("deposit", this.map.base.x, 0.2, this.map.base.z, 6);
      } else if (e.type === "playerHit") {
        this.creature.hurt();
        this.effects.burst("hit", this.creaturePos.x, 0.9, this.creaturePos.z, 22);
        this.shake(Math.min(0.5, e.damage / 60));
      } else if (e.type === "bossStunned") {
        this.shake(0.35);
      } else if (e.type === "levelUp") {
        this.effects.burst("levelUp", this.creaturePos.x, 0.3, this.creaturePos.z, 60);
      } else if (e.type === "died") {
        // Respawn is a teleport: cut the camera instead of panning across the map.
        this.snapNext = true;
      } else if (e.type === "evolved") {
        this.effects.burst("evolve", this.creaturePos.x, 0.8, this.creaturePos.z, 140);
        this.creature.setForm(e.tier, true);
        this.shownForm = e.tier;
      }
    }
  }

  render(w: World, alpha: number, paused = false): void {
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.1);
    this.time += dt;
    const p = w.player;
    const x = p.prevX + (p.x - p.prevX) * alpha;
    const z = p.prevZ + (p.z - p.prevZ) * alpha;
    this.creaturePos.set(x, 0, z);

    this.crowd.update(dt, w.targets, alpha, this.creaturePos);
    this.structures.update(w, alpha, dt);
    this.dressing.update(dt);

    this.goals.length = w.tentacles.length;
    w.tentacles.forEach((t, i) => {
      const bar = this.bars[i];
      const out = this.goalStore[i]!;
      this.goals[i] = t ? this.crowd.grabPoint(t.id, out) : null;
      if (!bar) return;
      // A target held by several tentacles shows one bar, at its first slot.
      if (t && this.goals[i] && w.tentacles.indexOf(t) === i) {
        bar.bg.setEnabled(true);
        bar.bg.position.set(out.x, t.def.behavior === "boss" ? 3.6 : 2.0, out.z);
        const k = Math.max(0, Math.min(1, t.progress));
        bar.fill.scaling.x = Math.max(0.001, k);
        bar.fill.position.x = -(1 - k) * 0.38;
      } else {
        bar.bg.setEnabled(false);
      }
    });
    for (let i = w.tentacles.length; i < this.bars.length; i++) this.bars[i]!.bg.setEnabled(false);

    // Loads and dev devolves change the tier without an event: switch instantly.
    if (w.progress.evolution !== this.shownForm) {
      this.shownForm = w.progress.evolution;
      this.creature.setForm(this.shownForm, false);
    }
    this.creature.update(dt, x, z, paused ? 0 : p.vx, paused ? 0 : p.vz, this.goals);

    const r = w.stats.captureRadius;
    this.radiusRing.position.set(x, 0.04, z);
    this.radiusRing.scaling.set(r, 1, r);

    const showArrow = w.cargoFull && !inBase(w);
    this.arrow.setEnabled(showArrow);
    if (showArrow) {
      const dx = this.map.base.x - x;
      const dz = this.map.base.z - z;
      const len = Math.hypot(dx, dz) || 1;
      const off = 1.5 + Math.sin(this.time * 6) * 0.12;
      this.arrow.position.set(x + (dx / len) * off, 0.08, z + (dz / len) * off);
      this.arrow.rotation.y = Math.atan2(dx, dz);
    }

    this.depositPulse = Math.max(0, this.depositPulse - dt * 3);
    this.env.baseRing.rotation.y += dt * 0.6;
    const s = 1 + this.depositPulse * 0.08 + Math.sin(this.time * 2) * 0.015;
    this.env.baseRing.scaling.set(s, 1, s);

    updateDoors(this.env, w.progress.unlockedDoors, dt);

    this.updateCamera(x, z, this.snapNext ? 0 : dt);
    this.snapNext = false;
    this.scene.render();
  }

  shake(amount: number): void {
    if (this.reducedEffects) return;
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** Screen position (CSS pixels) of a world point, for HUD floaters. Null when off screen. */
  worldToScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const engine = this.engine;
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();
    const p = Vector3.Project(
      new Vector3(x, y, z),
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(w, h),
    );
    if (p.z < 0 || p.z > 1) return null;
    const scale = engine.getHardwareScalingLevel();
    return { x: p.x * scale, y: p.y * scale };
  }

  /** Snap the camera and doors to the current state (used after loading). */
  snapCamera(w: World): void {
    updateDoors(this.env, w.progress.unlockedDoors, 0, true);
    this.cameraZone = zoneAt(this.map, w.player.x, w.player.z)?.rect ?? this.map.bounds;
    this.updateCamera(w.player.x, w.player.z, 0);
  }

  private updateCamera(x: number, z: number, dt: number): void {
    // Horizontal framing follows the zone the player is in (kept while crossing a doorway).
    this.cameraZone = zoneAt(this.map, x, z)?.rect ?? this.cameraZone;
    const zr = this.cameraZone;
    const dist = CAMERA_OFFSET.length();
    const aspect = this.engine.getAspectRatio(this.camera);
    const halfW = this.camera.fovMode === Camera.FOVMODE_HORIZONTAL_FIXED
      ? dist * Math.tan(CAMERA_FOV / 2)
      : dist * Math.tan(CAMERA_FOV / 2) * aspect;
    const cx = (zr.minX + zr.maxX) / 2;
    const marginX = Math.max(0, (zr.maxX - zr.minX) / 2 - halfW + 1);
    // Depth is only clamped at the facility ends, so the next zone stays visible through doors.
    const b = this.map.bounds;
    const tx = Math.max(cx - marginX, Math.min(x, cx + marginX));
    const tz = Math.max(b.minZ + 8, Math.min(z, b.maxZ - 9));

    // Smooth toward the clamped target so zone changes never jump.
    const k = dt === 0 ? 1 : 1 - Math.exp(-dt * 6);
    this.look.x += (tx - this.look.x) * k;
    this.look.z += (tz - this.look.z) * k;

    // Brief, decaying shake on heavy hits (never with reduced effects).
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 1.8);
    const sx = this.shakeAmount > 0 ? (Math.random() - 0.5) * this.shakeAmount : 0;
    const sz = this.shakeAmount > 0 ? (Math.random() - 0.5) * this.shakeAmount : 0;
    this.camera.position.set(this.look.x + CAMERA_OFFSET.x + sx, CAMERA_OFFSET.y, this.look.z + CAMERA_OFFSET.z + sz);
    this.camera.setTarget(new Vector3(this.look.x + sx, 0, this.look.z + 0.5 + sz));
  }
}
