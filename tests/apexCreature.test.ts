// @ts-expect-error Vitest runs in Node; the browser project's types omit Node APIs.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NullEngine, Scene, StandardMaterial, VertexBuffer, type AnimationGroup } from "@babylonjs/core";
import { loadCreatureGlb, type LoadedCreatureSource } from "../src/render/creatureAssets";
import { CREATURE_FORMS, creatureModelPath, formForTier, isGlb, type CreatureForm } from "../src/render/creatureContract";
import { GltfCreature } from "../src/render/gltfCreature";
import { ProceduralCreature } from "../src/render/proceduralCreature";

/** The apex's Blender export; public/models holds the copy the game fetches. */
const APEX_SOURCE = new URL("../art/alien/tendon-stalker/feature-lineage/apex/creature_apex.glb", import.meta.url);
const FILES: Record<CreatureForm, URL> = {
  larval: new URL(`../public/${creatureModelPath("larval")}`, import.meta.url),
  evolved: new URL(`../public/${creatureModelPath("evolved")}`, import.meta.url),
  adult: new URL(`../public/${creatureModelPath("adult")}`, import.meta.url),
  apex: APEX_SOURCE,
};

type Ready = Extract<LoadedCreatureSource, { kind: "ready" }>;

async function load(scene: Scene, form: CreatureForm): Promise<Ready> {
  const source = await loadCreatureGlb(scene, form, new Uint8Array(readFileSync(FILES[form])));
  if (source.kind !== "ready") throw new Error(`${form}: ${JSON.stringify(source)}`);
  return source;
}

/** Adds forms one at a time, recording the animation groups each one instantiates. */
async function build(scene: Scene, forms: readonly CreatureForm[]) {
  const fallback = new ProceduralCreature(scene, null);
  const creature = new GltfCreature(scene, fallback, null);
  const sources: Ready[] = [];
  const clips = new Map<CreatureForm, AnimationGroup[]>();
  for (const form of forms) {
    const source = await load(scene, form);
    sources.push(source);
    const before = new Set(scene.animationGroups);
    creature.addForm(form, source);
    clips.set(form, scene.animationGroups.filter((g) => !before.has(g)));
  }
  const view = (form: CreatureForm) => scene.getTransformNodeByName(`loadedCreature.${form}`);
  const shown = () => forms.filter((form) => view(form)!.isEnabled());
  // Unstarted groups report isPlaying as undefined.
  const playing = (form: CreatureForm, clip: string) => Boolean(clips.get(form)!.find((g) => g.name === clip)!.isPlaying);
  return { fallback, creature, sources, clips, view, shown, playing };
}

async function withScene(body: (scene: Scene) => Promise<void>): Promise<void> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try { await body(scene); } finally { scene.dispose(); engine.dispose(); }
}

