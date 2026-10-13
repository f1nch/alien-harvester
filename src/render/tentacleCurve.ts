/**
 * Tentacle path math shared by the procedural and GLB creatures, so both extend,
 * bend and retract the same way. Renderer-free: plain {x, y, z} objects only.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A cubic Bézier from a to d, plus a sideways wiggle that vanishes at both ends. */
export interface CurveControls {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  d: Vec3;
  wiggle: Vec3;
  phase: number;
}

export function newCurveControls(): CurveControls {
  const v = () => ({ x: 0, y: 0, z: 0 });
  return { a: v(), b: v(), c: v(), d: v(), wiggle: v(), phase: 0 };
}

/** Writes the point at t (0 = root, 1 = tip) into out. */
export function curvePoint(k: CurveControls, t: number, out: Vec3): Vec3 {
  const u = 1 - t;
  const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
  const s = Math.sin(k.phase + t * 5) * Math.sin(Math.PI * t);
  out.x = k.a.x * w0 + k.b.x * w1 + k.c.x * w2 + k.d.x * w3 + k.wiggle.x * s;
  out.y = k.a.y * w0 + k.b.y * w1 + k.c.y * w2 + k.d.y * w3 + k.wiggle.y * s;
  out.z = k.a.z * w0 + k.b.z * w1 + k.c.z * w2 + k.d.z * w3 + k.wiggle.z * s;
  return out;
}

/** Below this, a released arm counts as fully retracted. */
const RETRACTED = 0.02;

/**
 * Advances an arm's extension (0 = retracted, 1 = touching its goal). Extends faster
 * than it retracts; a released arm snaps to exactly 0 once nearly home.
 */
export function stepExtension(ext: number, attached: boolean, dt: number): number {
  const next = ext + ((attached ? 1 : 0) - ext) * Math.min(1, dt * (attached ? 9 : 7));
  return !attached && next < RETRACTED ? 0 : next;
}

/**
 * Control points for a capture arm rooted at `root`, reaching toward `goal` by `ext`.
 * (nx, nz) is the unit horizontal direction the arm leaves in; `slot` alternates the
 * wiggle side so neighbouring arms don't move in lockstep.
 */
export function armControls(
  out: CurveControls, root: Vec3, nx: number, nz: number, goal: Vec3, ext: number, slot: number, time: number,
): CurveControls {
  const { a, b, c, d, wiggle } = out;
  a.x = root.x; a.y = root.y; a.z = root.z;
  d.x = a.x + (goal.x - a.x) * ext;
  d.y = a.y + (goal.y - a.y) * ext;
  d.z = a.z + (goal.z - a.z) * ext;
  const reach = Math.hypot(d.x - a.x, d.z - a.z);
  b.x = a.x + nx * reach * 0.3; b.y = a.y + 0.5 * ext; b.z = a.z + nz * reach * 0.3;
  c.x = d.x - nx * reach * 0.25; c.y = d.y + 0.6 * ext; c.z = d.z - nz * reach * 0.25;
  const side = slot % 2 === 0 ? 1 : -1;
  wiggle.x = -nz * 0.14 * side; wiggle.y = 0.05; wiggle.z = nx * 0.14 * side;
  out.phase = time * 8 + slot * 2;
  return out;
}
