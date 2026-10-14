import {
  Color3, FresnelParameters, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, TransformNode, Vector3,
} from "@babylonjs/core";
import type { CreatureLook } from "./creatureLook";
import { armControls, curvePoint, stepExtension, type CurveControls } from "./tentacleCurve";

const SEGMENTS = 14;
const BODY_Y = 0.85;
const MAX_LEGS = 8;

/** Per-form look. Each evolution changes the silhouette, not just colour. */
interface FormStyle {
  size: number;
  legs: number;
  body: Color3;
  rim: Color3;
  tip: Color3;
  spines: boolean;
  extraEyes: boolean;
}

const FORMS: FormStyle[] = [
  { size: 1, legs: 6, body: new Color3(0.07, 0.04, 0.1), rim: new Color3(0.45, 0.15, 0.75), tip: new Color3(0.2, 1, 0.75), spines: false, extraEyes: false },
  { size: 1.28, legs: 8, body: new Color3(0.03, 0.07, 0.1), rim: new Color3(0.2, 0.75, 0.95), tip: new Color3(1, 0.35, 0.85), spines: true, extraEyes: true },
];

const MORPH_SECONDS = 1.1;

/** Endless tiers past the last style grow the body a little each, capped so the camera still frames it. */
const GROWTH_PER_TIER = 0.07;
const MAX_SIZE = 1.75;

function glossyMaterial(scene: Scene, name: string): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = new Color3(0.07, 0.04, 0.1);
  m.specularColor = new Color3(0.85, 0.75, 1);
  m.specularPower = 90;
  m.emissiveFresnelParameters = new FresnelParameters({
    leftColor: new Color3(0.45, 0.15, 0.75),
    rightColor: Color3.Black(),
    power: 2.4,
    bias: 0.05,
  });
  return m;
}

/** A tapered tube whose path is rebuilt in place each frame. */
class Tube {
  readonly mesh: Mesh;
  private path: Vector3[] = Array.from({ length: SEGMENTS }, () => new Vector3());
  private readonly radiusFn: (i: number) => number;

  constructor(scene: Scene, name: string, rootRadius: number, tipRadius: number, mat: StandardMaterial) {
    this.radiusFn = (i) => rootRadius + (tipRadius - rootRadius) * (i / (SEGMENTS - 1));
    for (let i = 0; i < SEGMENTS; i++) this.path[i]!.set(0, i * 0.01, 0);
    this.mesh = MeshBuilder.CreateTube(name, {
      path: this.path, radiusFunction: this.radiusFn, tessellation: 8, updatable: true, cap: Mesh.CAP_START,
    }, scene);
    this.mesh.material = mat;
    this.mesh.alwaysSelectAsActiveMesh = true;
  }

  /** Rebuilds the tube along the curve. */
  set(k: CurveControls): void {
    for (let i = 0; i < SEGMENTS; i++) curvePoint(k, i / (SEGMENTS - 1), this.path[i]!);
    MeshBuilder.CreateTube("", { path: this.path, radiusFunction: this.radiusFn, instance: this.mesh });
  }
}

interface ArmState {
  tube: Tube;
  tip: Mesh;
  ext: number;
  goal: Vector3;
  attached: boolean;
}

export class ProceduralCreature implements CreatureLook {
  readonly root: TransformNode;
  private materials: StandardMaterial[];
  private body: Mesh;
  private mantle: Mesh;
  private legs: Tube[] = [];
  private arms: ArmState[] = [];
  private heading = 0;
  private time = 0;
  private pulse = 0;
  private skin: StandardMaterial;
  private tipMat: StandardMaterial;
  private spines: Mesh[] = [];
  private extraEyes: Mesh[] = [];
  private form = 0;
  private size = 1;
  private fromSize = 1;
  private toSize = 1;
  /** 0..1 progress of the evolution morph; 1 when idle. */
  private morph = 1;
  private curve = {
    a: new Vector3(), b: new Vector3(), c: new Vector3(), d: new Vector3(), wiggle: new Vector3(), phase: 0,
  };
  private armRoot = new Vector3();

