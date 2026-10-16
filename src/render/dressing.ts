import {
  Color3, Constants, DynamicTexture, MeshBuilder, Scene, StandardMaterial, Texture,
} from "@babylonjs/core";
import type { MapDef, MapLook, Rect, ZoneDef, ZoneTheme } from "../content/map";

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

const POOL_TINT: Record<ZoneTheme, Color3> = {
  containment: new Color3(0.35, 0.45, 0.75),
  service: new Color3(0.3, 0.7, 0.45),
  security: new Color3(0.8, 0.3, 0.3),
  reactor: new Color3(0.9, 0.5, 0.2),
  dock: new Color3(0.4, 0.5, 0.65),
  cold: new Color3(0.45, 0.75, 1),
  vault: new Color3(0.35, 0.6, 0.95),
  lab: new Color3(0.55, 0.45, 0.85),
  core: new Color3(0.3, 0.85, 1),
  jungle: new Color3(0.35, 0.85, 0.4),
  hive: new Color3(0.95, 0.6, 0.2),
  dunes: new Color3(1, 0.75, 0.4),
  ruins: new Color3(0.95, 0.55, 0.3),
  reef: new Color3(0.3, 0.85, 0.95),
  deep: new Color3(0.3, 0.45, 1),
};

/** Additive light pools in a loose grid over each zone. */
function lightPools(scene: Scene, map: MapDef): void {
  const tex = poolTexture(scene);
  for (const zone of map.zones) {
    const mat = emissive(scene, `pool-${zone.id}`, POOL_TINT[zone.theme]);
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
    const cz = (r.minZ + r.maxZ) / 2;
    // Stripes lie across the threshold on both faces of the wall: north and south of a
    // door in an east-west wall, east and west of a side door.
    const sideways = r.maxZ - r.minZ > r.maxX - r.minX;
    const faces = sideways ? [r.minX - 0.45, r.maxX + 0.45] : [r.minZ - 0.45, r.maxZ + 0.45];
    for (const f of faces) {
      const strip = MeshBuilder.CreateGround(`stripe-${d.id}-${f}`, sideways
        ? { width: 0.7, height: r.maxZ - r.minZ + 1.6 }
        : { width: r.maxX - r.minX + 1.6, height: 0.7 }, scene);
      if (sideways) strip.position.set(f, 0.015, cz);
      else strip.position.set(cx, 0.015, f);
      strip.material = mat;
      strip.freezeWorldMatrix();
    }
  }
}

