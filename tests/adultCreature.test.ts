// @ts-expect-error Vitest runs in Node; the browser project's types omit Node APIs.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NullEngine, Scene, type AnimationGroup } from "@babylonjs/core";
import { loadCreatureGlb, type LoadedCreatureSource } from "../src/render/creatureAssets";
import { creatureModelPath, formForTier, isGlb, type CreatureForm } from "../src/render/creatureContract";
import { GltfCreature } from "../src/render/gltfCreature";
import { ProceduralCreature } from "../src/render/proceduralCreature";

/** The adult's Blender export; public/models holds the copy the game fetches. */
const ADULT_SOURCE = new URL("../art/alien/tendon-stalker/adult/creature_adult.glb", import.meta.url);
/** The apex has its own suite (apexCreature.test.ts); these tests run without it. */
const FILES = {
  larval: new URL(`../public/${creatureModelPath("larval")}`, import.meta.url),
  evolved: new URL(`../public/${creatureModelPath("evolved")}`, import.meta.url),
  adult: ADULT_SOURCE,
} satisfies Partial<Record<CreatureForm, URL>>;
type Form = keyof typeof FILES;
const FORMS = Object.keys(FILES) as Form[];

type Ready = Extract<LoadedCreatureSource, { kind: "ready" }>;

async function load(scene: Scene, form: Form): Promise<Ready> {
  const source = await loadCreatureGlb(scene, form, new Uint8Array(readFileSync(FILES[form])));
  if (source.kind !== "ready") throw new Error(`${form}: ${JSON.stringify(source)}`);
  return source;
}

/** Adds forms one at a time, recording the animation groups each one instantiates. */
async function build(scene: Scene, forms: Form[]) {
  const fallback = new ProceduralCreature(scene, null);
  const creature = new GltfCreature(scene, fallback, null);
  const sources: Ready[] = [];
  const clips = new Map<Form, AnimationGroup[]>();
  for (const form of forms) {
    const source = await load(scene, form);
    sources.push(source);
    const before = new Set(scene.animationGroups);
    creature.addForm(form, source);
    clips.set(form, scene.animationGroups.filter((g) => !before.has(g)));
  }
  const view = (form: Form) => scene.getTransformNodeByName(`loadedCreature.${form}`);
  const shown = () => forms.filter((form) => view(form)!.isEnabled());
  const playing = (form: Form, clip: string) => Boolean(clips.get(form)!.find((g) => g.name === clip)!.isPlaying);
  const idlePlaying = (form: Form) => playing(form, "idle");
  return { fallback, creature, sources, clips, view, shown, playing, idlePlaying };
}

async function withScene(body: (scene: Scene) => Promise<void>): Promise<void> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try { await body(scene); } finally { scene.dispose(); engine.dispose(); }
}

