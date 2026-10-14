// @ts-expect-error Vitest runs in Node; the browser project's types omit Node APIs.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FreeCamera, NullEngine, Scene, Vector3 } from "@babylonjs/core";
import { loadCreatureGlb, summarize } from "../src/render/creatureAssets";
import { GltfCreature } from "../src/render/gltfCreature";
import { ProceduralCreature } from "../src/render/proceduralCreature";

describe("authored Stalker hatchling", () => {
  it("loads the shipped GLB with usable skin, sockets and six clips; switches to fallback and back", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const bytes = new Uint8Array(readFileSync(new URL("../public/models/creature_larval.glb", import.meta.url)));
    try {
      const source = await loadCreatureGlb(scene, "larval", bytes);
      expect(source.kind).toBe("ready");
      if (source.kind !== "ready") throw new Error(JSON.stringify(source));
      expect(source.report.problems).toEqual([]);
      expect(source.report.animations).toEqual({ capture: true, gulp: true, hurt: true, evolve: true });
      const summary = summarize(source.container);
      expect(summary.bodyTriangles).toBeLessThanOrEqual(5000);
      expect(summary.skeletons[0]!.length).toBeLessThanOrEqual(40);
      expect(summary.nodes.filter((name) => name.startsWith("socket.tentacle."))).toHaveLength(8);
      const gaitSpeed = source.container.transformNodes.find((node) => node.name === "Creature")!.metadata.gltf.extras.gaitSpeedMps;
      expect(gaitSpeed).toBeGreaterThan(0.3);
      const fallback = new ProceduralCreature(scene, null);
      const creature = new GltfCreature(scene, fallback, null);
      creature.addForm("larval", source);
      creature.update(1 / 30, 4, 6, 1, 0, [new Vector3(5, 0.9, 6)]);
      expect(fallback.root.isEnabled()).toBe(false);
      expect(creature.root.position.asArray()).toEqual([4, 0, 6]);
      expect(scene.animationGroups.find((group) => group.name === "move")!.speedRatio).toBeCloseTo(1 / gaitSpeed);
      const sockets = scene.transformNodes.filter((node) => node.name.startsWith("socket.tentacle."));
      for (const socket of sockets) {
        const p = socket.getAbsolutePosition();
        expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
        expect(p.y).toBeGreaterThan(0.3);
        expect(p.y).toBeLessThan(1.5);
        expect(Math.hypot(p.x - 4, p.z - 6)).toBeLessThan(1.5);
      }
      creature.gulp(); creature.hurt();
      creature.setForm(1, true);
      expect(fallback.root.isEnabled()).toBe(true);
      creature.setForm(0, false);
      expect(fallback.root.isEnabled()).toBe(false);
      creature.dispose(); source.container.dispose();
    } finally { scene.dispose(); engine.dispose(); }
  }, 20000);
});

describe("authored Stalker evolution models", () => {
  it.each(["juvenile", "adult"])("loads and animates the %s with valid skin and sockets", async (stage) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const bytes = new Uint8Array(readFileSync(new URL(`../art/alien/tendon-stalker/${stage}/creature_${stage}.glb`, import.meta.url)));
    try {
      const source = await loadCreatureGlb(scene, "evolved", bytes);
      expect(source.kind).toBe("ready");
      if (source.kind !== "ready") throw new Error(JSON.stringify(source));
      expect(source.report.problems).toEqual([]);
      expect(source.report.animations).toEqual({ capture: true, gulp: true, hurt: true, evolve: true });
      const summary = summarize(source.container);
      expect(summary.bodyTriangles).toBeLessThanOrEqual(8000);
      expect(summary.skeletons[0]!).toHaveLength(27);
      expect(summary.nodes.filter((name) => name.startsWith("socket.tentacle."))).toHaveLength(8);
      const gaitSpeed = source.container.transformNodes.find((node) => node.name === "Creature")!.metadata.gltf.extras.gaitSpeedMps;
      const fallback = new ProceduralCreature(scene, null);
      const creature = new GltfCreature(scene, fallback, null);
      creature.addForm("evolved", source);
      creature.setForm(1, true);
      creature.update(1 / 30, 4, 6, 1, 0, [new Vector3(5, 0.9, 6)]);
      expect(scene.animationGroups.find((group) => group.name === "move")!.speedRatio).toBeCloseTo(1 / gaitSpeed);
      scene.activeCamera = new FreeCamera("test-camera", new Vector3(4, 3, 2), scene);
      scene.render();
      expect(fallback.root.isEnabled()).toBe(false);
      for (const mesh of scene.meshes.filter((mesh) => mesh.skeleton && mesh.isEnabled())) {
        const bounds = mesh.getBoundingInfo().boundingBox;
        expect(bounds.minimumWorld.asArray().every(Number.isFinite)).toBe(true);
        expect(bounds.maximumWorld.y).toBeGreaterThan(0.5);
        expect(bounds.maximumWorld.y).toBeLessThan(3);
      }
      creature.gulp(); creature.hurt();
      creature.setForm(0, false);
      expect(fallback.root.isEnabled()).toBe(true);
      creature.dispose(); source.container.dispose();
    } finally { scene.dispose(); engine.dispose(); }
  }, 20000);
});

describe("baked Stalker foot planting", () => {
  it.each(["hatchling", "juvenile", "adult"])("keeps %s stance feet stationary under forward travel", (stage) => {
    const folder = stage === "hatchling" ? "" : `${stage}/`;
    const base = `../art/alien/tendon-stalker/${folder}`;
    const report = JSON.parse(readFileSync(new URL(`${base}rig-report.json`, import.meta.url), "utf8"));
    const samples: { leg: number; phase: number; actual: number[]; error: number; stance: boolean }[] =
      JSON.parse(readFileSync(new URL(`${base}gait-samples.json`, import.meta.url), "utf8"));
    expect(report.unweighted_vertices).toBe(0);
    expect(report.max_foot_target_error_m).toBeLessThan(0.00001);
    for (let leg = 0; leg < 4; leg++) {
      const planted = samples.filter((sample) => sample.leg === leg && sample.stance);
      expect(planted.length).toBeGreaterThan(8);
      const worldY = planted.map((sample) => sample.actual[1]! - report.gait_speed_mps * report.gait_duration_s * sample.phase);
      const height = planted.map((sample) => sample.actual[2]!);
      expect(Math.max(...worldY) - Math.min(...worldY)).toBeLessThan(0.00001);
      expect(Math.max(...height) - Math.min(...height)).toBeLessThan(0.00001);
      expect(Math.max(...samples.filter((sample) => sample.leg === leg).map((sample) => sample.actual[2]!)))
        .toBeGreaterThan(height[0]! + 0.05);
    }
  });
});