describe("apex creature model", () => {
  it("passes the asset contract as the apex form, with the adult's rig, sockets and six clips", async () => {
    await withScene(async (scene) => {
      const source = await load(scene, "apex");
      expect(source.report.ok).toBe(true);
      expect(source.report.problems).toEqual([]);
      // Within the 8,000-triangle budget, with the root bone and all eight sockets.
      expect(source.report.warnings.filter((w) => /budget|Bone "root"|socket/i.test(w))).toEqual([]);
      expect(source.report.animations).toEqual({ capture: true, gulp: true, hurt: true, evolve: true });
      const names = source.container.animationGroups.map((g) => g.name);
      for (const clip of ["idle", "move", "capture", "gulp", "hurt", "evolve"]) expect(names).toContain(clip);
      const skinned = source.container.meshes.filter((mesh) => mesh.skeleton);
      expect(skinned.length).toBeGreaterThan(0);
      for (const mesh of skinned) {
        expect(mesh.skeleton!.bones).toHaveLength(27);
        const weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind)!;
        expect(weights).not.toBeNull();
        expect(weights.length).toBe(mesh.getTotalVertices() * 4);
        for (let vertex = 0; vertex < mesh.getTotalVertices(); vertex++) {
          const offset = vertex * 4;
          const total = weights[offset]! + weights[offset + 1]! + weights[offset + 2]! + weights[offset + 3]!;
          expect(total).toBeCloseTo(1, 5);
        }
      }
      source.container.dispose();
    });
  }, 20000);

  it("shows the apex for tier 3 and every endless tier, and the adult for tier 2 only", async () => {
    await withScene(async (scene) => {
      const c = await build(scene, CREATURE_FORMS);
      for (const tier of [0, 1, 2, 3, 4, 9, 3, 2, 1, 0]) {
        c.creature.setForm(tier, tier > 0);
        const form = formForTier(tier);
        expect(form).toBe(tier >= 3 ? "apex" : CREATURE_FORMS[tier]);
        expect(c.shown()).toEqual([form]);
        expect(c.fallback.root.isEnabled()).toBe(false);
        // Only the shown model's clips run.
        for (const f of CREATURE_FORMS) expect(c.playing(f, "idle")).toBe(f === form);
        c.creature.update(1 / 30, 2, 3, 1, 0, [null]);
        expect(c.fallback.root.isEnabled()).toBe(false);
      }
      // Evolving from the adult into the apex plays the apex's evolve clip, not the adult's.
      c.creature.setForm(2, false);
      c.creature.setForm(3, true);
      expect(c.playing("apex", "evolve")).toBe(true);
      expect(c.playing("adult", "evolve")).toBe(false);
      c.creature.gulp();
      expect(c.playing("apex", "gulp")).toBe(true);
      c.creature.hurt();
      expect(c.playing("apex", "hurt")).toBe(true);
      expect(c.playing("adult", "gulp")).toBe(false);
      expect(c.playing("adult", "hurt")).toBe(false);
      c.creature.dispose();
      for (const s of c.sources) s.container.dispose();
    });
  }, 40000);

  it("falls back to the procedural creature per form, independently", async () => {
    await withScene(async (scene) => {
      // Apex missing: tiers 3+ are procedural, not the adult; tier 2 keeps the adult.
      const c = await build(scene, ["larval", "evolved", "adult"]);
      for (const tier of [3, 7]) {
        c.creature.setForm(tier, true);
        expect(c.shown()).toEqual([]);
        c.creature.update(1 / 30, 0, 0, 0, 0, [null]);
        expect(c.fallback.root.isEnabled()).toBe(true);
      }
      c.creature.setForm(2, false);
      expect(c.shown()).toEqual(["adult"]);
      expect(c.fallback.root.isEnabled()).toBe(false);
      c.creature.dispose();
      for (const s of c.sources) s.container.dispose();
    });
    await withScene(async (scene) => {
      // Adult missing: tier 2 is procedural, not the apex; tier 3 keeps the apex.
      const c = await build(scene, ["evolved", "apex"]);
      c.creature.setForm(2, true);
      expect(c.shown()).toEqual([]);
      expect(c.fallback.root.isEnabled()).toBe(true);
      expect(c.playing("apex", "idle")).toBe(false);
      c.creature.setForm(3, true);
      expect(c.shown()).toEqual(["apex"]);
      expect(c.fallback.root.isEnabled()).toBe(false);
      c.creature.setForm(1, false);
      expect(c.shown()).toEqual(["evolved"]);
      c.creature.dispose();
      for (const s of c.sources) s.container.dispose();
    });
  }, 40000);

  it("an apex arriving mid-game replaces the procedural body at tier 3+, not at the adult's tier", async () => {
    await withScene(async (scene) => {
      const c = await build(scene, ["adult"]);
      c.creature.setForm(5, false);
      expect(c.shown()).toEqual([]);
      expect(c.fallback.root.isEnabled()).toBe(true);
      const apex = await load(scene, "apex");
      c.creature.addForm("apex", apex);
      expect(c.view("apex")!.isEnabled()).toBe(true);
      expect(c.view("adult")!.isEnabled()).toBe(false);
      expect(c.fallback.root.isEnabled()).toBe(false);
      c.creature.dispose();
      for (const s of [...c.sources, apex]) s.container.dispose();
    });
    await withScene(async (scene) => {
      const c = await build(scene, ["adult"]);
      c.creature.setForm(2, false);
      const apex = await load(scene, "apex");
      c.creature.addForm("apex", apex);
      expect(c.view("apex")!.isEnabled()).toBe(false);
      expect(c.view("adult")!.isEnabled()).toBe(true);
      c.creature.dispose();
      for (const s of [...c.sources, apex]) s.container.dispose();
    });
  }, 40000);

  it("matches capture tubes to authored colors and restores the fallback appearance", async () => {
    await withScene(async (scene) => {
      const c = await build(scene, ["adult"]);
      c.creature.setForm(2, false);
      const arms = scene.getMaterialByName("armSkin") as StandardMaterial;
      const tips = scene.getMaterialByName("tipMat") as StandardMaterial;
      expect(arms.specularPower).toBe(25);
      expect(tips.emissiveColor.g).toBeGreaterThan(tips.emissiveColor.r);
      c.creature.setForm(3, false); // Missing Apex: original procedural fallback.
      expect(arms.specularPower).toBe(90);
      expect(tips.emissiveColor.r).toBeGreaterThan(tips.emissiveColor.g);
      c.creature.dispose();
      for (const source of c.sources) source.container.dispose();
    });
  }, 30000);

  it("preserves the visible gait when an unrelated form finishes downloading", async () => {
    await withScene(async (scene) => {
      const c = await build(scene, ["adult"]);
      c.creature.setForm(2, false);
      c.creature.update(0.2, 0, 0, 1, 0, [null]);
      const move = c.clips.get("adult")!.find((clip) => clip.name === "move")!;
      move.goToFrame((move.from + move.to) / 2);
      const running = [...move.animatables];
      expect(running.length).toBeGreaterThan(0);
      const weights = running.map((animation) => animation.weight);
      const apex = await load(scene, "apex");
      c.creature.addForm("apex", apex);
      expect(c.shown()).toEqual(["adult"]);
      // Restarting a clip replaces its animatables and loses its phase/weight.
      expect(move.animatables).toEqual(running);
      expect(move.animatables.map((animation) => animation.weight)).toEqual(weights);
      c.creature.dispose();
      for (const source of [...c.sources, apex]) source.container.dispose();
    });
  }, 30000);

  it("disposes every form's instances, materials and textures, apex included", async () => {
    await withScene(async (scene) => {
      const c = await build(scene, CREATURE_FORMS);
      expect(c.clips.get("apex")!.length).toBeGreaterThan(0);
      const instantiated = [...c.clips.values()].flat();
      c.creature.dispose();
      expect(scene.transformNodes.filter((n) => n.name.startsWith("loadedCreature"))).toEqual([]);
      expect(scene.meshes.filter((m) => m.skeleton)).toEqual([]);
      expect(scene.textures.filter((t) => /MicroRelief$/.test(t.name))).toEqual([]);
      expect(scene.materials.filter((m) => /^(larval|evolved|adult|apex)\./.test(m.name))).toEqual([]);
      expect(instantiated.filter((g) => scene.animationGroups.includes(g))).toEqual([]);
      for (const s of c.sources) s.container.dispose();
    });
  }, 40000);
});

describe("apex model file", () => {
  it("ships at the relative URL the renderer fetches, matching the Blender export", () => {
    expect(creatureModelPath("apex")).toBe("models/creature_apex.glb");
    const shipped = new URL(`../public/${creatureModelPath("apex")}`, import.meta.url);
    expect(existsSync(shipped)).toBe(true);
    expect(existsSync(APEX_SOURCE)).toBe(true);
    expect(isGlb(new Uint8Array(readFileSync(shipped)))).toBe(true);
    expect(readFileSync(shipped).equals(readFileSync(APEX_SOURCE))).toBe(true);
    // A distinct model, not a copy of the adult.
    expect(readFileSync(shipped).equals(readFileSync(FILES.adult))).toBe(false);
  });
});
