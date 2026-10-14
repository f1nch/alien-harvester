import {
  Color3, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, TransformNode, Vector3,
} from "@babylonjs/core";
import { isBiomeCleared } from "../domain/biome";
import { cargoWeight } from "../domain/progress";
import { OUTPOST } from "../content/structures";
import { catcherLevel, droneCapacity, refineryLevel, vatLevel } from "../domain/structures";
import type { World } from "../game/world";

function material(scene: Scene, name: string, diffuse: Color3, emissive = Color3.Black(), alpha = 1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = diffuse;
  m.emissiveColor = emissive;
  m.alpha = alpha;
  return m;
}

/** Biomass vat (tank whose liquid level shows stock) and the hovering delivery drone. */
export class StructuresView {
  private vatRoot: TransformNode;
  private vatBuilt: TransformNode;
  private liquid: Mesh;
  private sitePad: Mesh;
  private drone: TransformNode;
  private payload: Mesh;
  private droneRing: Mesh;
  private rotors: Mesh[] = [];
  private bubbles: Mesh[] = [];
  private time = 0;
  private coreMat: StandardMaterial;
  private reactorRing: Mesh;
  private exitMat: StandardMaterial;
  /** Objective console and exit meshes, placed from the current biome on the first update. */
  private consoleParts: Mesh[];
  private exitParts: Mesh[];
  private placed = false;
  private exitRing: Mesh;
  private exitBeam: Mesh;
  private refineryRoot: TransformNode;
  private refineryBuilt: TransformNode;
  private refinerySite: Mesh;
  private refineryGlow: StandardMaterial;
  private ingots: Mesh[] = [];
  private outpostRoot: TransformNode;
  private outpostBuilt: TransformNode;
  private outpostSite: Mesh;
  private outpostRing: Mesh;
  private catcher: TransformNode;
  private catcherPayload: Mesh;
  private tetherPivot: TransformNode;
  private tether: Mesh;
  private aim = new Vector3();

