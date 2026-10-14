import {
  Color3, DynamicTexture, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, Texture,
} from "@babylonjs/core";
import type { MapDef, MapLook, Rect } from "../content/map";

/** Mossy ground for alien worlds: soft blotches, no panel seams. */
function wildFloorTexture(scene: Scene, name: string, look: MapLook): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = look.floor;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = look.speckle;
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.15 + Math.random() * 0.25;
    ctx.beginPath();
    ctx.ellipse(Math.random() * size, Math.random() * size, 4 + Math.random() * 14, 3 + Math.random() * 10, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 500; i++) ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 4;
  return tex;
}

function floorTexture(scene: Scene, name: string, look?: MapLook): DynamicTexture {
  if (look) return wildFloorTexture(scene, name, look);
  const size = 256;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
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
  scene: Scene, name: string, r: Rect, height: number, mat: StandardMaterial, trim: StandardMaterial | null,
): Mesh {
  const w = r.maxX - r.minX;
  const d = r.maxZ - r.minZ;
  const m = MeshBuilder.CreateBox(name, { width: w, depth: d, height }, scene);
  m.position.set((r.minX + r.maxX) / 2, height / 2, (r.minZ + r.maxZ) / 2);
  m.material = mat;
  m.freezeWorldMatrix();
  if (trim) {
    const strip = MeshBuilder.CreateBox(`${name}-trim`, { width: w + 0.02, depth: d + 0.02, height: 0.06 }, scene);
    strip.position.set(m.position.x, height - 0.18, m.position.z);
    strip.material = trim;
    strip.freezeWorldMatrix();
  }
  return m;
}

function emissive(scene: Scene, name: string, color: Color3): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.Black();
  m.emissiveColor = color;
  m.disableLighting = true;
  return m;
}

export interface DoorView {
  id: string;
  /** Sliding panel; sinks into the floor when the door opens. */
  panel: Mesh;
  open: number;
}

export interface Environment {
  baseRing: Mesh;
  basePad: Mesh;
  doors: DoorView[];
}

const WALL_HEIGHT = 1.8;
const DOOR_HEIGHT = 2;