/** Zone names painted on the floor just inside each zone's entrance. */
function zoneLabels(scene: Scene, map: MapDef): void {
  for (const zone of map.zones) {
    // The font shrinks until the name fits with a margin: long names ("Specimen intake")
    // used to run off both ends of the canvas.
    const W = 512;
    const H = 96;
    const tex = new DynamicTexture(`label-${zone.id}`, { width: W, height: H }, scene, true);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, W, H);
    const text = zone.name.toUpperCase();
    let size = 64;
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    while (size > 20 && ctx.measureText(text).width > W * 0.92) {
      size -= 4;
      ctx.font = `700 ${size}px system-ui, sans-serif`;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(220, 225, 255, 0.85)";
    ctx.fillText(text, W / 2, H / 2 + 2);
    tex.update();
    tex.hasAlpha = true;
    const mat = new StandardMaterial(`labelMat-${zone.id}`, scene);
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = new Color3(0.25, 0.25, 0.3);
    mat.specularColor = Color3.Black();
    mat.alpha = 0.45;
    const plane = MeshBuilder.CreateGround(`label-${zone.id}`, { width: 7, height: 1.3 }, scene);
    // The first zone's label sits by the base; others just past their entrance door, on
    // whichever side it opens (a side room's label sits inside its side door).
    const zr = zone.rect;
    const midX = (zr.minX + zr.maxX) / 2;
    const entry = map.doors.find((d) => d.to === zone.id)?.rect;
    if (zone === map.zones[0] || !entry) plane.position.set(midX, 0.014, zone === map.zones[0] ? zr.minZ + 10.5 : zr.minZ + 2.4);
    else {
      const dz = (entry.minZ + entry.maxZ) / 2;
      const inset = 4.2;
      if (entry.maxZ <= zr.minZ + 0.01) plane.position.set(midX, 0.014, zr.minZ + 2.4);
      else if (entry.minZ >= zr.maxZ - 0.01) plane.position.set(midX, 0.014, zr.maxZ - 2.4);
      else if (entry.maxX <= zr.minX + 0.01) plane.position.set(zr.minX + inset, 0.014, dz);
      else plane.position.set(zr.maxX - inset, 0.014, dz);
    }
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
  const cryoLiquid = emissive(scene, "cryoLiquid", new Color3(0.55, 0.9, 1), 0.8);
  const iceMat = iceMaterial(scene);
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
  const iceBlock = MeshBuilder.CreateBox("iceBlock", { width: 1.1, depth: 1.1, height: 0.9 }, scene);
  iceBlock.material = iceMat;
  const iceShard = MeshBuilder.CreateCylinder("iceShard", { diameterTop: 0, diameterBottom: 0.5, height: 1.1, tessellation: 5 }, scene);
  iceShard.material = iceMat;
  const cryoFluid = fluid.clone("cryoFluid");
  cryoFluid.material = cryoLiquid;
  for (const m of [tube, fluid, cryoFluid, capM, rack, rackLight, pillar, iceBlock, iceShard]) m.isVisible = false;

  const top = WALL_HEIGHT;
  const fills = map.walls.filter((w) => w.maxX - w.minX >= 2 && w.maxZ - w.minZ > 5);
  for (const w of fills) {
    const cx = (w.minX + w.maxX) / 2;
    const zone = zoneFor(map, w);
    for (let z = w.minZ + 2; z < w.maxZ - 1; z += 3.2) {
      if (zone === "containment" || zone === "dock") {
        const tI = tube.createInstance("tubeI");
        tI.position.set(cx, top + 0.8, z);
        const fI = fluid.createInstance("fluidI");
        fI.position.set(cx, top + 0.6, z);
        const cI = capM.createInstance("capI");
        cI.position.set(cx, top + 1.65, z);
      } else if (zone === "security" || zone === "lab") {
        const rI = rack.createInstance("rackI");
        rI.position.set(cx, top + 0.65, z);
        for (let k = 0; k < 3; k++) {
          const lI = rackLight.createInstance("rackLightI");
          lI.position.set(cx, top + 0.35 + k * 0.35, z - 0.8);
        }
      } else if (zone === "reactor" || zone === "core") {
        const pI = pillar.createInstance("conduitI");
        pI.position.set(cx, top + 1.1, z);
      } else if (zone === "vault") {
        // Cryo-pod tubes: the containment tubes, filled with pale-cyan coolant.
        const tI = tube.createInstance("cryoTubeI");
        tI.position.set(cx, top + 0.8, z);
        const fI = cryoFluid.createInstance("cryoFluidI");
        fI.position.set(cx, top + 0.6, z);
        const cI = capM.createInstance("cryoCapI");
        cI.position.set(cx, top + 1.65, z);
      } else if (zone === "cold") {
        // Ice blocks, each turned and sized a little differently.
        const k = Math.round(z * 3);
        const bI = iceBlock.createInstance("iceBlockI");
        bI.position.set(cx, top + 0.4, z);
        bI.rotation.y = (k % 7) * 0.4;
        bI.scaling.set(0.9 + (k % 3) * 0.15, 0.8 + (k % 4) * 0.2, 0.9 + (k % 5) * 0.1);
        const sI = iceShard.createInstance("iceShardI");
        sI.position.set(cx + ((k % 3) - 1) * 0.5, top + 1.2, z + 0.3);
        sI.rotation.z = ((k % 5) - 2) * 0.12;
      }
    }
  }
}

function iceMaterial(scene: Scene): StandardMaterial {
  const existing = scene.getMaterialByName("iceMat");
  if (existing) return existing as StandardMaterial;
  const m = new StandardMaterial("iceMat", scene);
  m.diffuseColor = new Color3(0.7, 0.88, 1);
  m.emissiveColor = new Color3(0.12, 0.22, 0.3);
  m.specularColor = new Color3(0.8, 0.9, 1);
  m.alpha = 0.7;
  return m;
}

/** Icicle clusters on the wall fills of every cold zone. */
function frostClusters(scene: Scene, map: MapDef): void {
  const shard = MeshBuilder.CreateCylinder("icicle", { diameterTop: 0, diameterBottom: 0.3, height: 1, tessellation: 5 }, scene);
  shard.material = iceMaterial(scene);
  shard.isVisible = false;
  for (const zone of map.zones) {
    if (!zone.cold) continue;
    const r = zone.rect;
    const b = map.bounds;
    for (const edgeX of [b.minX - 0.3, b.maxX + 0.3]) {
      if (r.minX > b.minX || r.maxX < b.maxX) continue;
      for (let z = r.minZ + 2; z < r.maxZ - 1; z += 3.1) {
        for (let k = 0; k < 3; k++) {
          const h = 0.6 + ((Math.round(z * 7) + k * 2) % 5) * 0.25;
          const s = shard.createInstance(`edgeIce-${zone.id}-${edgeX}-${z}-${k}`);
          s.scaling.set(1.6, h, 1.6);
          s.position.set(edgeX + (edgeX < 0 ? -1 : 1) * k * 0.3, h / 2, z + (k - 1) * 0.45);
          s.rotation.z = (edgeX < 0 ? 1 : -1) * (0.1 + k * 0.08);
          s.freezeWorldMatrix();
        }
      }
    }
    for (const w of map.walls) {
      const cz = (w.minZ + w.maxZ) / 2;
      if (cz < r.minZ || cz > r.maxZ || w.maxX - w.minX < 2 || w.maxZ - w.minZ <= 5) continue;
      const cx = (w.minX + w.maxX) / 2;
      for (let z = w.minZ + 3.2; z < w.maxZ - 1; z += 4.8) {
        // Three shards of different heights leaning apart, standing on the wall top.
        for (let k = 0; k < 3; k++) {
          const h = 0.5 + ((Math.round(z * 5) + k * 3) % 5) * 0.2;
          const s = shard.createInstance(`icicle-${zone.id}-${z}-${k}`);
          s.scaling.set(1, h, 1);
          s.position.set(cx + (k - 1) * 0.35, WALL_HEIGHT + h / 2, z + (k % 2) * 0.3 - 0.15);
          s.rotation.z = (k - 1) * 0.18;
          s.freezeWorldMatrix();
        }
      }
    }
  }
}

/** Glowing floor grates over each heat vent, with a warm additive glow pool. Returns the pulse animator. */
function heatVents(scene: Scene, map: MapDef): ((time: number) => void) | null {
  const vents = map.heatVents;
  if (!vents || vents.length === 0) return null;
  const grateMat = new StandardMaterial("ventGrate", scene);
  grateMat.diffuseColor = new Color3(0.25, 0.1, 0.04);
  grateMat.specularColor = Color3.Black();
  grateMat.emissiveColor = new Color3(0.9, 0.4, 0.1);
  const slatMat = new StandardMaterial("ventSlat", scene);
  slatMat.diffuseColor = new Color3(0.08, 0.06, 0.06);
  slatMat.specularColor = Color3.Black();
  const glowMat = emissive(scene, "ventGlow", new Color3(1, 0.55, 0.2));
  glowMat.opacityTexture = poolTexture(scene);
  glowMat.alphaMode = Constants.ALPHA_ADD;
  glowMat.disableDepthWrite = true;

  const grate = MeshBuilder.CreateCylinder("ventGrate", { diameter: 2, height: 0.03, tessellation: 24 }, scene);
  grate.material = grateMat;
  const slat = MeshBuilder.CreateBox("ventSlat", { width: 1, height: 0.02, depth: 0.1 }, scene);
  slat.material = slatMat;
  const glow = MeshBuilder.CreateGround("ventGlow", { width: 1, height: 1 }, scene);
  glow.material = glowMat;
  for (const m of [grate, slat, glow]) {
    m.isVisible = false;
    m.isPickable = false;
  }
  vents.forEach((v, i) => {
    const g = grate.createInstance(`ventGrate${i}`);
    g.position.set(v.x, 0.015, v.z);
    g.scaling.set(v.radius, 1, v.radius);
    g.freezeWorldMatrix();
    for (let k = -2; k <= 2; k++) {
      const o = k * v.radius * 0.36;
      const s = slat.createInstance(`ventSlat${i}-${k}`);
      s.position.set(v.x, 0.034, v.z + o);
      s.scaling.x = 2 * Math.sqrt(Math.max(0, v.radius * v.radius - o * o)) * 0.92;
      s.freezeWorldMatrix();
    }
    const p = glow.createInstance(`ventGlow${i}`);
    p.position.set(v.x, 0.02, v.z);
    p.scaling.set(v.radius * 3.6, 1, v.radius * 3.6);
    p.freezeWorldMatrix();
  });
  return (time) => {
    const pulse = 0.75 + 0.25 * Math.sin(time * 1.7);
    grateMat.emissiveColor.set(0.9 * pulse, 0.4 * pulse, 0.1 * pulse);
    glowMat.emissiveColor.set(1 * pulse, 0.55 * pulse, 0.2 * pulse);
  };
}

/** Sticky resin: glossy amber discs, a little raised, so they read as ground you'd sink in. */
function resinPools(scene: Scene, map: MapDef): void {
  const pools = map.resin;
  if (!pools || pools.length === 0) return;
  const mat = new StandardMaterial("resinMat", scene);
  const tint = map.look?.resin;
  mat.diffuseColor = tint ? new Color3(...tint) : new Color3(0.55, 0.3, 0.05);
  mat.emissiveColor = tint ? new Color3(...tint).scale(0.18) : new Color3(0.35, 0.16, 0.02);
  mat.specularColor = new Color3(0.9, 0.7, 0.4);
  mat.specularPower = 96;
  mat.alpha = 0.85;
  pools.forEach((p, i) => {
    const disc = MeshBuilder.CreateCylinder(`resin${i}`, { diameter: p.radius * 2, height: 0.05, tessellation: 28 }, scene);
    disc.position.set(p.x, 0.03, p.z);
    disc.material = mat;
    disc.isPickable = false;
    disc.freezeWorldMatrix();
  });
}

/**
 * Ocean currents: a translucent water channel per current, with chevrons scrolling the way
 * it flows so the push reads before you step in. Returns the scroller.
 */
function currentChannels(scene: Scene, map: MapDef): ((dt: number) => void) | null {
  const currents = map.currents;
  if (!currents || currents.length === 0) return null;
  // Each channel draws its own texture: DynamicTexture.clone() copies settings, not pixels,
  // so a cloned chevron texture comes out blank (and fully transparent).
  const chevrons = (name: string): DynamicTexture => {
    const tex = new DynamicTexture(name, { width: 128, height: 128 }, scene, true);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "rgba(40, 140, 190, 0.55)";
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "rgba(190, 245, 255, 0.9)";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    // One chevron per tile, apex at the canvas top: on the ground that points along the plane's
    // +z, which is turned to face the flow.
    ctx.beginPath();
    ctx.moveTo(28, 80);
    ctx.lineTo(64, 46);
    ctx.lineTo(100, 80);
    ctx.stroke();
    tex.update();
    tex.hasAlpha = true;
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    return tex;
  };
  const scrollers: Array<{ tex: Texture; speed: number }> = [];
  currents.forEach((c, i) => {
    const r = c.rect;
    const w = r.maxX - r.minX;
    const d = r.maxZ - r.minZ;
    const speed = Math.hypot(c.dx, c.dz);
    const alongX = Math.abs(c.dx) > Math.abs(c.dz);
    const length = alongX ? w : d;
    const across = alongX ? d : w;
    const t = chevrons(`currentTex${i}`);
    t.uScale = across / 1.6;
    t.vScale = length / 1.6;
    const mat = new StandardMaterial(`currentMat${i}`, scene);
    mat.diffuseTexture = t;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = new Color3(0.1, 0.35, 0.45);
    mat.specularColor = new Color3(0.5, 0.7, 0.8);
    mat.disableDepthWrite = true;
    const plane = MeshBuilder.CreateGround(`current${i}`, { width: across, height: length }, scene);
    plane.position.set((r.minX + r.maxX) / 2, 0.02, (r.minZ + r.maxZ) / 2);
    // Ground +z is texture +v: turn it so the chevrons point along the flow.
    plane.rotation.y = Math.atan2(c.dx, c.dz);
    plane.material = mat;
    plane.isPickable = false;
    plane.freezeWorldMatrix();
    scrollers.push({ tex: t, speed: speed / 1.6 });
  });
  return (dt: number) => {
    for (const s of scrollers) s.tex.vOffset = (s.tex.vOffset - s.speed * dt) % 1;
  };
}

/** Shelter from sandstorms: a cracked stone slab on four posts, with a cool floor ring under it. */
function shadeCanopies(scene: Scene, map: MapDef): void {
  const spots = map.shade;
  if (!spots || spots.length === 0) return;
  const stone = new StandardMaterial("shadeStone", scene);
  stone.diffuseColor = map.look ? new Color3(...map.look.prop).scale(0.9) : new Color3(0.4, 0.35, 0.3);
  stone.specularColor = Color3.Black();
  // See-through roofs: the angled camera looks through them at the creature sheltering below.
  const roof = stone.clone("shadeRoof");
  roof.alpha = 0.35;
  const ring = emissive(scene, "shadeRing", new Color3(0.35, 0.75, 0.9), 0.6);
  spots.forEach((p, i) => {
    const slab = MeshBuilder.CreateCylinder(`shadeSlab${i}`, { diameter: p.radius * 2.1, height: 0.18, tessellation: 7 }, scene);
    slab.position.set(p.x, 2.4, p.z);
    slab.rotation.y = i * 0.7;
    slab.material = roof;
    slab.isPickable = false;
    slab.freezeWorldMatrix();
    for (let k = 0; k < 4; k++) {
      const a = i * 0.7 + (k / 4) * Math.PI * 2 + Math.PI / 4;
      const post = MeshBuilder.CreateCylinder(`shadePost${i}-${k}`, { diameter: 0.22, height: 2.4, tessellation: 6 }, scene);
      post.position.set(p.x + Math.cos(a) * p.radius * 0.85, 1.2, p.z + Math.sin(a) * p.radius * 0.85);
      post.material = stone;
      post.isPickable = false;
      post.freezeWorldMatrix();
    }
    const r = MeshBuilder.CreateTorus(`shadeRing${i}`, { diameter: p.radius * 2, thickness: 0.06, tessellation: 40 }, scene);
    r.position.set(p.x, 0.04, p.z);
    r.material = ring;
    r.isPickable = false;
    r.freezeWorldMatrix();
  });
}

/** Glowing fungus caps and fern fronds along every wall top, instanced from two templates. */
function flora(scene: Scene, map: MapDef, look: MapLook): void {
  const capMat = emissive(scene, "floraCap", new Color3(...look.flora));
  const stalkMat = new StandardMaterial("floraStalk", scene);
  stalkMat.diffuseColor = new Color3(...look.prop).scale(1.3);
  const frondMat = new StandardMaterial("floraFrond", scene);
  frondMat.diffuseColor = new Color3(...look.wall).scale(1.8);
  frondMat.emissiveColor = new Color3(...look.glow).scale(0.12);
  const cap = MeshBuilder.CreateSphere("floraCapT", { diameter: 0.6, segments: 8, slice: 0.5 }, scene);
  cap.material = capMat;
  const stalk = MeshBuilder.CreateCylinder("floraStalkT", { diameter: 0.12, height: 0.6, tessellation: 6 }, scene);
  stalk.material = stalkMat;
  const frond = MeshBuilder.CreateCylinder("floraFrondT", { diameterTop: 0, diameterBottom: 0.35, height: 1.1, tessellation: 4 }, scene);
  frond.material = frondMat;
  for (const m of [cap, stalk, frond]) m.isVisible = false;
  const b = map.bounds;
  const walls: Rect[] = [
    ...map.walls,
    { minX: b.minX - 0.6, maxX: b.minX, minZ: b.minZ, maxZ: b.maxZ },
    { minX: b.maxX, maxX: b.maxX + 0.6, minZ: b.minZ, maxZ: b.maxZ },
  ];
  let n = 0;
  for (const w of walls) {
    const alongZ = w.maxZ - w.minZ >= w.maxX - w.minX;
    const len = alongZ ? w.maxZ - w.minZ : w.maxX - w.minX;
    for (let t = 0.8; t < len - 0.4; t += 1.9) {
      n++;
      const x = alongZ ? (w.minX + w.maxX) / 2 : w.minX + t;
      const z = alongZ ? w.minZ + t : (w.minZ + w.maxZ) / 2;
      const k = (n * 7919) % 13;
      if (k % 3 === 0) {
        const h = 0.5 + (k % 4) * 0.15;
        const sI = stalk.createInstance("floraStalkI");
        sI.scaling.y = h / 0.6;
        sI.position.set(x, WALL_HEIGHT + h / 2, z);
        sI.freezeWorldMatrix();
        const cI = cap.createInstance("floraCapI");
        cI.scaling.setAll(0.7 + (k % 5) * 0.15);
        cI.position.set(x, WALL_HEIGHT + h, z);
        cI.freezeWorldMatrix();
      } else {
        for (let f = 0; f < 3; f++) {
          const fI = frond.createInstance("floraFrondI");
          fI.position.set(x + (f - 1) * 0.2, WALL_HEIGHT + 0.45, z + ((k + f) % 3 - 1) * 0.2);
          fI.rotation.z = (f - 1) * 0.45;
          fI.rotation.x = ((k + f) % 3 - 1) * 0.3;
          fI.freezeWorldMatrix();
        }
      }
    }
  }
}

/** The theme of the zone a wall section borders (by depth along the map). */
function zoneFor(map: MapDef, w: Rect): ZoneTheme | null {
  const cz = (w.minZ + w.maxZ) / 2;
  const cx = (w.minX + w.maxX) / 2;
  // The nearest zone to the wall's centre (side rooms share a z band with the main column).
  let zone: ZoneDef | undefined;
  let best = Infinity;
  for (const z of map.zones) {
    const ddx = Math.max(z.rect.minX - cx, 0, cx - z.rect.maxX);
    const ddz = Math.max(z.rect.minZ - cz, 0, cz - z.rect.maxZ);
    const d = ddx * ddx + ddz * ddz;
    if (d < best) { best = d; zone = z; }
  }
  return zone?.theme ?? null;
}

export interface Dressing {
  /** Animate blinking lights and liquid; cheap per-frame material tweaks only. */
  update(dt: number): void;
}

export function buildDressing(scene: Scene, map: MapDef, reducedEffects: boolean): Dressing {
  lightPools(scene, map);
  zoneLabels(scene, map);
  resinPools(scene, map);
  shadeCanopies(scene, map);
  const flowCurrents = currentChannels(scene, map);
  if (map.look) {
    // Alien worlds: flora instead of facility lamps, pipes and machinery.
    flora(scene, map, map.look);
  } else {
    doorStripes(scene, map);
    wallDetail(scene, map);
    pipes(scene, map);
    zoneMachinery(scene, map);
  }
  frostClusters(scene, map);
  const pulseVents = heatVents(scene, map);
  // Facility machinery only: alien worlds have none of these lights.
  const rackLights = scene.getMaterialByName("rackLights") as StandardMaterial | null;
  const conduitGlow = scene.getMaterialByName("conduitGlow") as StandardMaterial | null;
  let time = 0;
  return {
    update(dt: number) {
      if (reducedEffects) return;
      time += dt;
      const blink = Math.sin(time * 5) > 0.2 ? 1 : 0.35;
      rackLights?.emissiveColor.set(0.9 * blink, 0.25 * blink, 0.2 * blink);
      const pulse = 0.75 + 0.25 * Math.sin(time * 2.2);
      conduitGlow?.emissiveColor.set(1 * pulse, 0.45 * pulse, 0.12 * pulse);
      pulseVents?.(time);
      flowCurrents?.(dt);
    },
  };
}

