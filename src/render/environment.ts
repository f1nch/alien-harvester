import {
  Color3, DynamicTexture, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, Texture,
} from "@babylonjs/core";
import type { Rect, RoomDef } from "../content/rooms";

function floorTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture("floorTex", { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#1b1d26";
  ctx.fillRect(0, 0, size, size);
  // Speckle so large areas aren't flat.
  for (let i = 0; i < 900; i++) {
    const v = 22 + Math.floor(Math.random() * 14);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 10})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  ctx.strokeStyle = "#0c0d13";
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, size, size);
  ctx.strokeStyle = "#2b2f3d";
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, size - 12, size - 12);
  ctx.fillStyle = "#3a3f52";
  for (const [x, y] of [[16, 16], [size - 16, 16], [16, size - 16], [size - 16, size - 16]]) {
    ctx.beginPath();
    ctx.arc(x!, y!, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 4;
  return tex;
}

function block(
  scene: Scene, name: string, r: Rect, height: number, mat: StandardMaterial, trim: StandardMaterial,
): Mesh {
  const w = r.maxX - r.minX;
  const d = r.maxZ - r.minZ;
  const m = MeshBuilder.CreateBox(name, { width: w, depth: d, height }, scene);
  m.position.set((r.minX + r.maxX) / 2, height / 2, (r.minZ + r.maxZ) / 2);
  m.material = mat;
  const strip = MeshBuilder.CreateBox(`${name}-trim`, { width: w + 0.02, depth: d + 0.02, height: 0.06 }, scene);
  strip.position.set(m.position.x, height - 0.18, m.position.z);
  strip.material = trim;
  m.freezeWorldMatrix();
  strip.freezeWorldMatrix();
  return m;
}

export interface Environment {
  baseRing: Mesh;
  basePad: Mesh;
}

export function buildEnvironment(scene: Scene, room: RoomDef, shadows: ShadowGenerator | null): Environment {
  const b = room.bounds;
  const width = b.maxX - b.minX;
  const depth = b.maxZ - b.minZ;

  const floorMat = new StandardMaterial("floorMat", scene);
  const tex = floorTexture(scene);
  tex.uScale = width / 2;
  tex.vScale = depth / 2;
  floorMat.diffuseTexture = tex;
  floorMat.specularColor = new Color3(0.15, 0.15, 0.2);
  floorMat.specularPower = 32;
  const floor = MeshBuilder.CreateGround("floor", { width, height: depth }, scene);
  floor.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  floor.material = floorMat;
  floor.receiveShadows = true;
  floor.freezeWorldMatrix();

  // Dark service floor outside the room so the camera never shows a void.
  const outerMat = new StandardMaterial("outerMat", scene);
  outerMat.diffuseColor = new Color3(0.05, 0.05, 0.08);
  outerMat.specularColor = Color3.Black();
  const outer = MeshBuilder.CreateGround("outerFloor", { width: width + 40, height: depth + 40 }, scene);
  outer.position.set(floor.position.x, -0.02, floor.position.z);
  outer.material = outerMat;
  outer.freezeWorldMatrix();

  const wallMat = new StandardMaterial("wallMat", scene);
  wallMat.diffuseColor = new Color3(0.13, 0.14, 0.19);
  wallMat.specularColor = new Color3(0.1, 0.1, 0.12);
  const trimMat = new StandardMaterial("trimMat", scene);
  trimMat.diffuseColor = Color3.Black();
  trimMat.emissiveColor = new Color3(0.35, 0.2, 0.9);
  trimMat.disableLighting = true;

  const t = 0.6;
  // The near wall is low so it never hides the creature from the angled camera.
  block(scene, "wallN", { minX: b.minX - t, maxX: b.maxX + t, minZ: b.maxZ, maxZ: b.maxZ + t }, 2.4, wallMat, trimMat);
  block(scene, "wallS", { minX: b.minX - t, maxX: b.maxX + t, minZ: b.minZ - t, maxZ: b.minZ }, 0.5, wallMat, trimMat);
  block(scene, "wallW", { minX: b.minX - t, maxX: b.minX, minZ: b.minZ, maxZ: b.maxZ }, 1.6, wallMat, trimMat);
  block(scene, "wallE", { minX: b.maxX, maxX: b.maxX + t, minZ: b.minZ, maxZ: b.maxZ }, 1.6, wallMat, trimMat);

  const podMat = new StandardMaterial("podMat", scene);
  podMat.diffuseColor = new Color3(0.2, 0.22, 0.28);
  podMat.specularColor = new Color3(0.35, 0.35, 0.4);
  podMat.specularPower = 48;
  const podTrim = new StandardMaterial("podTrim", scene);
  podTrim.diffuseColor = Color3.Black();
  podTrim.emissiveColor = new Color3(0.1, 0.75, 0.65);
  podTrim.disableLighting = true;
  room.obstacles.forEach((r, i) => {
    const m = block(scene, `obstacle${i}`, r, 1.3, podMat, podTrim);
    shadows?.addShadowCaster(m);
  });

  // Base: glowing pad with a slowly turning ring.
  const baseMat = new StandardMaterial("baseMat", scene);
  baseMat.diffuseColor = new Color3(0.02, 0.1, 0.1);
  baseMat.emissiveColor = new Color3(0.02, 0.17, 0.16);
  baseMat.alpha = 0.7;
  const basePad = MeshBuilder.CreateCylinder("basePad", { diameter: room.base.radius * 2, height: 0.04, tessellation: 48 }, scene);
  basePad.position.set(room.base.x, 0.02, room.base.z);
  basePad.material = baseMat;

  const ringMat = new StandardMaterial("ringMat", scene);
  ringMat.diffuseColor = Color3.Black();
  ringMat.emissiveColor = new Color3(0.2, 1, 0.85);
  ringMat.disableLighting = true;
  const baseRing = MeshBuilder.CreateTorus("baseRing", { diameter: room.base.radius * 2, thickness: 0.08, tessellation: 64 }, scene);
  baseRing.position.set(room.base.x, 0.06, room.base.z);
  baseRing.material = ringMat;

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pylon = MeshBuilder.CreateCylinder(`pylon${i}`, { diameterTop: 0.12, diameterBottom: 0.3, height: 1.2, tessellation: 8 }, scene);
    pylon.position.set(room.base.x + Math.cos(a) * (room.base.radius + 0.3), 0.6, room.base.z + Math.sin(a) * (room.base.radius + 0.3));
    pylon.material = wallMat;
    const cap = MeshBuilder.CreateSphere(`pylonCap${i}`, { diameter: 0.22, segments: 8 }, scene);
    cap.position.set(pylon.position.x, 1.25, pylon.position.z);
    cap.material = ringMat;
  }

  return { baseRing, basePad };
}
