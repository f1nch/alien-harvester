import { LoadAssetContainerAsync, RegisterSceneLoaderPlugin, type AssetContainer, type Scene } from "@babylonjs/core";
import { registerBuiltInGLTFExtensions } from "@babylonjs/loaders/glTF/2.0/Extensions/dynamic";
import { GLTFFileLoaderMetadata } from "@babylonjs/loaders/glTF/glTFFileLoader.metadata";
import { GLTFLoaderAnimationStartMode } from "@babylonjs/loaders/glTF/glTFFileLoader.pure";
import { checkCreatureGlb, type CreatureForm, type CreatureSource, type GlbSummary } from "./creatureContract";

/**
 * Imported dynamically by the renderer only once a model file's bytes check out as a
 * GLB, so with no models present neither this module nor the glTF loader downloads.
 */
export type LoadedCreatureSource = CreatureSource<AssetContainer>;

let loadersRegistered = false;

/** Registers the glTF loader only, not the other formats `registerBuiltInLoaders` would pull in. */
function registerGltfLoader(): void {
  if (loadersRegistered) return;
  loadersRegistered = true;
  RegisterSceneLoaderPlugin({
    ...GLTFFileLoaderMetadata,
    createPlugin: async (options) => {
      // Mirrors Babylon's own registerBuiltInLoaders entry for glTF.
      const [{ GLTFFileLoader, RegisterGLTF2Loader }, { RegisterInstancedMesh }] = await Promise.all([
        import("@babylonjs/loaders/glTF/2.0/glTFLoader.pure"),
        import("@babylonjs/core/Meshes/instancedMesh.pure"),
      ]);
      RegisterInstancedMesh();
      RegisterGLTF2Loader();
      return new GLTFFileLoader(options[GLTFFileLoaderMetadata.name]);
    },
  });
  registerBuiltInGLTFExtensions();
}

const describeError = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Loads and checks one creature form from GLB bytes. Never throws: anything short of a
 * valid model comes back "invalid" so the caller keeps the procedural creature. The
 * container is not added to the scene and no animation is started.
 */
export async function loadCreatureGlb(scene: Scene, form: CreatureForm, bytes: Uint8Array): Promise<LoadedCreatureSource> {
  registerGltfLoader();
  let container: AssetContainer;
  try {
    container = await LoadAssetContainerAsync(bytes, scene, {
      pluginExtension: ".glb",
      name: `creature_${form}`,
      // The loader would otherwise start the first animation, running every frame unseen.
      pluginOptions: { gltf: { animationStartMode: GLTFLoaderAnimationStartMode.NONE } },
    });
  } catch (err) {
    // A file that fails partway can leave already-created textures behind. Only a
    // corrupt export does that, and a reload clears it.
    return { kind: "invalid", problems: [`Couldn't read the file: ${describeError(err)}`] };
  }
  try {
    const report = checkCreatureGlb(form, summarize(container));
    if (report.ok) return { kind: "ready", report, container };
    container.dispose();
    return { kind: "invalid", problems: report.problems };
  } catch (err) {
    container.dispose();
    return { kind: "invalid", problems: [`Couldn't inspect the file: ${describeError(err)}`] };
  }
}

export function summarize(c: AssetContainer): GlbSummary {
  const tentacleSkeleton = c.skeletons.find((sk) => sk.bones.some((b) => b.name.startsWith("tentacle.")));
  let tentacleTriangles = 0;
  let bodyTriangles = 0;
  for (const m of c.meshes) {
    const tris = Math.floor((m.getTotalIndices() || m.getTotalVertices()) / 3);
    if (tentacleSkeleton && m.skeleton === tentacleSkeleton) tentacleTriangles += tris;
    else bodyTriangles += tris;
  }
  return {
    nodes: [...c.meshes, ...c.transformNodes].map((n) => n.name),
    skeletons: c.skeletons.map((sk) => sk.bones.map((b) => b.name)),
    animations: c.animationGroups.map((g) => g.name),
    tentacleTriangles,
    bodyTriangles,
  };
}
