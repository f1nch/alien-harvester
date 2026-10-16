import { describe, expect, it } from "vitest";
import {
  checkCreatureGlb, CREATURE_FORMS, creatureModelPath, formForTier, isGlb, TENTACLE_BONES, TRIANGLE_BUDGET, type GlbSummary,
} from "../src/render/creatureContract";

/** A file that follows the brief exactly. */
function valid(): GlbSummary {
  return {
    nodes: ["__root__", "Creature", "CreatureBody", "root", "body", "mantle", ...Array.from({ length: 8 }, (_, i) => `socket.tentacle.${i}`), "Tentacle", "TentacleRig", ...TENTACLE_BONES],
    skeletons: [["root", "body", "mantle", "leg.0.a", "leg.0.b", "leg.0.c"], [...TENTACLE_BONES]],
    animations: ["idle", "move", "capture", "gulp", "hurt", "evolve"],
    tentacleTriangles: 320,
    bodyTriangles: 4200,
  };
}

describe("creature GLB contract", () => {
  it("accepts a file that follows the brief, with no warnings", () => {
    const r = checkCreatureGlb("larval", valid());
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.hasTentacle).toBe(true);
    expect(r.animations).toEqual({ capture: true, gulp: true, hurt: true, evolve: true });
  });

  it("rejects a file missing a required piece, naming each one", () => {
    const s = valid();
    s.nodes = s.nodes.filter((n) => n !== "Creature" && !n.startsWith("socket."));
    s.skeletons[0] = s.skeletons[0]!.filter((b) => b !== "body");
    s.animations = ["capture"];
    const r = checkCreatureGlb("larval", s);
    expect(r.ok).toBe(false);
    expect(r.problems.join("\n")).toMatch(/"Creature"/);
    expect(r.problems.join("\n")).toMatch(/Bone "body"/);
    expect(r.problems.join("\n")).toMatch(/socket/);
    expect(r.problems.join("\n")).toMatch(/Animation "idle"/);
    expect(r.problems.join("\n")).toMatch(/Animation "move"/);
  });

  it("points at Blender's .001 duplicate names", () => {
    const s = valid();
    s.animations = ["idle.001", "move"];
    const r = checkCreatureGlb("larval", s);
    expect(r.ok).toBe(false);
    expect(r.problems).toContain(`Animation "idle" is missing (found "idle.001": rename it to "idle")`);
  });

  it("degrades without optional animations or a tentacle", () => {
    const s = valid();
    s.animations = ["idle", "move"];
    s.nodes = s.nodes.filter((n) => !n.startsWith("Tentacle") && !n.startsWith("tentacle."));
    s.skeletons = [s.skeletons[0]!];
    s.tentacleTriangles = 0;
    const r = checkCreatureGlb("larval", s);
    expect(r.ok).toBe(true);
    expect(r.hasTentacle).toBe(false);
    expect(r.animations).toEqual({ capture: false, gulp: false, hurt: false, evolve: false });
    expect(r.warnings.some((w) => w.includes("procedural tentacles"))).toBe(true);
  });

  it("rejects a half-built tentacle rather than guessing", () => {
    const missingBone = valid();
    missingBone.skeletons[1] = TENTACLE_BONES.slice(0, 9);
    expect(checkCreatureGlb("larval", missingBone).problems.join()).toMatch(/tentacle\.09/);

    const extraBone = valid();
    extraBone.skeletons[1] = [...TENTACLE_BONES, "tentacle.ik"];
    expect(checkCreatureGlb("larval", extraBone).problems.join()).toMatch(/tentacle\.ik/);

    const noRig = valid();
    noRig.skeletons = [noRig.skeletons[0]!];
    expect(checkCreatureGlb("larval", noRig).ok).toBe(false);

    const noMesh = valid();
    noMesh.nodes = noMesh.nodes.filter((n) => n !== "Tentacle");
    expect(checkCreatureGlb("larval", noMesh).ok).toBe(false);
  });

  it("warns, but loads, when over the triangle budget", () => {
    const s = valid();
    s.bodyTriangles = TRIANGLE_BUDGET.larval + 1;
    s.tentacleTriangles = 900;
    const r = checkCreatureGlb("larval", s);
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(2);
    // The evolved form has a bigger budget.
    s.tentacleTriangles = 300;
    expect(checkCreatureGlb("evolved", s).warnings).toEqual([]);
  });

  it("accepts the one-bone greybox the brief asks for first", () => {
    const r = checkCreatureGlb("larval", {
      nodes: ["__root__", "Creature", "body", "Greybox", "socket.tentacle.0"],
      skeletons: [["body"]],
      animations: ["idle", "move"],
      tentacleTriangles: 0,
      bodyTriangles: 900,
    });
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.hasTentacle).toBe(false);
    expect(r.warnings.join("\n")).toMatch(/Bone "root"/);
    expect(r.warnings.join("\n")).toMatch(/1 of 8 tentacle sockets/);
  });

  it("ignores misnamed sockets, and says so", () => {
    const s = valid();
    s.nodes = s.nodes.filter((n) => !n.startsWith("socket.")).concat(["socket.tentacle.07", "socket.tentacle.0.001"]);
    const r = checkCreatureGlb("larval", s);
    // Neither counts, so there are no usable sockets.
    expect(r.ok).toBe(false);
    expect(r.warnings.join()).toMatch(/socket\.tentacle\.0\.001/);
  });

  it("warns about sockets past the eight the game uses", () => {
    const s = valid();
    s.nodes.push("socket.tentacle.8");
    const r = checkCreatureGlb("larval", s);
    expect(r.ok).toBe(true);
    expect(r.warnings.join()).toMatch(/socket\.tentacle\.8/);
  });
});

