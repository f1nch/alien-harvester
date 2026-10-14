import {
  Color3, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, TransformNode,
} from "@babylonjs/core";
import { isBiomeCleared } from "../domain/biome";
import { cargoWeight } from "../domain/progress";
import { droneCapacity, vatLevel } from "../domain/structures";
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
    shadows?.addShadowCaster(base);

    // Drone: saucer with a glowing ring and a payload blob that grows with its load.
    this.drone = new TransformNode("drone", scene);
    const hull = MeshBuilder.CreateSphere("droneHull", { diameter: 0.8, segments: 12 }, scene);
    hull.scaling.set(1, 0.35, 1);
    hull.material = material(scene, "droneHullMat", new Color3(0.12, 0.08, 0.18), new Color3(0.05, 0.03, 0.08));
    hull.parent = this.drone;
    this.droneRing = MeshBuilder.CreateTorus("droneRing", { diameter: 0.85, thickness: 0.06, tessellation: 24 }, scene);
    this.droneRing.material = material(scene, "droneRingMat", Color3.Black(), new Color3(0.2, 1, 0.75));
    this.droneRing.parent = this.drone;
    this.payload = MeshBuilder.CreateSphere("dronePayload", { diameter: 0.45, segments: 10 }, scene);
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
  }

  /** The vat site, objective console and exit belong to the biome; a biome change reloads the page. */
  private place(w: World): void {
    const b = w.biome.def;
    this.vatRoot.position.set(b.sites.vat.x, 0, b.sites.vat.z);
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
    const { vat, drone } = w.progress.structures;

    this.vatBuilt.setEnabled(vat.built);
    this.sitePad.setEnabled(!vat.built && w.progress.quests[w.biome.def.structureGate]?.done === true);
    if (vat.built) {
      const fill = Math.max(0.04, vat.stock / vatLevel(vat).storage);
      this.liquid.scaling.y = 1.4 * fill;
      this.liquid.position.y = 0.25 + (1.4 * fill) / 2;
    }

    this.drone.setEnabled(drone.built);
    if (drone.built) {
      const x = w.dronePrev.x + (drone.x - w.dronePrev.x) * alpha;
      const z = w.dronePrev.z + (drone.z - w.dronePrev.z) * alpha;
      this.drone.position.set(x, 2 + Math.sin(this.time * 3) * 0.12, z);
      this.droneRing.rotation.y += dt * 2;
      const load = cargoWeight(drone.cargo) / droneCapacity(drone);
      this.payload.setEnabled(load > 0);
      this.payload.scaling.setAll(0.5 + load);
    }
  }
}
