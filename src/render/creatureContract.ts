/**
 * The creature GLB contract from docs/CREATURE_ASSET_BRIEF.md, checked against a plain
 * summary of a loaded file. Renderer-free so it can be unit-tested.
 */

/**
 * One model file per life stage, indexed by evolution tier: larval (hatchling) is tier 0,
 * evolved (juvenile) tier 1, adult tier 2, apex tier 3. IDs name files, so never rename one.
 */
export const CREATURE_FORMS = ["larval", "evolved", "adult", "apex"] as const;
export type CreatureForm = (typeof CREATURE_FORMS)[number];

/** Evolution tier to model file. Endless tiers past the apex reuse it. */
export function formForTier(tier: number): CreatureForm {
  return CREATURE_FORMS[Math.max(0, Math.min(tier, CREATURE_FORMS.length - 1))]!;
}

export function creatureModelPath(form: CreatureForm): string {
  return `models/creature_${form}.glb`;
}

/** Where a creature form's look comes from. C is the loaded model (an AssetContainer). */
export type CreatureSource<C = unknown> =
  | { kind: "loading" }
  /** Procedural by request (`?creature=procedural` in dev builds). */
  | { kind: "forced" }
  /** No model file (or the server answered with something that isn't a GLB). */
  | { kind: "missing" }
  | { kind: "invalid"; problems: string[] }
  /** The loader's own code couldn't be fetched (e.g. offline before it was cached). */
  | { kind: "failed"; reason: string }
  | { kind: "ready"; report: ContractReport; container: C };

export function describeSource(s: CreatureSource): string {
  switch (s.kind) {
    case "loading": return "loading…";
    case "forced": return "procedural (forced)";
    case "missing": return "procedural (no model)";
    case "invalid": return `procedural (invalid: ${s.problems.length} problem${s.problems.length === 1 ? "" : "s"})`;
    case "failed": return "procedural (loader failed)";
    case "ready": return s.report.hasTentacle ? "GLB" : "GLB, procedural tentacles";
  }
}

/** One console line per form, so a broken export is easy to diagnose. */
export function logSource(form: CreatureForm, url: string, s: CreatureSource): void {
  if (s.kind === "missing") {
    console.info(`Creature ${form}: no model at ${url}; using the procedural creature.`);
  } else if (s.kind === "invalid") {
    console.warn(`Creature ${form}: ${url} doesn't match the asset brief; using the procedural creature.\n- ${s.problems.join("\n- ")}`);
  } else if (s.kind === "failed") {
    console.warn(`Creature ${form}: couldn't load the model loader (${s.reason}); using the procedural creature.`);
  } else if (s.kind === "ready") {
    console.info(`Creature ${form}: loaded ${url}.`);
    if (s.report.warnings.length > 0) console.warn(`Creature ${form} warnings:\n- ${s.report.warnings.join("\n- ")}`);
  }
}

/** What the checker needs to know about a loaded file. */
export interface GlbSummary {
  /** Names of every node: meshes, transform nodes and bone nodes. */
  nodes: string[];
  /** Bone names of each skeleton in the file. */
  skeletons: string[][];
  animations: string[];
  /** Triangles in meshes skinned to the tentacle skeleton, and in all other meshes. */
  tentacleTriangles: number;
  bodyTriangles: number;
}

export interface ContractReport {
  /** False when the file can't be used; `problems` says why. */
  ok: boolean;
  problems: string[];
  /** Usable, but something is off (over budget, optional piece missing). */
  warnings: string[];
  /** The file has a valid tentacle; without one, the game draws procedural tentacles. */
  hasTentacle: boolean;
  /** Optional animations present in the file. */
  animations: { capture: boolean; gulp: boolean; hurt: boolean; evolve: boolean };
}

export const TENTACLE_BONES = Array.from({ length: 10 }, (_, i) => `tentacle.${String(i).padStart(2, "0")}`);
export const MAX_SOCKETS = 8;
/** No leading zeros, so "07" and "7" can't both claim socket 7. */
const SOCKET = /^socket\.tentacle\.(0|[1-9]\d*)$/;
const SOCKET_DUPLICATE = /^socket\.tentacle\.\d+\.\d{3}$/;
const REQUIRED_ANIMATIONS = ["idle", "move"] as const;
const OPTIONAL_ANIMATIONS = ["capture", "gulp", "hurt", "evolve"] as const;

export const TRIANGLE_BUDGET: Record<CreatureForm, number> = { larval: 5000, evolved: 8000, adult: 8000, apex: 8000 };
export const TENTACLE_TRIANGLE_BUDGET = 400;