  constructor(scene: Scene, private shadows: ShadowGenerator | null) {
    this.root = new TransformNode("creature", scene);
    const skin = (this.skin = glossyMaterial(scene, "creatureSkin"));

    this.body = MeshBuilder.CreateSphere("body", { diameter: 1.4, segments: 24 }, scene);
    this.body.scaling.set(1, 0.82, 1.05);
    this.body.material = skin;
    this.body.parent = this.root;

    // Swept-back mantle gives a readable silhouette from above.
    this.mantle = MeshBuilder.CreateSphere("mantle", { diameter: 1.1, segments: 20 }, scene);
    this.mantle.scaling.set(0.8, 0.9, 1.35);
    this.mantle.position.set(0, 0.35, -0.45);
    this.mantle.rotation.x = -0.5;
    this.mantle.material = skin;
    this.mantle.parent = this.body;

    const eyeMat = new StandardMaterial("eyeMat", scene);
    eyeMat.diffuseColor = Color3.Black();
    eyeMat.emissiveColor = new Color3(0.75, 1, 0.3);
    eyeMat.disableLighting = true;
    const pupilMat = new StandardMaterial("pupilMat", scene);
    pupilMat.diffuseColor = Color3.Black();
    pupilMat.specularColor = new Color3(1, 1, 1);
    const makeEye = (x: number, y: number, z: number, size: number): Mesh => {
      const eye = MeshBuilder.CreateSphere("eye", { diameter: 0.3 * size, segments: 12 }, scene);
      eye.position.set(x, y, z);
      eye.scaling.set(1, 0.75, 0.6);
      eye.material = eyeMat;
      eye.parent = this.body;
      const pupil = MeshBuilder.CreateSphere("pupil", { diameter: 0.14 * size, segments: 8 }, scene);
      pupil.position.set(0, 0, 0.11 * size);
      pupil.scaling.set(0.5, 1.2, 0.5);
      pupil.material = pupilMat;
      pupil.parent = eye;
      return eye;
    };
    for (const side of [-1, 1]) makeEye(side * 0.24, 0.12, 0.55, 1);
    // Evolved forms gain a second, smaller pair of eyes above the first.
    for (const side of [-1, 1]) this.extraEyes.push(makeEye(side * 0.17, 0.33, 0.47, 0.6));

    // Dorsal spines along the mantle for evolved forms.
    const spineMat = glossyMaterial(scene, "spineMat");
    spineMat.diffuseColor = new Color3(0.2, 0.32, 0.38);
    spineMat.emissiveColor = new Color3(0.04, 0.16, 0.2);
    // A crest of spines rising clear of the mantle, so the silhouette changes from above.
    for (let i = 0; i < 5; i++) {
      const spine = MeshBuilder.CreateCylinder(`spine${i}`, { diameterTop: 0, diameterBottom: 0.2, height: 0.75 - i * 0.07, tessellation: 8 }, scene);
      spine.position.set(0, 0.78 - i * 0.04, 0.12 - i * 0.24);
      spine.rotation.x = -0.45 - i * 0.12;
      spine.material = spineMat;
      spine.parent = this.body;
      this.spines.push(spine);
    }
    for (const side of [-1, 1]) {
      const spine = MeshBuilder.CreateCylinder("spineSide", { diameterTop: 0, diameterBottom: 0.16, height: 0.55, tessellation: 8 }, scene);
      spine.position.set(side * 0.62, 0.3, -0.15);
      spine.rotation.z = -side * 1.0;
      spine.rotation.x = -0.4;
      spine.material = spineMat;
      spine.parent = this.body;
      this.spines.push(spine);
    }

    const tipMat = (this.tipMat = new StandardMaterial("tipMat", scene));
    tipMat.diffuseColor = Color3.Black();
    tipMat.emissiveColor = new Color3(0.2, 1, 0.75);
    tipMat.disableLighting = true;

    for (let i = 0; i < MAX_LEGS; i++) {
      const leg = new Tube(scene, `leg${i}`, 0.17, 0.04, skin);
      this.legs.push(leg);
      shadows?.addShadowCaster(leg.mesh);
    }
    // Capture arms get a brighter rim than the body so they read against it.
    const armSkin = glossyMaterial(scene, "armSkin");
    armSkin.diffuseColor = new Color3(0.14, 0.06, 0.2);
    armSkin.emissiveFresnelParameters!.leftColor = new Color3(0.75, 0.35, 1);
    armSkin.emissiveFresnelParameters!.power = 1.5;
    for (let i = 0; i < 8; i++) {
      const tube = new Tube(scene, `arm${i}`, 0.16, 0.06, armSkin);
      tube.mesh.setEnabled(false);
      const tip = MeshBuilder.CreateSphere(`armTip${i}`, { diameter: 0.22, segments: 8 }, scene);
      tip.material = tipMat;
      tip.setEnabled(false);
      this.arms.push({ tube, tip, ext: 0, goal: new Vector3(), attached: false });
    }
    shadows?.addShadowCaster(this.body, true);
    this.materials = [skin, eyeMat, pupilMat, spineMat, tipMat, armSkin];
    this.setForm(0, false);
  }

  hurt(): void {
    this.gulp();
  }

  dispose(): void {
    if (this.shadows) {
      this.shadows.removeShadowCaster(this.body, true);
      for (const leg of this.legs) this.shadows.removeShadowCaster(leg.mesh);
    }
    // Legs and arms live in world space, outside the root's hierarchy.
    for (const leg of this.legs) leg.mesh.dispose();
    for (const arm of this.arms) {
      arm.tube.mesh.dispose();
      arm.tip.dispose();
    }
    this.root.dispose();
    for (const m of this.materials) m.dispose();
  }

