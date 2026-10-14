import { afterEach, describe, expect, it } from "vitest";
import { InstancedMesh, NullEngine, Scene, Vector3 } from "@babylonjs/core";
import { TARGETS, type TargetTypeId } from "../src/content/targets";
import { CrowdView } from "../src/render/crowd";
import { testWorld } from "./helpers";

let engine: NullEngine;
afterEach(() => engine?.dispose());

describe("articulated crowd visuals", () => {
  it("builds every target family and keeps joint transforms finite through capture and reuse", () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const crowd = new CrowdView(scene, null);
    for (const type of Object.keys(TARGETS) as TargetTypeId[]) {
      const w = testWorld([[2, 2]], [], type);
      const target = w.targets[0]!;
      // IDs must be unique across families, as they are in a live world.
      target.id = Object.keys(TARGETS).indexOf(type) + 1;
      target.prevZ = 1.95;
      for (let frame = 0; frame < 12; frame++) crowd.update(1 / 60, w.targets, 0.5, Vector3.Zero());
      target.held = true;
      target.progress = 0.7;
      for (let frame = 0; frame < 12; frame++) crowd.update(1 / 60, w.targets, 0.5, Vector3.Zero());
      crowd.captured(target);
      crowd.update(0.5, [], 1, Vector3.Zero());
      crowd.update(1 / 60, w.targets, 1, Vector3.Zero());
      for (const mesh of scene.meshes) {
        mesh.computeWorldMatrix(true);
        expect([...mesh.getWorldMatrix().m].every(Number.isFinite), `${type}: ${mesh.name}`).toBe(true);
      }
      crowd.update(1 / 60, [], 1, Vector3.Zero());
    }
  });

  it("parents knees and elbows to upper limbs, and the guard weapon to its forearm", () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const crowd = new CrowdView(scene, null);
    const w = testWorld([[2, 2]], [], "guard");
    crowd.update(1 / 60, w.targets, 1, Vector3.Zero());
    const joints = scene.meshes.filter((mesh) => mesh instanceof InstancedMesh && mesh.parent instanceof InstancedMesh);
    expect(joints.length).toBe(5); // Four lower limbs plus the baton.
    const lowerLimbs = joints.filter((joint) => joint.parent?.parent?.name === "guardNode");
    expect(lowerLimbs.length).toBe(4);
    expect(joints.filter((joint) => joint.parent?.parent instanceof InstancedMesh).length).toBe(1);
  });

  it("turns across the yaw wrap along the short arc instead of snapping", () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const crowd = new CrowdView(scene, null);
    const w = testWorld([[2, 2]]);
    w.targets[0]!.heading = Math.PI - 0.05;
    crowd.update(1 / 60, w.targets, 1, Vector3.Zero());
    const node = scene.getTransformNodeByName("workerNode")!;
    const previous = node.rotation.y;
    w.targets[0]!.heading = -Math.PI + 0.05;
    crowd.update(1 / 60, w.targets, 1, Vector3.Zero());
    expect(node.rotation.y - previous).toBeGreaterThan(0);
    expect(node.rotation.y - previous).toBeLessThan(0.1);
  });
});