/** Blender appends ".001" to duplicate names; point at the near miss so it's easy to fix. */
function missing(kind: string, name: string, available: readonly string[]): string {
  const near = available.find((n) => n.startsWith(`${name}.`) && /^\.\d{3}$/.test(n.slice(name.length)));
  return near ? `${kind} "${name}" is missing (found "${near}": rename it to "${name}")` : `${kind} "${name}" is missing`;
}

export function checkCreatureGlb(form: CreatureForm, s: GlbSummary): ContractReport {
  const problems: string[] = [];
  const warnings: string[] = [];
  const nodes = new Set(s.nodes);
  const bones = s.skeletons.flat();

  if (!nodes.has("Creature")) problems.push(missing("Armature object", "Creature", s.nodes));
  // Only "body" is required, so a one-bone greybox export loads.
  if (!bones.includes("body")) problems.push(missing("Bone", "body", bones));
  if (!bones.includes("root")) warnings.push(missing("Bone", "root", bones));

  const sockets = s.nodes.flatMap((n) => {
    const m = SOCKET.exec(n);
    return m ? [Number(m[1])] : [];
  });
  const renamed = s.nodes.filter((n) => SOCKET_DUPLICATE.test(n));
  if (sockets.length === 0) {
    problems.push(`No tentacle sockets: add empties named "socket.tentacle.0" to "socket.tentacle.${MAX_SOCKETS - 1}"`);
  } else if (new Set(sockets.filter((i) => i < MAX_SOCKETS)).size < MAX_SOCKETS) {
    warnings.push(`${new Set(sockets).size} of ${MAX_SOCKETS} tentacle sockets: tentacles will share sockets`);
  }
  if (renamed.length > 0) warnings.push(`Sockets with Blender duplicate names are ignored (rename them): ${renamed.join(", ")}`);
  const outOfRange = sockets.filter((i) => i >= MAX_SOCKETS);
  if (outOfRange.length > 0) warnings.push(`Sockets above ${MAX_SOCKETS - 1} are ignored: ${outOfRange.map((i) => `socket.tentacle.${i}`).join(", ")}`);

  for (const name of REQUIRED_ANIMATIONS) {
    if (!s.animations.includes(name)) problems.push(missing("Animation", name, s.animations));
  }
  const animations = { capture: false, gulp: false, hurt: false, evolve: false };
  for (const name of OPTIONAL_ANIMATIONS) {
    animations[name] = s.animations.includes(name);
    if (!animations[name]) warnings.push(missing("Animation", name, s.animations));
  }

  // The tentacle is optional, but a half-built one is a mistake worth stopping on.
  let hasTentacle = false;
  const tentacleSkeleton = s.skeletons.find((sk) => sk.some((b) => b.startsWith("tentacle.")));
  if (!nodes.has("Tentacle") && !tentacleSkeleton) {
    warnings.push(`No "Tentacle": the game will draw procedural tentacles`);
  } else if (!nodes.has("Tentacle")) {
    problems.push(missing("Tentacle mesh", "Tentacle", s.nodes));
  } else if (!tentacleSkeleton) {
    problems.push(`"Tentacle" has no armature: it needs bones ${TENTACLE_BONES[0]} to ${TENTACLE_BONES.at(-1)}`);
  } else {
    const absent = TENTACLE_BONES.filter((b) => !tentacleSkeleton.includes(b));
    const extra = tentacleSkeleton.filter((b) => !TENTACLE_BONES.includes(b));
    if (absent.length > 0) problems.push(`Tentacle bones missing: ${absent.join(", ")}`);
    if (extra.length > 0) problems.push(`Unexpected tentacle bones (export deform bones only?): ${extra.join(", ")}`);
    hasTentacle = absent.length === 0 && extra.length === 0;
  }

  if (s.bodyTriangles > TRIANGLE_BUDGET[form]) {
    warnings.push(`Body is ${s.bodyTriangles} triangles (budget ${TRIANGLE_BUDGET[form]})`);
  }
  if (s.tentacleTriangles > TENTACLE_TRIANGLE_BUDGET) {
    warnings.push(`Tentacle is ${s.tentacleTriangles} triangles (budget ${TENTACLE_TRIANGLE_BUDGET})`);
  }

  return { ok: problems.length === 0, problems, warnings, hasTentacle, animations };
}

/** True when the bytes start with the GLB magic ("glTF"). Anything else is not a model. */
export function isGlb(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;
}
