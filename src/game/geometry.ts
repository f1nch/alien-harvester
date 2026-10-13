import type { Rect } from "../content/map";

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/** Slab test: does segment A→B pass through the rectangle? */
export function segmentHitsRect(ax: number, az: number, bx: number, bz: number, r: Rect): boolean {
  let tMin = 0;
  let tMax = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const axes: Array<[number, number, number, number]> = [
    [ax, dx, r.minX, r.maxX],
    [az, dz, r.minZ, r.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

export function hasLineOfSight(
  ax: number, az: number, bx: number, bz: number, obstacles: readonly Rect[],
): boolean {
  for (const r of obstacles) if (segmentHitsRect(ax, az, bx, bz, r)) return false;
  return true;
}

/** Push a circle out of solid rectangles and keep it inside the room bounds. */
export function resolveCircle(
  pos: { x: number; z: number }, radius: number, bounds: Rect, obstacles: readonly Rect[],
): void {
  for (const r of obstacles) {
    const cx = Math.max(r.minX, Math.min(pos.x, r.maxX));
    const cz = Math.max(r.minZ, Math.min(pos.z, r.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // Centre is inside the rectangle: exit through the nearest face.
      const exits = [
        { d: pos.x - r.minX, x: r.minX - radius, z: pos.z },
        { d: r.maxX - pos.x, x: r.maxX + radius, z: pos.z },
        { d: pos.z - r.minZ, x: pos.x, z: r.minZ - radius },
        { d: r.maxZ - pos.z, x: pos.x, z: r.maxZ + radius },
      ].sort((a, b) => a.d - b.d);
      pos.x = exits[0]!.x;
      pos.z = exits[0]!.z;
    }
  }
  pos.x = Math.max(bounds.minX + radius, Math.min(pos.x, bounds.maxX - radius));
  pos.z = Math.max(bounds.minZ + radius, Math.min(pos.z, bounds.maxZ - radius));
}

export function pointInRect(x: number, z: number, r: Rect, pad = 0): boolean {
  return x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad;
}