describe("adult creature model", () => {
  it("passes the asset contract as the adult form", async () => {
    await withScene(async (scene) => {
      const source = await load(scene, "adult");
      expect(source.report.problems).toEqual([]);
      expect(source.report.warnings.filter((w) => /budget/.test(w))).toEqual([]);
      expect(source.report.animations).toEqual({ capture: true, gulp: true, hurt: true, evolve: true });
      source.container.dispose();
    });
  }, 20000);

  it("shows each tier's own model, with the adult for tier 2 only", async () => {
    await withScene(async (scene) => {
      const c = await build(scene, FORMS);
      for (const tier of [0, 1, 2, 1, 0, 2]) {
        c.creature.setForm(tier, tier > 0);
        const form = formForTier(tier);
        expect(c.shown()).toEqual([form]);
        expect(c.fallback.root.isEnabled()).toBe(false);
        // Only the shown model's clips run.
        for (const f of FORMS) expect(c.idlePlaying(f)).toBe(f === form);
        c.creature.update(1 / 30, 2, 3, 1, 0, [null]);
        expect(c.fallback.root.isEnabled()).toBe(false);
      }
      // Tiers above 2 belong to the apex: without its model they are procedural, never the adult.
      for (const tier of [3, 9]) {
        c.creature.setForm(tier, true);
        expect(formForTier(tier)).not.toBe("adult");
        expect(c.shown()).toEqual([]);
        c.creature.update(1 / 30, 2, 3, 1, 0, [null]);
        expect(c.fallback.root.isEnabled()).toBe(true);
        for (const f of FORMS) expect(c.idlePlaying(f)).toBe(false);
        expect(c.playing("adult", "evolve")).toBe(false);
      }
      // Evolving into the adult plays its own evolve clip.
      c.creature.setForm(2, true);
      expect(c.playing("adult", "evolve")).toBe(true);
      c.creature.gulp(); c.creature.hurt();
      c.creature.dispose();
      for (const s of c.sources) s.container.dispose();
    });
  }, 30000);

  it("falls back to the procedural creature per form, independently", async () => {
    await withScene(async (scene) => {
      // Juvenile missing: tier 1 is procedural, tiers 0 and 2 keep their models.
      const c = await build(scene, ["larval", "adult"]);
      c.creature.setForm(1, true);
      expect(c.shown()).toEqual([]);
      expect(c.fallback.root.isEnabled()).toBe(true);
      c.creature.setForm(2, true);
      expect(c.shown()).toEqual(["adult"]);
      expect(c.fallback.root.isEnabled()).toBe(false);
      c.creature.setForm(0, false);
      expect(c.shown()).toEqual(["larval"]);
      c.creature.dispose();
      for (const s of c.sources) s.container.dispose();
    });
    await withScene(async (scene) => {
      // Adult missing: tier 2 is procedural, not the juvenile.
      const c = await build(scene, ["evolved"]);
      c.creature.setForm(2, false);
      expect(c.shown()).toEqual([]);
      c.creature.update(1 / 30, 0, 0, 0, 0, [null]);
      expect(c.fallback.root.isEnabled()).toBe(true);
      c.creature.setForm(1, false);
      expect(c.shown()).toEqual(["evolved"]);
      c.creature.dispose();
      for (const s of c.sources) s.container.dispose();
    });
  }, 30000);

  it("an adult arriving mid-game replaces the procedural body at tier 2, not above", async () => {
    await withScene(async (scene) => {
      const c = await build(scene, ["larval"]);
      c.creature.setForm(2, false);
      expect(c.fallback.root.isEnabled()).toBe(true);
      const adult = await load(scene, "adult");
      c.creature.addForm("adult", adult);
      expect(c.view("adult")!.isEnabled()).toBe(true);
      expect(c.view("larval")!.isEnabled()).toBe(false);
      expect(c.fallback.root.isEnabled()).toBe(false);
      c.creature.dispose();
      for (const s of [...c.sources, adult]) s.container.dispose();
    });
    await withScene(async (scene) => {
      const c = await build(scene, ["larval"]);
      c.creature.setForm(3, false);
      const adult = await load(scene, "adult");
      c.creature.addForm("adult", adult);
      expect(c.view("adult")!.isEnabled()).toBe(false);
      expect(c.fallback.root.isEnabled()).toBe(true);
      c.creature.dispose();
      for (const s of [...c.sources, adult]) s.container.dispose();
    });
  }, 30000);

  it("disposes every form's instances, materials and textures", async () => {
    await withScene(async (scene) => {
      const c = await build(scene, FORMS);
      const instantiated = [...c.clips.values()].flat();
      expect(instantiated.length).toBeGreaterThan(0);
      c.creature.dispose();
      expect(scene.transformNodes.filter((n) => n.name.startsWith("loadedCreature"))).toEqual([]);
      expect(scene.meshes.filter((m) => m.skeleton)).toEqual([]);
      expect(scene.textures.filter((t) => /MicroRelief$/.test(t.name))).toEqual([]);
      expect(scene.materials.filter((m) => /^(larval|evolved|adult)\./.test(m.name))).toEqual([]);
      expect(instantiated.filter((g) => scene.animationGroups.includes(g))).toEqual([]);
      for (const s of c.sources) s.container.dispose();
    });
  }, 30000);
});

describe("adult model file", () => {
  it("ships at the relative URL the renderer fetches, matching the Blender export", () => {
    const shipped = new URL(`../public/${creatureModelPath("adult")}`, import.meta.url);
    expect(existsSync(shipped)).toBe(true);
    const bytes = new Uint8Array(readFileSync(shipped));
    expect(isGlb(bytes)).toBe(true);
    expect(readFileSync(shipped).equals(readFileSync(ADULT_SOURCE))).toBe(true);
  });
});
