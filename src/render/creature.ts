import {
  Color3, FresnelParameters, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, TransformNode, Vector3,
} from "@babylonjs/core";

const SEGMENTS = 14;
const BODY_Y = 0.85;

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

  /** Cubic Bézier from a to d, with a sideways wiggle that vanishes at both ends. */
  set(a: Vector3, b: Vector3, c: Vector3, d: Vector3, wiggle: Vector3, phase: number): void {
    for (let i = 0; i < SEGMENTS; i++) {
      const t = i / (SEGMENTS - 1);
      const u = 1 - t;
      const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
      const s = Math.sin(phase + t * 5) * Math.sin(Math.PI * t);
      this.path[i]!.set(
        a.x * w0 + b.x * w1 + c.x * w2 + d.x * w3 + wiggle.x * s,
        a.y * w0 + b.y * w1 + c.y * w2 + d.y * w3 + wiggle.y * s,
        a.z * w0 + b.z * w1 + c.z * w2 + d.z * w3 + wiggle.z * s,
      );
    }
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

export class CreatureView {
  readonly root: TransformNode;
  private body: Mesh;
  private mantle: Mesh;
  private legs: Tube[] = [];
  private arms: ArmState[] = [];
  private heading = 0;
  private time = 0;
  private pulse = 0;
  private tmp = { a: new Vector3(), b: new Vector3(), c: new Vector3(), d: new Vector3(), w: new Vector3() };

  constructor(scene: Scene, shadows: ShadowGenerator | null) {
    this.root = new TransformNode("creature", scene);
    const skin = glossyMaterial(scene, "creatureSkin");

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
    for (const side of [-1, 1]) {
      const eye = MeshBuilder.CreateSphere("eye", { diameter: 0.3, segments: 12 }, scene);
      eye.position.set(side * 0.24, 0.12, 0.55);
      eye.scaling.set(1, 0.75, 0.6);
      eye.material = eyeMat;
      eye.parent = this.body;
      const pupil = MeshBuilder.CreateSphere("pupil", { diameter: 0.14, segments: 8 }, scene);
      pupil.position.set(0, 0, 0.11);
      pupil.scaling.set(0.5, 1.2, 0.5);
      pupil.material = pupilMat;
      pupil.parent = eye;
    }

    const tipMat = new StandardMaterial("tipMat", scene);
    tipMat.diffuseColor = Color3.Black();
    tipMat.emissiveColor = new Color3(0.2, 1, 0.75);
    tipMat.disableLighting = true;

    for (let i = 0; i < 6; i++) {
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
    const bob = Math.sin(this.time * 3.2) * 0.05;
    const lean = Math.min(speed / 4, 1) * 0.18;

    this.root.position.set(x, 0, z);
    this.root.rotation.y = this.heading;
    this.body.position.y = BODY_Y + bob;
    this.body.rotation.x = lean;
    const squash = 1 + this.pulse * 0.12;
    this.body.scaling.set(squash, 0.82 / squash, 1.05 * squash);

    const { a, b, c, d, w } = this.tmp;
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);

    // Walking legs: splay around the body and trail opposite to motion.
    this.legs.forEach((leg, i) => {
      const ang = (i / this.legs.length) * Math.PI * 2 + 0.3;
      const lx = Math.sin(ang), lz = Math.cos(ang);
      const wx = lx * cosH + lz * sinH;
      const wz = -lx * sinH + lz * cosH;
      const gait = Math.sin(this.time * (4 + speed * 2.5) + i * 1.7);
      a.set(x + wx * 0.35, BODY_Y + bob - 0.2, z + wz * 0.35);
      b.set(x + wx * 0.8, 0.55, z + wz * 0.8);
      d.set(x + wx * (1.15 + gait * 0.08) - vx * 0.08, 0.04, z + wz * (1.15 + gait * 0.08) - vz * 0.08);
      c.set((b.x + d.x) / 2, 0.35 + Math.max(0, gait) * 0.15, (b.z + d.z) / 2);
      w.set(-wz * 0.06, 0.04, wx * 0.06);
      leg.set(a, b, c, d, w, this.time * 2 + i);
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
      arm.ext += ((arm.attached ? 1 : 0) - arm.ext) * Math.min(1, dt * (arm.attached ? 9 : 7));
      if (arm.ext < 0.02 && !arm.attached) {
        arm.ext = 0;
        arm.tube.mesh.setEnabled(false);
        arm.tip.setEnabled(false);
        return;
      }
      arm.tube.mesh.setEnabled(true);
      arm.tip.setEnabled(true);
      const dx = arm.goal.x - x, dz = arm.goal.z - z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = dx / len, nz = dz / len;
      a.set(x + nx * 0.45, BODY_Y + bob - 0.05, z + nz * 0.45);
      d.set(a.x + (arm.goal.x - a.x) * arm.ext, a.y + (arm.goal.y - a.y) * arm.ext, a.z + (arm.goal.z - a.z) * arm.ext);
      const reach = Math.hypot(d.x - a.x, d.z - a.z);
      b.set(a.x + nx * reach * 0.3, a.y + 0.5 * arm.ext, a.z + nz * reach * 0.3);
      c.set(d.x - nx * reach * 0.25, d.y + 0.6 * arm.ext, d.z - nz * reach * 0.25);
      const side = i % 2 === 0 ? 1 : -1;
      w.set(-nz * 0.14 * side, 0.05, nx * 0.14 * side);
      arm.tube.set(a, b, c, d, w, this.time * 8 + i * 2);
      arm.tip.position.copyFrom(d);
      const tipScale = 1 + Math.sin(this.time * 14 + i) * 0.15;
      arm.tip.scaling.setAll(tipScale);
    });
  }
}
