import {
  Color3, Constants, DynamicTexture, MeshBuilder, Scene, StandardMaterial,
} from "@babylonjs/core";
import type { MapDef, Rect, ZoneDef, ZoneId } from "../content/map";

/**
 * Purely visual set dressing: nothing here collides or affects gameplay. Repeated
 * pieces use instances so the whole facility adds only a handful of draw calls.
 */

const WALL_HEIGHT = 1.8;

function emissive(scene: Scene, name: string, color: Color3, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.Black();
  m.emissiveColor = color;
  m.disableLighting = true;
  m.alpha = alpha;
  return m;
}

/** Soft radial spot used for fake light pools on the floor. */
function poolTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture("poolTex", { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.38)");
  g.addColorStop(0.45, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

const POOL_TINT: Record<ZoneId, Color3> = {
  containment: new Color3(0.35, 0.45, 0.75),
  service: new Color3(0.3, 0.7, 0.45),
  security: new Color3(0.8, 0.3, 0.3),
  reactor: new Color3(0.9, 0.5, 0.2),
};

/** Additive light pools in a loose grid over each zone. */
function lightPools(scene: Scene, map: MapDef): void {
  const tex = poolTexture(scene);
  for (const zone of map.zones) {
    const mat = emissive(scene, `pool-${zone.id}`, POOL_TINT[zone.id]);
    mat.opacityTexture = tex;
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.disableDepthWrite = true;
    const base = MeshBuilder.CreateGround(`pool-${zone.id}`, { width: 6, height: 6 }, scene);
    base.material = mat;
    base.isPickable = false;
    const r = zone.rect;
    let first = true;
    for (let z = r.minZ + 4; z <= r.maxZ - 2; z += 7) {
      for (let x = r.minX + 4; x <= r.maxX - 2; x += 7) {
        // Slight offsets so the grid doesn't read as a grid.
        const jx = ((x * 13 + z * 7) % 5) * 0.3 - 0.6;
        const m = first ? base : base.createInstance(`pool-${zone.id}-${x}-${z}`);
        first = false;
        m.position.set(x + jx, 0.012, z);
        m.freezeWorldMatrix();
      }
    }
  }
}

/** Yellow and black hazard stripes on both sides of every door. */
function doorStripes(scene: Scene, map: MapDef): void {
  const tex = new DynamicTexture("hazardTex", { width: 256, height: 64 }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#1a1408";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#d9a520";
  for (let x = -64; x < 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.lineTo(x + 16, 64);
    ctx.lineTo(x + 80, 0);
    ctx.lineTo(x + 64, 0);
    ctx.fill();
  }
  tex.update();
  const mat = new StandardMaterial("hazardMat", scene);
  mat.diffuseTexture = tex;
  mat.specularColor = new Color3(0.1, 0.1, 0.1);
  mat.emissiveColor = new Color3(0.12, 0.1, 0.04);
  for (const d of map.doors) {
    const r = d.rect;
    const cx = (r.minX + r.maxX) / 2;
    for (const z of [r.minZ - 0.45, r.maxZ + 0.45]) {
      const strip = MeshBuilder.CreateGround(`stripe-${d.id}-${z}`, { width: r.maxX - r.minX + 1.6, height: 0.7 }, scene);
      strip.position.set(cx, 0.015, z);
      strip.material = mat;
      strip.freezeWorldMatrix();
    }
  }
}

/** Zone names painted on the floor just inside each zone's entrance. */
function zoneLabels(scene: Scene, map: MapDef): void {
  for (const zone of map.zones) {
    const tex = new DynamicTexture(`label-${zone.id}`, { width: 512, height: 96 }, scene, true);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 512, 96);
    ctx.font = "700 64px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(220, 225, 255, 0.85)";
    ctx.fillText(zone.name.toUpperCase(), 256, 50);
    tex.update();
    tex.hasAlpha = true;
    const mat = new StandardMaterial(`labelMat-${zone.id}`, scene);
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = new Color3(0.25, 0.25, 0.3);
    mat.specularColor = Color3.Black();
    mat.alpha = 0.45;
    const plane = MeshBuilder.CreateGround(`label-${zone.id}`, { width: 7, height: 1.3 }, scene);
    // Containment's label sits by the base; others just past their entrance door.
    const z = zone.id === "containment" ? zone.rect.minZ + 10.5 : zone.rect.minZ + 2.4;
    plane.position.set((zone.rect.minX + zone.rect.maxX) / 2, 0.014, z);
    plane.material = mat;
    plane.freezeWorldMatrix();
  }
}

/** Pilasters with small lamps along every wall face, as two instanced meshes. */
function wallDetail(scene: Scene, map: MapDef): void {
  const b = map.bounds;
  const t = 0.6;
  const walls: Rect[] = [
    ...map.walls,
    { minX: b.minX - t, maxX: b.minX, minZ: b.minZ, maxZ: b.maxZ },
    { minX: b.maxX, maxX: b.maxX + t, minZ: b.minZ, maxZ: b.maxZ },
    { minX: b.minX - t, maxX: b.maxX + t, minZ: b.maxZ, maxZ: b.maxZ + t },
  ];
  const ribMat = new StandardMaterial("ribMat", scene);
  ribMat.diffuseColor = new Color3(0.2, 0.21, 0.27);
  ribMat.specularColor = new Color3(0.2, 0.2, 0.25);
  const rib = MeshBuilder.CreateBox("rib", { width: 0.22, depth: 0.22, height: WALL_HEIGHT + 0.06 }, scene);
  rib.material = ribMat;
  rib.isVisible = false;
  const lamp = MeshBuilder.CreateBox("lamp", { width: 0.14, depth: 0.14, height: 0.1 }, scene);
  lamp.material = emissive(scene, "lampMat", new Color3(0.75, 0.85, 1));
  lamp.isVisible = false;
  const place = (x: number, z: number) => {
    const r = rib.createInstance("ribI");
    r.position.set(x, (WALL_HEIGHT + 0.06) / 2, z);
    r.freezeWorldMatrix();
    const l = lamp.createInstance("lampI");
    l.position.set(x, WALL_HEIGHT + 0.1, z);
    l.freezeWorldMatrix();
  };
  for (const w of walls) {
    const alongZ = w.maxZ - w.minZ > w.maxX - w.minX;
    if (alongZ) {
      for (let z = w.minZ + 1.5; z < w.maxZ - 0.5; z += 4) {
        place(w.minX - 0.05, z);
        place(w.maxX + 0.05, z);
      }
    } else {
      for (let x = w.minX + 1.5; x < w.maxX - 0.5; x += 4) {
        place(x, w.minZ - 0.05);
        place(x, w.maxZ + 0.05);
      }
    }
  }
}

/** Long pipes running along the tops of the outer side walls. */
function pipes(scene: Scene, map: MapDef): void {
  const b = map.bounds;
  const mat = new StandardMaterial("pipeMat", scene);
  mat.diffuseColor = new Color3(0.32, 0.3, 0.28);
  mat.specularColor = new Color3(0.5, 0.45, 0.4);
  mat.specularPower = 64;
  const length = b.maxZ - b.minZ;
  for (const x of [b.minX - 0.15, b.maxX + 0.15]) {
    for (const [dy, d] of [[0.15, 0.22], [0.45, 0.14]] as const) {
      const pipe = MeshBuilder.CreateCylinder("pipe", { diameter: d, height: length, tessellation: 10 }, scene);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(x, WALL_HEIGHT + dy, (b.minZ + b.maxZ) / 2);
      pipe.material = mat;
      pipe.freezeWorldMatrix();
    }
  }
}

/** Machinery on top of the wide wall blocks beside each zone, themed per zone. */
function zoneMachinery(scene: Scene, map: MapDef): void {
  const glass = new StandardMaterial("tubeGlass", scene);
  glass.diffuseColor = new Color3(0.5, 0.8, 0.7);
  glass.emissiveColor = new Color3(0.03, 0.08, 0.06);
  glass.alpha = 0.3;
  const liquid = emissive(scene, "tubeLiquid", new Color3(0.15, 0.55, 0.3), 0.85);
  const metal = new StandardMaterial("machMetal", scene);
  metal.diffuseColor = new Color3(0.22, 0.23, 0.28);
  metal.specularColor = new Color3(0.3, 0.3, 0.35);
  const blink = emissive(scene, "rackLights", new Color3(0.9, 0.25, 0.2));
  const conduit = emissive(scene, "conduitGlow", new Color3(1, 0.45, 0.12));

  // Templates (hidden) to instance from.
  const tube = MeshBuilder.CreateCylinder("specTube", { diameter: 1, height: 1.6, tessellation: 14 }, scene);
  tube.material = glass;
  const fluid = MeshBuilder.CreateCylinder("specFluid", { diameter: 0.8, height: 1.1, tessellation: 12 }, scene);
  fluid.material = liquid;
  const capM = MeshBuilder.CreateCylinder("specCap", { diameter: 1.1, height: 0.18, tessellation: 14 }, scene);
  capM.material = metal;
  const rack = MeshBuilder.CreateBox("rack", { width: 1.2, depth: 1.6, height: 1.3 }, scene);
  rack.material = metal;
  const rackLight = MeshBuilder.CreateBox("rackLight", { width: 1.22, depth: 0.08, height: 0.06 }, scene);
  rackLight.material = blink;
  const pillar = MeshBuilder.CreateCylinder("conduit", { diameter: 0.45, height: 2.2, tessellation: 10 }, scene);
  pillar.material = conduit;
  for (const m of [tube, fluid, capM, rack, rackLight, pillar]) m.isVisible = false;

  const top = WALL_HEIGHT;
  const fills = map.walls.filter((w) => w.maxX - w.minX >= 2 && w.maxZ - w.minZ > 5);
  for (const w of fills) {
    const cx = (w.minX + w.maxX) / 2;
    const zone = zoneFor(map, w);
    for (let z = w.minZ + 2; z < w.maxZ - 1; z += 3.2) {
      if (zone === "containment") {
        const tI = tube.createInstance("tubeI");
        tI.position.set(cx, top + 0.8, z);
        const fI = fluid.createInstance("fluidI");
        fI.position.set(cx, top + 0.6, z);
        const cI = capM.createInstance("capI");
        cI.position.set(cx, top + 1.65, z);
      } else if (zone === "security") {
        const rI = rack.createInstance("rackI");
        rI.position.set(cx, top + 0.65, z);
        for (let k = 0; k < 3; k++) {
          const lI = rackLight.createInstance("rackLightI");
          lI.position.set(cx, top + 0.35 + k * 0.35, z - 0.8);
        }
      } else if (zone === "reactor") {
        const pI = pillar.createInstance("conduitI");
        pI.position.set(cx, top + 1.1, z);
      }
    }
  }
}

function zoneFor(map: MapDef, w: Rect): ZoneId | null {
  const cz = (w.minZ + w.maxZ) / 2;
  const zone: ZoneDef | undefined = map.zones.find((z) => cz >= z.rect.minZ && cz <= z.rect.maxZ);
  return zone?.id ?? null;
}

export interface Dressing {
  /** Animate blinking lights and liquid; cheap per-frame material tweaks only. */
  update(dt: number): void;
}

export function buildDressing(scene: Scene, map: MapDef, reducedEffects: boolean): Dressing {
  lightPools(scene, map);
  doorStripes(scene, map);
  zoneLabels(scene, map);
  wallDetail(scene, map);
  pipes(scene, map);
  zoneMachinery(scene, map);
  const rackLights = scene.getMaterialByName("rackLights") as StandardMaterial;
  const conduitGlow = scene.getMaterialByName("conduitGlow") as StandardMaterial;
  let time = 0;
  return {
    update(dt: number) {
      if (reducedEffects) return;
      time += dt;
      const blink = Math.sin(time * 5) > 0.2 ? 1 : 0.35;
      rackLights.emissiveColor.set(0.9 * blink, 0.25 * blink, 0.2 * blink);
      const pulse = 0.75 + 0.25 * Math.sin(time * 2.2);
      conduitGlow.emissiveColor.set(1 * pulse, 0.45 * pulse, 0.12 * pulse);
    },
  };
}