describe("creature model files", () => {
  it("maps evolution tiers to forms, clamping past the last", () => {
    expect(CREATURE_FORMS).toEqual(["larval", "evolved", "adult", "apex"]);
    expect(formForTier(0)).toBe("larval");
    expect(formForTier(1)).toBe("evolved");
    // The adult is tier 2 only.
    expect(formForTier(2)).toBe("adult");
    expect(formForTier(3)).toBe("apex");
    // Endless evolution keeps the apex model.
    expect(formForTier(4)).toBe("apex");
    expect(formForTier(50)).toBe("apex");
    expect(formForTier(-1)).toBe("larval");
  });

  it("keeps model URLs relative, one file per form", () => {
    expect(CREATURE_FORMS.map(creatureModelPath)).toEqual([
      "models/creature_larval.glb", "models/creature_evolved.glb", "models/creature_adult.glb", "models/creature_apex.glb",
    ]);
    for (const form of CREATURE_FORMS) expect(creatureModelPath(form).startsWith("/")).toBe(false);
  });

  it("budgets the apex like the adult", () => {
    const s = valid();
    s.bodyTriangles = TRIANGLE_BUDGET.apex;
    expect(TRIANGLE_BUDGET.apex).toBe(8000);
    expect(checkCreatureGlb("apex", s).warnings).toEqual([]);
    s.bodyTriangles += 1;
    expect(checkCreatureGlb("apex", s).warnings.join()).toMatch(/budget 8000/);
  });

  it("budgets the adult like the evolved form", () => {
    const s = valid();
    s.bodyTriangles = TRIANGLE_BUDGET.adult;
    expect(checkCreatureGlb("adult", s).warnings).toEqual([]);
    s.bodyTriangles += 1;
    expect(checkCreatureGlb("adult", s).warnings.join()).toMatch(/budget 8000/);
  });

  it("recognises GLB bytes and rejects the HTML a dev server serves for missing files", () => {
    const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);
    expect(isGlb(glb)).toBe(true);
    expect(isGlb(new TextEncoder().encode("<!doctype html><html></html>"))).toBe(false);
    expect(isGlb(new Uint8Array(0))).toBe(false);
    expect(isGlb(glb.slice(0, 4))).toBe(false);
  });
});