  constructor(scene: Scene, shadows: ShadowGenerator | null) {
    this.vatRoot = new TransformNode("vat", scene);

    // Marked site, visible before building so the next objective is findable.
    this.sitePad = MeshBuilder.CreateDisc("vatSite", { radius: 1.1, tessellation: 32 }, scene);
    this.sitePad.rotation.x = Math.PI / 2;
    this.sitePad.position.y = 0.02;
    this.sitePad.material = material(scene, "vatSiteMat", Color3.Black(), new Color3(0.15, 0.4, 0.15), 0.6);
    this.sitePad.parent = this.vatRoot;

    this.vatBuilt = new TransformNode("vatBuilt", scene);
    this.vatBuilt.parent = this.vatRoot;
    const metal = material(scene, "vatMetal", new Color3(0.25, 0.28, 0.32));
    metal.specularColor = new Color3(0.4, 0.4, 0.45);
    const base = MeshBuilder.CreateCylinder("vatBase", { diameter: 1.5, height: 0.25, tessellation: 20 }, scene);
    base.position.y = 0.125;
    base.material = metal;
    base.parent = this.vatBuilt;
    const glass = MeshBuilder.CreateCylinder("vatGlass", { diameter: 1.25, height: 1.5, tessellation: 20 }, scene);
    glass.position.y = 1;
    glass.material = material(scene, "vatGlassMat", new Color3(0.5, 0.8, 0.7), new Color3(0.02, 0.06, 0.05), 0.25);
    glass.parent = this.vatBuilt;
    const cap = MeshBuilder.CreateCylinder("vatCap", { diameter: 1.4, height: 0.15, tessellation: 20 }, scene);
    cap.position.y = 1.8;
    cap.material = metal;
    cap.parent = this.vatBuilt;
    // Liquid: a unit-height cylinder scaled to the stock level.
    this.liquid = MeshBuilder.CreateCylinder("vatLiquid", { diameter: 1.1, height: 1, tessellation: 20 }, scene);
    this.liquid.material = material(scene, "vatLiquidMat", new Color3(0.1, 0.4, 0.1), new Color3(0.2, 0.75, 0.2));
    this.liquid.parent = this.vatBuilt;
    for (let i = 0; i < 6; i++) {
      const bubble = MeshBuilder.CreateSphere(`vatBubble${i}`, { diameter: 0.08 + (i % 3) * 0.025, segments: 12 }, scene);
      bubble.material = this.liquid.material;
      bubble.parent = this.vatBuilt;
      this.bubbles.push(bubble);
    }
    for (const side of [-1, 1]) {
      const pipe = MeshBuilder.CreateCylinder("vatFeedPipe", { height: 1.5, diameter: 0.1, tessellation: 16 }, scene);
      pipe.position.set(side * 0.75, 0.85, 0);
      pipe.material = metal;
      pipe.parent = this.vatBuilt;
      const coupling = MeshBuilder.CreateTorus("vatCoupling", { diameter: 0.14, thickness: 0.045, tessellation: 20 }, scene);
      coupling.position.set(side * 0.75, 1.45, 0);
      coupling.material = metal;
      coupling.parent = this.vatBuilt;
    }
    shadows?.addShadowCaster(base);

    // Drone: saucer with a glowing ring and a payload blob that grows with its load.
    this.drone = new TransformNode("drone", scene);
    const hull = MeshBuilder.CreateSphere("droneHull", { diameter: 0.8, segments: 18 }, scene);
    hull.scaling.set(1, 0.35, 1);
    hull.material = material(scene, "droneHullMat", new Color3(0.12, 0.08, 0.18), new Color3(0.05, 0.03, 0.08));
    hull.parent = this.drone;
    this.droneRing = MeshBuilder.CreateTorus("droneRing", { diameter: 0.85, thickness: 0.06, tessellation: 24 }, scene);
    this.droneRing.material = material(scene, "droneRingMat", Color3.Black(), new Color3(0.2, 1, 0.75));
    this.droneRing.parent = this.drone;
    this.payload = MeshBuilder.CreateSphere("dronePayload", { diameter: 0.45, segments: 16 }, scene);
    this.payload.position.y = -0.35;
    this.payload.material = material(scene, "dronePayloadMat", new Color3(0.3, 0.6, 0.2), new Color3(0.25, 0.6, 0.15));
    this.payload.parent = this.drone;
    shadows?.addShadowCaster(hull);

    // Reactor console: flickers red while broken, steady teal once repaired.
    const consoleBase = MeshBuilder.CreateBox("reactorBase", { width: 1.8, depth: 1.8, height: 1.1 }, scene);
    consoleBase.position.y = 0.55;
    consoleBase.material = metal;
    shadows?.addShadowCaster(consoleBase);
    this.coreMat = material(scene, "reactorCoreMat", Color3.Black(), new Color3(1, 0.2, 0.1));
    const core = MeshBuilder.CreateCylinder("reactorCore", { diameter: 0.9, height: 1.6, tessellation: 16 }, scene);
    core.position.y = 1.9;
    core.material = this.coreMat;
    this.reactorRing = MeshBuilder.CreateTorus("reactorRing", { diameter: 1.6, thickness: 0.08, tessellation: 32 }, scene);
    this.reactorRing.position.y = 1.9;
    this.reactorRing.material = this.coreMat;
    this.consoleParts = [consoleBase, core, this.reactorRing];

    // The way on (freight elevator): a platform that lights up once the floor is cleared.
    // Built at unit radius and scaled to the biome's exit when placed.
    const platform = MeshBuilder.CreateCylinder("exitPlatform", { diameter: 2, height: 0.12, tessellation: 32 }, scene);
    platform.position.y = 0.06;
    platform.material = metal;
    this.exitMat = material(scene, "exitMat", Color3.Black(), new Color3(0.15, 0.2, 0.25));
    this.exitRing = MeshBuilder.CreateTorus("exitRing", { diameter: 2, thickness: 0.07, tessellation: 40 }, scene);
    this.exitRing.position.y = 0.14;
    this.exitRing.material = this.exitMat;
    this.exitBeam = MeshBuilder.CreateCylinder("exitBeam", { diameter: 1.6, height: 4, tessellation: 24, cap: Mesh.NO_CAP }, scene);
    this.exitBeam.position.y = 2;
    this.exitBeam.material = material(scene, "exitBeamMat", Color3.Black(), new Color3(0.35, 0.9, 1), 0.18);
    this.exitBeam.isPickable = false;
    this.exitParts = [platform, this.exitRing, this.exitBeam];

    // Refinery: a squat furnace with two stacks; it glows while a batch runs, and
    // finished alloy stacks up as ingots beside it.
    this.refineryRoot = new TransformNode("refinery", scene);
    this.refinerySite = MeshBuilder.CreateDisc("refinerySite", { radius: 1.2, tessellation: 32 }, scene);
    this.refinerySite.rotation.x = Math.PI / 2;
    this.refinerySite.position.y = 0.02;
    this.refinerySite.material = material(scene, "refinerySiteMat", Color3.Black(), new Color3(0.45, 0.3, 0.1), 0.6);
    this.refinerySite.parent = this.refineryRoot;
    this.refineryBuilt = new TransformNode("refineryBuilt", scene);
    this.refineryBuilt.parent = this.refineryRoot;
    const furnace = MeshBuilder.CreateBox("refineryBody", { width: 1.6, depth: 1.6, height: 1.1 }, scene);
    furnace.position.y = 0.55;
    furnace.material = metal;
    furnace.parent = this.refineryBuilt;
    shadows?.addShadowCaster(furnace);
    this.refineryGlow = material(scene, "refineryGlow", Color3.Black(), new Color3(0.3, 0.12, 0.04));
    const mouth = MeshBuilder.CreateBox("refineryMouth", { width: 0.9, depth: 0.05, height: 0.45 }, scene);
    mouth.position.set(0, 0.5, -0.81);
    mouth.material = this.refineryGlow;
    mouth.parent = this.refineryBuilt;
    for (const [x, h] of [[-0.45, 1.3], [0.45, 1]] as const) {
      const stack = MeshBuilder.CreateCylinder("refineryStack", { diameter: 0.32, height: h, tessellation: 18 }, scene);
      stack.position.set(x, 1.1 + h / 2, 0.35);
      stack.material = metal;
      stack.parent = this.refineryBuilt;
      const rim = MeshBuilder.CreateTorus("refineryRim", { diameter: 0.34, thickness: 0.05, tessellation: 16 }, scene);
      rim.position.set(x, 1.1 + h, 0.35);
      rim.material = this.refineryGlow;
      rim.parent = this.refineryBuilt;
    }
    const ingotMat = material(scene, "ingotMat", new Color3(0.55, 0.6, 0.7), new Color3(0.2, 0.25, 0.35));
    ingotMat.specularColor = new Color3(0.9, 0.9, 1);
    for (let i = 0; i < 8; i++) {
      const ingot = MeshBuilder.CreateBox("ingot", { width: 0.42, depth: 0.2, height: 0.12 }, scene);
      ingot.position.set(1.05, 0.06 + Math.floor(i / 2) * 0.13, -0.4 + (i % 2) * 0.24);
      ingot.material = ingotMat;
      ingot.parent = this.refineryBuilt;
      this.ingots.push(ingot);
    }

    // Forward base: a smaller twin of the base pad, with a warm ring (it is heated).
    this.outpostRoot = new TransformNode("outpost", scene);
    this.outpostSite = MeshBuilder.CreateDisc("outpostSite", { radius: OUTPOST.radius, tessellation: 40 }, scene);
    this.outpostSite.rotation.x = Math.PI / 2;
    this.outpostSite.position.y = 0.02;
    this.outpostSite.material = material(scene, "outpostSiteMat", Color3.Black(), new Color3(0.1, 0.3, 0.35), 0.35);
    this.outpostSite.parent = this.outpostRoot;
    this.outpostBuilt = new TransformNode("outpostBuilt", scene);
    this.outpostBuilt.parent = this.outpostRoot;
    const pad = MeshBuilder.CreateCylinder("outpostPad", { diameter: OUTPOST.radius * 2, height: 0.08, tessellation: 40 }, scene);
    pad.position.y = 0.04;
    pad.material = material(scene, "outpostPadMat", new Color3(0.12, 0.2, 0.22), new Color3(0.05, 0.16, 0.18));
    pad.parent = this.outpostBuilt;
    this.outpostRing = MeshBuilder.CreateTorus("outpostRing", { diameter: OUTPOST.radius * 2 - 0.2, thickness: 0.08, tessellation: 48 }, scene);
    this.outpostRing.position.y = 0.1;
    this.outpostRing.material = material(scene, "outpostRingMat", Color3.Black(), new Color3(1, 0.55, 0.2));
    this.outpostRing.parent = this.outpostBuilt;
    const beacon = MeshBuilder.CreateCylinder("outpostBeacon", { diameterTop: 0.08, diameterBottom: 0.2, height: 1.6, tessellation: 16 }, scene);
    beacon.position.set(OUTPOST.radius - 0.3, 0.8, 0);
    beacon.material = metal;
    beacon.parent = this.outpostBuilt;
    const lamp = MeshBuilder.CreateSphere("outpostLamp", { diameter: 0.22, segments: 12 }, scene);
    lamp.position.set(OUTPOST.radius - 0.3, 1.65, 0);
    lamp.material = this.outpostRing.material;
    lamp.parent = this.outpostBuilt;

    // Catcher: a small hovering hunter with a magenta ring; a tether reaches its prey.
    this.catcher = new TransformNode("catcher", scene);
    const chull = MeshBuilder.CreateSphere("catcherHull", { diameter: 0.6, segments: 16 }, scene);
    chull.scaling.set(1, 0.6, 1);
    chull.material = material(scene, "catcherHullMat", new Color3(0.16, 0.06, 0.16), new Color3(0.08, 0.02, 0.08));
    chull.parent = this.catcher;
    const cring = MeshBuilder.CreateTorus("catcherRing", { diameter: 0.7, thickness: 0.05, tessellation: 20 }, scene);
    const tetherMat = material(scene, "catcherGlow", Color3.Black(), new Color3(1, 0.35, 0.85));
    cring.material = tetherMat;
    cring.parent = this.catcher;
    // Small shrouded fans and panel ribs give both helper drones a mechanical silhouette.
    for (const machine of [this.drone, this.catcher]) {
      for (const side of [-1, 1]) {
        const fan = MeshBuilder.CreateTorus(`${machine.name}FanShroud`, { diameter: 0.3, thickness: 0.045, tessellation: 24 }, scene);
        fan.position.set(side * 0.5, 0.05, 0);
        fan.material = metal;
        fan.parent = machine;
        const rotor = MeshBuilder.CreateBox(`${machine.name}FanBlade`, { width: 0.25, height: 0.025, depth: 0.05 }, scene);
        rotor.position.copyFrom(fan.position);
        rotor.material = metal;
        rotor.parent = machine;
        this.rotors.push(rotor);
      }
      const lens = MeshBuilder.CreateSphere(`${machine.name}Sensor`, { diameter: 0.12, segments: 16 }, scene);
      lens.position.set(0, 0.02, 0.3);
      lens.material = machine === this.drone ? this.droneRing.material : tetherMat;
      lens.parent = machine;
    }
    for (let i = 0; i < 5; i++) {
      const rib = MeshBuilder.CreateBox("refineryCoolingRib", { width: 0.1, height: 0.8, depth: 1.65 }, scene);
      rib.position.set(-0.6 + i * 0.3, 0.5, 0);
      rib.material = metal;
      rib.parent = this.refineryBuilt;
    }
    this.catcherPayload = MeshBuilder.CreateSphere("catcherPayload", { diameter: 0.35, segments: 12 }, scene);
    this.catcherPayload.position.y = -0.3;
    this.catcherPayload.material = this.payload.material;
    this.catcherPayload.parent = this.catcher;
    shadows?.addShadowCaster(chull);
    this.tetherPivot = new TransformNode("catcherTetherPivot", scene);
    this.tether = MeshBuilder.CreateCylinder("catcherTether", { diameter: 0.07, height: 1, tessellation: 10 }, scene);
    this.tether.rotation.x = Math.PI / 2;
    this.tether.material = tetherMat;
    this.tether.isPickable = false;
    this.tether.parent = this.tetherPivot;
  }

