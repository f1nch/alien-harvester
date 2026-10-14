import { describe, expect, it } from "vitest";
import { joystickVector } from "../src/ui/joystick";

describe("floating joystick", () => {
  it("matches keyboard strength at and beyond the rim", () => {
    for (const distance of [56, 100, 200, 600]) {
      expect(joystickVector(distance, 0)).toEqual({ x: 1, z: -0 });
      expect(joystickVector(0, -distance)).toEqual({ x: 0, z: 1 });
    }
  });
  it("preserves diagonal direction and unit strength on long drags", () => {
    const input = joystickVector(300, -400);
    expect(input).toEqual({ x: 0.6, z: 0.8 });
    expect(Math.hypot(input.x, input.z)).toBeCloseTo(1);
  });
  it("keeps a dead zone and ramps monotonically to full speed", () => {
    expect(joystickVector(0, 0)).toEqual({ x: 0, z: 0 });
    expect(joystickVector(8, 0)).toEqual({ x: 0, z: 0 });
    const strengths = [9, 20, 40, 56, 120].map((distance) => joystickVector(distance, 0).x);
    for (let i = 1; i < strengths.length; i++) expect(strengths[i]).toBeGreaterThanOrEqual(strengths[i - 1]!);
  });
});