  /** Switch evolution form. With animate, the body swells through a morph. */
  setForm(tier: number, animate: boolean): void {
    const style = FORMS[Math.min(tier, FORMS.length - 1)]!;
    const size = Math.min(MAX_SIZE, style.size * (1 + GROWTH_PER_TIER * Math.max(0, tier - (FORMS.length - 1))));
    this.form = tier;
    this.toSize = size;
    this.fromSize = animate ? this.size : size;
    this.morph = animate ? 0 : 1;
    if (!animate) this.size = size;
    this.skin.diffuseColor = style.body.clone();
    // Replace (not mutate) the Fresnel parameters so the material is marked dirty.
    const f = this.skin.emissiveFresnelParameters!;
    this.skin.emissiveFresnelParameters = new FresnelParameters({
      leftColor: style.rim.clone(), rightColor: f.rightColor.clone(), power: f.power, bias: f.bias,
    });
    this.tipMat.emissiveColor = style.tip.clone();
    for (const m of this.spines) m.setEnabled(style.spines);
    for (const m of this.extraEyes) m.setEnabled(style.extraEyes);
    this.legs.forEach((leg, i) => leg.mesh.setEnabled(i < style.legs));
  }

  /** Called when a capture completes so the body visibly gulps. */
  gulp(): void {
    this.pulse = 1;
  }

  /**
   * @param goals Per-tentacle world position of the held target, or null.
   * @param flyTo Optional override (e.g. a dissolving target) for retracting arms.
   */
  update(dt: number, x: number, z: number, vx: number, vz: number, goals: Array<Vector3 | null>): void {
    this.time += dt;
    const speed = Math.hypot(vx, vz);
    if (speed > 0.05) {
      const target = Math.atan2(vx, vz);
      let diff = target - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * Math.min(1, dt * 10);
    }
    this.pulse = Math.max(0, this.pulse - dt * 4);
    const style = FORMS[Math.min(this.form, FORMS.length - 1)]!;
    if (this.morph < 1) {
      this.morph = Math.min(1, this.morph + dt / MORPH_SECONDS);
      // Overshoot then settle, so the evolution reads as a growth spurt.
      const k = this.morph;
      const swell = Math.sin(k * Math.PI) * 0.35;
      this.size = this.fromSize + (this.toSize - this.fromSize) * k + swell;
      for (const m of this.spines) if (style.spines) m.scaling.setAll(Math.min(1, k * 1.4));
    } else {
      this.size = this.toSize;
    }
    const s = this.size;
    this.root.scaling.setAll(s);
    const bodyY = BODY_Y * s;
    const bob = Math.sin(this.time * 3.2) * 0.05;
    const lean = Math.min(speed / 4, 1) * 0.18;

    this.root.position.set(x, 0, z);
    this.root.rotation.y = this.heading;
    this.body.position.y = BODY_Y + bob / s;
    this.body.rotation.x = lean;
    const squash = 1 + this.pulse * 0.12;
    this.body.scaling.set(squash, 0.82 / squash, 1.05 * squash);

    const k = this.curve;
    const { a, b, c, d, wiggle: w } = k;
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);

    // Walking legs: splay around the body and trail opposite to motion.
    const legCount = style.legs;
    this.legs.forEach((leg, i) => {
      if (i >= legCount) return;
      const ang = (i / legCount) * Math.PI * 2 + 0.3;
      const lx = Math.sin(ang), lz = Math.cos(ang);
      const wx = lx * cosH + lz * sinH;
      const wz = -lx * sinH + lz * cosH;
      const gait = Math.sin(this.time * (4 + speed * 2.5) + i * 1.7);
      a.set(x + wx * 0.35 * s, bodyY + bob - 0.2 * s, z + wz * 0.35 * s);
      b.set(x + wx * 0.8 * s, 0.55 * s, z + wz * 0.8 * s);
      const reach = (1.15 + gait * 0.08) * s;
      d.set(x + wx * reach - vx * 0.08, 0.04, z + wz * reach - vz * 0.08);
      c.set((b.x + d.x) / 2, (0.35 + Math.max(0, gait) * 0.15) * s, (b.z + d.z) / 2);
      w.set(-wz * 0.06, 0.04, wx * 0.06);
      k.phase = this.time * 2 + i;
      leg.set(k);
    });

    // Capture arms extend to their target, bend, and retract when released.
    this.arms.forEach((arm, i) => {
      const goal = goals[i] ?? null;
      if (goal) {
        arm.goal.copyFrom(goal);
        arm.attached = true;
      } else {
        arm.attached = false;
      }
      arm.ext = stepExtension(arm.ext, arm.attached, dt);
      if (arm.ext === 0 && !arm.attached) {
        arm.tube.mesh.setEnabled(false);
        arm.tip.setEnabled(false);
        return;
      }
      arm.tube.mesh.setEnabled(true);
      arm.tip.setEnabled(true);
      const dx = arm.goal.x - x, dz = arm.goal.z - z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = dx / len, nz = dz / len;
      this.armRoot.set(x + nx * 0.45 * s, bodyY + bob - 0.05 * s, z + nz * 0.45 * s);
      armControls(k, this.armRoot, nx, nz, arm.goal, arm.ext, i, this.time);
      arm.tube.set(k);
      arm.tip.position.copyFrom(d);
      const tipScale = 1 + Math.sin(this.time * 14 + i) * 0.15;
      arm.tip.scaling.setAll(tipScale);
    });
  }
}