  /** The vat site, objective console and exit belong to the biome; a biome change reloads the page. */
  private place(w: World): void {
    const b = w.biome.def;
    this.vatRoot.position.set(b.sites.vat.x, 0, b.sites.vat.z);
    this.refineryRoot.position.set(b.sites.refinery.x, 0, b.sites.refinery.z);
    this.outpostRoot.position.set(b.sites.outpost.x, 0, b.sites.outpost.z);
    for (const m of this.consoleParts) m.position.set(b.objective.x, m.position.y, b.objective.z);
    for (const m of this.exitParts) {
      m.position.set(b.exit.x, m.position.y, b.exit.z);
      m.scaling.set(b.exit.radius, 1, b.exit.radius);
    }
    this.placed = true;
  }

  update(w: World, alpha: number, dt: number): void {
    if (!this.placed) this.place(w);
    this.time += dt;
    for (const rotor of this.rotors) rotor.rotation.y += dt * 32;
    if (w.progress.reactorRepaired) {
      this.coreMat.emissiveColor.set(0.2, 1, 0.85);
      this.reactorRing.rotation.x += dt * 1.5;
    } else {
      const flicker = 0.5 + 0.5 * Math.abs(Math.sin(this.time * 7) * Math.sin(this.time * 2.3));
      this.coreMat.emissiveColor.set(flicker, 0.12 * flicker, 0.06);
    }
    const open = isBiomeCleared(w.progress);
    this.exitBeam.setEnabled(open);
    if (open) {
      const pulse = 0.7 + 0.3 * Math.sin(this.time * 3);
      this.exitMat.emissiveColor.set(0.35 * pulse, 0.9 * pulse, 1 * pulse);
      this.exitRing.rotation.y += dt;
    } else {
      this.exitMat.emissiveColor.set(0.15, 0.2, 0.25);
    }
    const { vat, drone, refinery, outpost, catcher } = w.progress.structures;
    const quests = w.progress.quests;

    this.vatBuilt.setEnabled(vat.built);
    this.sitePad.setEnabled(!vat.built && w.progress.quests[w.biome.def.structureGate]?.done === true);
    if (vat.built) {
      const fill = Math.max(0.04, vat.stock / vatLevel(vat).storage);
      this.liquid.scaling.y = 1.4 * fill;
      this.liquid.position.y = 0.25 + (1.4 * fill) / 2;
      this.bubbles.forEach((bubble, i) => {
        const rise = (this.time * 0.28 + i / this.bubbles.length) % 1;
        bubble.position.set(Math.sin(i * 2.4) * 0.38, 0.3 + rise * 1.4 * fill, Math.cos(i * 2.4) * 0.38);
        bubble.scaling.setAll(Math.sin(rise * Math.PI) * 0.8);
      });
    }

    this.refineryBuilt.setEnabled(refinery.built);
    this.refinerySite.setEnabled(!refinery.built && quests[w.biome.def.structureGate]?.done === true && w.progress.banked.crystals > 0);
    if (refinery.built) {
      const heat = refinery.running ? 0.75 + 0.25 * Math.sin(this.time * 5) : 0.25;
      this.refineryGlow.emissiveColor.set(1 * heat, 0.45 * heat, 0.12 * heat);
      const shown = Math.min(this.ingots.length, Math.round((refinery.stock / refineryLevel(refinery).storage) * this.ingots.length));
      for (let i = 0; i < this.ingots.length; i++) this.ingots[i]!.setEnabled(i < shown);
    }

    this.outpostBuilt.setEnabled(outpost.built);
    this.outpostSite.setEnabled(!outpost.built && quests[w.biome.def.outpost.gate]?.done === true);
    if (outpost.built) this.outpostRing.rotation.y += dt * 0.6;

    this.catcher.setEnabled(catcher.built);
    const prey = catcher.built && w.catcher.mode === "hunting" ? w.catcher.target : null;
    if (catcher.built) {
      const x = w.catcherPrev.x + (catcher.x - w.catcherPrev.x) * alpha;
      const z = w.catcherPrev.z + (catcher.z - w.catcherPrev.z) * alpha;
      const y = 1.5 + Math.sin(this.time * 4 + 1) * 0.1;
      this.catcher.position.set(x, y, z);
      this.flightPose(this.catcher, catcher.x - w.catcherPrev.x, catcher.z - w.catcherPrev.z, dt);
      const load = cargoWeight(catcher.cargo) / catcherLevel(catcher).capacity;
      this.catcherPayload.setEnabled(load > 0);
      this.catcherPayload.scaling.setAll(0.5 + load);
      this.catcherPayload.rotation.z = Math.sin(this.time * 3.7) * 0.13;
      if (prey && w.catcher.progress > 0) {
        const tx = prey.prevX + (prey.x - prey.prevX) * alpha;
        const tz = prey.prevZ + (prey.z - prey.prevZ) * alpha;
        this.aim.set(tx - x, 0.6 - y, tz - z);
        const len = this.aim.length();
        this.tetherPivot.position.set(x, y, z);
        this.tetherPivot.lookAt(this.aim.addInPlace(this.tetherPivot.position));
        this.tether.position.z = len / 2;
        this.tether.scaling.y = len;
      }
    }
    this.tetherPivot.setEnabled(prey !== null && w.catcher.progress > 0);

    this.drone.setEnabled(drone.built);
    if (drone.built) {
      const x = w.dronePrev.x + (drone.x - w.dronePrev.x) * alpha;
      const z = w.dronePrev.z + (drone.z - w.dronePrev.z) * alpha;
      this.drone.position.set(x, 2 + Math.sin(this.time * 3) * 0.12, z);
      this.flightPose(this.drone, drone.x - w.dronePrev.x, drone.z - w.dronePrev.z, dt);
      this.droneRing.rotation.y += dt * 2;
      const load = cargoWeight(drone.cargo) / droneCapacity(drone);
      this.payload.setEnabled(load > 0);
      this.payload.scaling.setAll(0.5 + load);
      this.payload.rotation.z = Math.sin(this.time * 3) * 0.12;
    }
  }

  private flightPose(node: TransformNode, dx: number, dz: number, dt: number): void {
    const blend = 1 - Math.exp(-dt * 8);
    const speed = Math.hypot(dx, dz) * 30;
    if (speed > 0.05) {
      const turn = Math.atan2(dx, dz) - node.rotation.y;
      node.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * blend;
    }
    node.rotation.x += (Math.min(0.2, speed * 0.035) - node.rotation.x) * blend;
    node.rotation.z = Math.sin(this.time * 2.1) * 0.025;
  }
}
