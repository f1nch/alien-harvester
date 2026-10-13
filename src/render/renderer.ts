import {
  Camera, Color3, Color4, DirectionalLight, Engine, FreeCamera, GlowLayer, HemisphericLight, Mesh, MeshBuilder,
  Scene, ShadowGenerator, StandardMaterial, Vector3,
} from "@babylonjs/core";
import { zoneAt, type MapDef, type Rect } from "../content/map";
import { inBase } from "../game/systems/deposit";
import type { GameEvent, World } from "../game/world";
import { CreatureView } from "./creature";
import { CrowdView } from "./crowd";
import { buildEnvironment, updateDoors, type Environment } from "./environment";

const CAMERA_OFFSET = new Vector3(0, 16, -11.5);
const CAMERA_FOV = 0.62;

export interface RenderOptions {
  reducedEffects: boolean;
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
  private creature: CreatureView;
  private crowd: CrowdView;
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
    this.glow?.addExcludedMesh(this.env.basePad);
    this.creature = new CreatureView(scene, shadows);
    this.crowd = new CrowdView(scene, shadows);

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
      } else if (e.type === "deposited") {
        this.depositPulse = 1;
      }
    }
  }

  render(w: World, alpha: number): void {
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.1);
    this.time += dt;
    const p = w.player;
    const x = p.prevX + (p.x - p.prevX) * alpha;
    const z = p.prevZ + (p.z - p.prevZ) * alpha;
    this.creaturePos.set(x, 0, z);

    this.crowd.update(dt, w.targets, alpha, this.creaturePos);

    this.goals.length = w.tentacles.length;
    w.tentacles.forEach((t, i) => {
      const bar = this.bars[i];
      const out = this.goalStore[i]!;
      this.goals[i] = t ? this.crowd.grabPoint(t.id, out) : null;
      if (!bar) return;
      if (t && this.goals[i]) {
        bar.bg.setEnabled(true);
        bar.bg.position.set(out.x, 2.0, out.z);
        const k = Math.max(0, Math.min(1, t.progress));
        bar.fill.scaling.x = Math.max(0.001, k);
        bar.fill.position.x = -(1 - k) * 0.38;
      } else {
        bar.bg.setEnabled(false);
      }
    });
    for (let i = w.tentacles.length; i < this.bars.length; i++) this.bars[i]!.bg.setEnabled(false);

    this.creature.update(dt, x, z, p.vx, p.vz, this.goals);

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

    this.updateCamera(x, z, dt);
    this.scene.render();
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

    this.camera.position.set(this.look.x + CAMERA_OFFSET.x, CAMERA_OFFSET.y, this.look.z + CAMERA_OFFSET.z);
    this.camera.setTarget(new Vector3(this.look.x, 0, this.look.z + 0.5));
  }
}
