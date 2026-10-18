// @ts-expect-error Node APIs are available in Vitest.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { NullEngine, Scene, VertexBuffer, Vector3 } from "@babylonjs/core";
import { loadCreatureGlb, summarize } from "../src/render/creatureAssets";

const forms = ["larval", "evolved", "adult", "apex"] as const;

it.each(forms)("preserves the released %s rig and foot bindings", async form => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const originals = { larval: "creature_larval.glb", evolved: "juvenile/creature_juvenile.glb", adult: "adult/creature_adult.glb", apex: "apex/creature_apex.glb" };
    const read = (study: boolean) => new Uint8Array(readFileSync(new URL(study ? `../public/models/creature_${form}.glb` : `../art/alien/tendon-stalker/${originals[form]}`, import.meta.url)));
    const study = await loadCreatureGlb(scene, form, read(true));
    const baseline = await loadCreatureGlb(scene, form, read(false));
    if (study.kind !== "ready" || baseline.kind !== "ready") throw new Error("Asset contract failed");
    expect(study.report.problems).toEqual([]);
    const summary = summarize(study.container);
    expect(summary.bodyTriangles).toBeLessThanOrEqual(form === "larval" ? 8000 : 12000);
    expect(study.container.animationGroups.map(a => a.name).sort()).toEqual(["capture", "evolve", "gulp", "hurt", "idle", "move"]);
    const bones = study.container.skeletons[0]!.bones;
    expect(bones).toHaveLength(27);
    for (const bone of bones) {
      const original = baseline.container.skeletons[0]!.bones.find(b => b.name === bone.name)!;
      const rest = original.getRestMatrix().asArray();
      bone.getRestMatrix().asArray().forEach((value, i) => expect(value).toBeCloseTo(rest[i]!, 5));
    }
    const feet = new Set<string>();
    let wrongSide = 0, maxWeightError = 0;
    for (const mesh of study.container.meshes.filter(m => m.skeleton)) {
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
      const indices = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind)!;
      const weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind)!;
      expect(positions.every(Number.isFinite)).toBe(true);
      for (let v = 0; v < mesh.getTotalVertices(); v++) {
        let total = 0;
        for (let s = 0; s < 4; s++) {
          const weight = weights[v * 4 + s]!; total += weight;
          if (weight < .5) continue;
          const bone = bones[indices[v * 4 + s]!]!;
          const leg = /^leg\.([0-3])\.c$/.exec(bone.name);
          if (!leg) continue;
          feet.add(bone.name);
          if (positions[v * 3]! * (Number(leg[1]) < 2 ? -1 : 1) <= 0) wrongSide++;
        }
        maxWeightError = Math.max(maxWeightError, Math.abs(1 - total));
      }
    }
    expect(feet.size).toBe(4);
    expect(wrongSide).toBe(0);
    expect(maxWeightError).toBeLessThan(.0001);
  } finally { scene.dispose(); engine.dispose(); }
}, 20000);

it("increases the actual sensory surface area at every evolution", async () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    let previous = 0;
    for (const form of forms) {
      const bytes = new Uint8Array(readFileSync(new URL(`../public/models/creature_${form}.glb`, import.meta.url)));
      const source = await loadCreatureGlb(scene, form, bytes);
      if (source.kind !== "ready") throw new Error("Asset contract failed");
      let area = 0;
      for (const mesh of source.container.meshes.filter(m => m.material?.name.includes("Core"))) {
        const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
        const indices = mesh.getIndices()!;
        for (let i = 0; i < indices.length; i += 3) {
          const a = Vector3.FromArray(positions, indices[i]! * 3);
          const b = Vector3.FromArray(positions, indices[i + 1]! * 3);
          const c = Vector3.FromArray(positions, indices[i + 2]! * 3);
          area += Vector3.Cross(b.subtract(a), c.subtract(a)).length() / 2;
        }
      }
      expect(area, form).toBeGreaterThan(previous * 1.15);
      previous = area;
      source.container.dispose();
    }
  } finally { scene.dispose(); engine.dispose(); }
}, 20000);