export function buildEnvironment(scene: Scene, map: MapDef, shadows: ShadowGenerator | null): Environment {
  const b = map.bounds;
  const look = map.look;

  // Dark service floor outside the facility so the camera never shows a void.
  const outerMat = new StandardMaterial("outerMat", scene);
  outerMat.diffuseColor = look ? new Color3(...look.wall).scale(0.45) : new Color3(0.05, 0.05, 0.08);
  outerMat.specularColor = Color3.Black();
  const outer = MeshBuilder.CreateGround("outerFloor", { width: b.maxX - b.minX + 40, height: b.maxZ - b.minZ + 40 }, scene);
  outer.position.set((b.minX + b.maxX) / 2, -0.02, (b.minZ + b.maxZ) / 2);
  outer.material = outerMat;
  outer.freezeWorldMatrix();

  // One tinted floor per zone so each reads as its own place.
  for (const zone of map.zones) {
    const r = zone.rect;
    const width = r.maxX - r.minX;
    const depth = r.maxZ - r.minZ;
    const mat = new StandardMaterial(`floor-${zone.id}`, scene);
    const tex = floorTexture(scene, `floorTex-${zone.id}`, look);
    tex.uScale = width / 2;
    tex.vScale = depth / 2;
    mat.diffuseTexture = tex;
    mat.diffuseColor = new Color3(...zone.tint);
    mat.specularColor = look ? new Color3(0.04, 0.05, 0.04) : new Color3(0.15, 0.15, 0.2);
    mat.specularPower = 32;
    const floor = MeshBuilder.CreateGround(`floor-${zone.id}`, { width, height: depth }, scene);
    floor.position.set((r.minX + r.maxX) / 2, 0, (r.minZ + r.maxZ) / 2);
    floor.material = mat;
    floor.receiveShadows = true;
    floor.freezeWorldMatrix();
  }
  // Floor under door gaps so open doorways aren't holes.
  const thresholdMat = new StandardMaterial("thresholdMat", scene);
  thresholdMat.diffuseColor = look ? new Color3(...look.wall).scale(0.8) : new Color3(0.16, 0.16, 0.2);
  for (const d of map.doors) {
    const r = d.rect;
    const g = MeshBuilder.CreateGround(`threshold-${d.id}`, { width: r.maxX - r.minX, height: r.maxZ - r.minZ }, scene);
    g.position.set((r.minX + r.maxX) / 2, 0.001, (r.minZ + r.maxZ) / 2);
    g.material = thresholdMat;
    g.freezeWorldMatrix();
  }

  const wallMat = new StandardMaterial("wallMat", scene);
  wallMat.diffuseColor = look ? new Color3(...look.wall) : new Color3(0.13, 0.14, 0.19);
  wallMat.specularColor = look ? new Color3(0.03, 0.03, 0.03) : new Color3(0.1, 0.1, 0.12);
  const trimMat = emissive(scene, "trimMat", look ? new Color3(...look.glow) : new Color3(0.35, 0.2, 0.9));

  // Perimeter; the south edge is low so it never hides the creature from the angled camera.
  const t = 0.6;
  block(scene, "perimN", { minX: b.minX - t, maxX: b.maxX + t, minZ: b.maxZ, maxZ: b.maxZ + t }, 2.4, wallMat, trimMat);
  block(scene, "perimS", { minX: b.minX - t, maxX: b.maxX + t, minZ: b.minZ - t, maxZ: b.minZ }, 0.5, wallMat, trimMat);
  block(scene, "perimW", { minX: b.minX - t, maxX: b.minX, minZ: b.minZ, maxZ: b.maxZ }, WALL_HEIGHT, wallMat, trimMat);
  block(scene, "perimE", { minX: b.maxX, maxX: b.maxX + t, minZ: b.minZ, maxZ: b.maxZ }, WALL_HEIGHT, wallMat, trimMat);
  map.walls.forEach((r, i) => block(scene, `wall${i}`, r, WALL_HEIGHT, wallMat, trimMat));

  const podMat = new StandardMaterial("podMat", scene);
  podMat.diffuseColor = new Color3(0.2, 0.22, 0.28);
  podMat.specularColor = new Color3(0.35, 0.35, 0.4);
  podMat.specularPower = 48;
  const podTrim = emissive(scene, "podTrim", new Color3(0.1, 0.75, 0.65));
  if (look) {
    // Alien worlds: props are gnarled trunks (round, as wide as the prop) under glowing caps.
    podMat.diffuseColor = new Color3(...look.prop);
    podMat.specularColor = new Color3(0.05, 0.05, 0.05);
    const capMat = emissive(scene, "trunkCap", new Color3(...look.glow).scale(0.7));
    map.props.forEach((r, i) => {
      const w = r.maxX - r.minX;
      const d = r.maxZ - r.minZ;
      const trunk = MeshBuilder.CreateCylinder(`trunk${i}`, { diameterTop: Math.min(w, d) * 0.7, diameterBottom: Math.min(w, d), height: 2.2, tessellation: 9 }, scene);
      trunk.scaling.set(w / Math.min(w, d), 1, d / Math.min(w, d));
      trunk.position.set((r.minX + r.maxX) / 2, 1.1, (r.minZ + r.maxZ) / 2);
      trunk.material = podMat;
      trunk.freezeWorldMatrix();
      shadows?.addShadowCaster(trunk);
      const cap = MeshBuilder.CreateSphere(`trunkCap${i}`, { diameter: Math.max(w, d) * 1.1, segments: 8, slice: 0.5 }, scene);
      cap.scaling.y = 0.45;
      cap.position.set(trunk.position.x, 2.15, trunk.position.z);
      cap.material = capMat;
      cap.freezeWorldMatrix();
    });
  } else {
    map.props.forEach((r, i) => {
      const m = block(scene, `prop${i}`, r, 1.3, podMat, podTrim);
      shadows?.addShadowCaster(m);
    });
  }

  // Doors: hazard-striped panels between glowing posts.
  const doorTex = new DynamicTexture("doorTex", { width: 128, height: 64 }, scene, true);
  const ctx = doorTex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#2a1414";
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = "#c8401e";
  for (let x = -64; x < 128; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.lineTo(x + 12, 64);
    ctx.lineTo(x + 44, 0);
    ctx.lineTo(x + 32, 0);
    ctx.fill();
  }
  doorTex.update();
  const doorMat = new StandardMaterial("doorMat", scene);
  if (look) {
    // An organic membrane: translucent, veined with the door colour.
    doorMat.diffuseColor = new Color3(...look.door).scale(0.5);
    doorMat.emissiveColor = new Color3(...look.door).scale(0.45);
    doorMat.alpha = 0.8;
  } else {
    doorMat.diffuseTexture = doorTex;
    doorMat.emissiveColor = new Color3(0.25, 0.08, 0.05);
  }
  doorMat.specularColor = new Color3(0.2, 0.2, 0.2);
  const postMat = emissive(scene, "doorPost", look ? new Color3(...look.door) : new Color3(1, 0.45, 0.15));

  const doors: DoorView[] = map.doors.map((d) => {
    const r = d.rect;
    const cx = (r.minX + r.maxX) / 2;
    const cz = (r.minZ + r.maxZ) / 2;
    const panel = MeshBuilder.CreateBox(`door-${d.id}`, { width: r.maxX - r.minX, depth: (r.maxZ - r.minZ) * 0.5, height: DOOR_HEIGHT }, scene);
    panel.position.set(cx, DOOR_HEIGHT / 2, cz);
    panel.material = doorMat;
    for (const side of [r.minX, r.maxX]) {
      const post = MeshBuilder.CreateBox(`doorPost-${d.id}`, { width: 0.16, depth: r.maxZ - r.minZ + 0.1, height: DOOR_HEIGHT + 0.2 }, scene);
      post.position.set(side, (DOOR_HEIGHT + 0.2) / 2, cz);
      post.material = postMat;
      post.freezeWorldMatrix();
    }
    return { id: d.id, panel, open: 0 };
  });

  // Base: glowing pad with a slowly turning ring.
  const baseMat = new StandardMaterial("baseMat", scene);
  baseMat.diffuseColor = new Color3(0.02, 0.1, 0.1);
  baseMat.emissiveColor = new Color3(0.02, 0.17, 0.16);
  baseMat.alpha = 0.7;
  const basePad = MeshBuilder.CreateCylinder("basePad", { diameter: map.base.radius * 2, height: 0.04, tessellation: 48 }, scene);
  basePad.position.set(map.base.x, 0.02, map.base.z);
  basePad.material = baseMat;

  const ringMat = emissive(scene, "ringMat", new Color3(0.2, 1, 0.85));
  const baseRing = MeshBuilder.CreateTorus("baseRing", { diameter: map.base.radius * 2, thickness: 0.08, tessellation: 64 }, scene);
  baseRing.position.set(map.base.x, 0.06, map.base.z);
  baseRing.material = ringMat;

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pylon = MeshBuilder.CreateCylinder(`pylon${i}`, { diameterTop: 0.12, diameterBottom: 0.3, height: 1.2, tessellation: 8 }, scene);
    pylon.position.set(map.base.x + Math.cos(a) * (map.base.radius + 0.3), 0.6, map.base.z + Math.sin(a) * (map.base.radius + 0.3));
    pylon.material = wallMat;
    const cap = MeshBuilder.CreateSphere(`pylonCap${i}`, { diameter: 0.22, segments: 8 }, scene);
    cap.position.set(pylon.position.x, 1.25, pylon.position.z);
    cap.material = ringMat;
  }

  return { baseRing, basePad, doors };
}

/** Animate door panels toward their open/closed state. */
export function updateDoors(env: Environment, unlocked: readonly string[], dt: number, snap = false): void {
  for (const d of env.doors) {
    const target = unlocked.includes(d.id) ? 1 : 0;
    d.open = snap ? target : d.open + (target - d.open) * Math.min(1, dt * 3);
    d.panel.position.y = DOOR_HEIGHT / 2 - d.open * (DOOR_HEIGHT + 0.05);
    d.panel.setEnabled(d.open < 0.999);
  }
}
