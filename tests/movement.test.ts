import { describe, expect, it } from "vitest";
import { updatePlayer } from "../src/game/systems/movement";
import { PLAYER_RADIUS } from "../src/game/world";
import { testWorld } from "./helpers";

describe("movement velocity for animation", () => {
  it("matches full-speed input in open space", () => {
    const w = testWorld([]);
    w.input.x = 1;
    updatePlayer(w, 1 / 30);
    expect(w.player.vx).toBeCloseTo(w.stats.moveSpeed);
    expect(w.player.vz).toBe(0);
  });
  it("stops walking into a boundary and preserves travel along it", () => {
    const w = testWorld([]);
    w.player.x = w.map.bounds.maxX - PLAYER_RADIUS;
    w.input.x = 1;
    updatePlayer(w, 1 / 30);
    expect(w.player.vx).toBeCloseTo(0);
    w.input.z = 1;
    updatePlayer(w, 1 / 30);
    expect(w.player.vx).toBeCloseTo(0);
    expect(w.player.vz).toBeCloseTo(w.stats.moveSpeed / Math.SQRT2);
  });
});
