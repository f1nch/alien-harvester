import { describe, expect, it } from "vitest";
import { armControls, curvePoint, newCurveControls, stepExtension } from "../src/render/tentacleCurve";

const root = { x: 1, y: 0.8, z: 2 };
const goal = { x: 4, y: 0.9, z: 6 };
const dir = (() => {
  const dx = goal.x - root.x, dz = goal.z - root.z;
  const len = Math.hypot(dx, dz);
  return { nx: dx / len, nz: dz / len };
})();

function expectNear(p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) {
  expect(p.x).toBeCloseTo(q.x, 9);
  expect(p.y).toBeCloseTo(q.y, 9);
  expect(p.z).toBeCloseTo(q.z, 9);
}

describe("tentacle curve", () => {
  it("starts at the root and, fully extended, ends exactly on the goal whatever the wiggle", () => {
    for (const time of [0, 0.37, 5.2]) {
      for (const slot of [0, 1, 7]) {
        const k = armControls(newCurveControls(), root, dir.nx, dir.nz, goal, 1, slot, time);
        expectNear(curvePoint(k, 0, { x: 0, y: 0, z: 0 }), root);
        expectNear(curvePoint(k, 1, { x: 0, y: 0, z: 0 }), goal);
      }
    }
  });

  it("collapses onto the root when not extended", () => {
    const k = armControls(newCurveControls(), root, dir.nx, dir.nz, goal, 0, 3, 1.5);
    for (const t of [0, 0.5, 1]) {
      const p = curvePoint(k, t, { x: 0, y: 0, z: 0 });
      // Only the wiggle (at most 0.14 sideways, 0.05 up) separates it from the root.
      expect(Math.hypot(p.x - root.x, p.z - root.z)).toBeLessThanOrEqual(0.14 + 1e-9);
      expect(Math.abs(p.y - root.y)).toBeLessThanOrEqual(0.05 + 1e-9);
    }
  });

  it("partly extended, the tip sits that fraction of the way to the goal", () => {
    const k = armControls(newCurveControls(), root, dir.nx, dir.nz, goal, 0.25, 0, 0);
    expectNear(curvePoint(k, 1, { x: 0, y: 0, z: 0 }), {
      x: root.x + (goal.x - root.x) * 0.25, y: root.y + (goal.y - root.y) * 0.25, z: root.z + (goal.z - root.z) * 0.25,
    });
  });

  it("arcs above the straight line mid-reach, as the capture arc should", () => {
    const k = armControls(newCurveControls(), root, dir.nx, dir.nz, goal, 1, 0, 0);
    const mid = curvePoint(k, 0.5, { x: 0, y: 0, z: 0 });
    expect(mid.y).toBeGreaterThan((root.y + goal.y) / 2 + 0.2);
  });

  it("neighbouring slots wiggle to opposite sides", () => {
    const a = armControls(newCurveControls(), root, dir.nx, dir.nz, goal, 1, 0, 0);
    const b = armControls(newCurveControls(), root, dir.nx, dir.nz, goal, 1, 1, 0);
    expect(a.wiggle.x).toBeCloseTo(-b.wiggle.x, 12);
    expect(a.wiggle.z).toBeCloseTo(-b.wiggle.z, 12);
  });
});

describe("matches the procedural creature's original arm math", () => {
  // The formulas as they were inlined in render/creature.ts before the extraction.
  function original(rx: number, ry: number, rz: number, nx: number, nz: number, g: { x: number; y: number; z: number }, ext: number, i: number, time: number, t: number) {
    const a = { x: rx, y: ry, z: rz };
    const d = { x: a.x + (g.x - a.x) * ext, y: a.y + (g.y - a.y) * ext, z: a.z + (g.z - a.z) * ext };
    const reach = Math.hypot(d.x - a.x, d.z - a.z);
    const b = { x: a.x + nx * reach * 0.3, y: a.y + 0.5 * ext, z: a.z + nz * reach * 0.3 };
    const c = { x: d.x - nx * reach * 0.25, y: d.y + 0.6 * ext, z: d.z - nz * reach * 0.25 };
    const side = i % 2 === 0 ? 1 : -1;
    const w = { x: -nz * 0.14 * side, y: 0.05, z: nx * 0.14 * side };
    const phase = time * 8 + i * 2;
    const u = 1 - t;
    const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
    const s = Math.sin(phase + t * 5) * Math.sin(Math.PI * t);
    return {
      x: a.x * w0 + b.x * w1 + c.x * w2 + d.x * w3 + w.x * s,
      y: a.y * w0 + b.y * w1 + c.y * w2 + d.y * w3 + w.y * s,
      z: a.z * w0 + b.z * w1 + c.z * w2 + d.z * w3 + w.z * s,
    };
  }

  it("for a spread of inputs", () => {
    // Deterministic pseudo-random inputs.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 10 - 5;
    for (let n = 0; n < 50; n++) {
      const r = { x: rnd(), y: rnd(), z: rnd() };
      const g = { x: rnd(), y: rnd(), z: rnd() };
      const ang = rnd();
      const nx = Math.sin(ang), nz = Math.cos(ang);
      const ext = Math.abs(rnd()) / 5, slot = n % 8, time = Math.abs(rnd());
      const k = armControls(newCurveControls(), r, nx, nz, g, ext, slot, time);
      for (const t of [0, 0.13, 0.5, 0.77, 1]) {
        expectNear(curvePoint(k, t, { x: 0, y: 0, z: 0 }), original(r.x, r.y, r.z, nx, nz, g, ext, slot, time, t));
      }
    }
  });
});

describe("tentacle extension", () => {
  it("extends toward 1 while attached and never overshoots", () => {
    let ext = 0;
    for (let i = 0; i < 60; i++) {
      ext = stepExtension(ext, true, 1 / 60);
      expect(ext).toBeLessThanOrEqual(1);
    }
    expect(ext).toBeGreaterThan(0.99);
  });

  it("retracts to exactly 0 once released, and stays there", () => {
    let ext = 1;
    let frames = 0;
    while (ext > 0 && frames < 600) {
      ext = stepExtension(ext, false, 1 / 60);
      frames++;
    }
    expect(ext).toBe(0);
    expect(frames).toBeLessThan(60);
    expect(stepExtension(0, false, 1 / 60)).toBe(0);
  });

  it("a huge frame time settles instead of overshooting", () => {
    expect(stepExtension(0, true, 5)).toBe(1);
    expect(stepExtension(1, false, 5)).toBe(0);
  });
});
