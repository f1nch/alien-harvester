/** Local-only art review: uses the shipped loader/view; never opens a save store. */
import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, MeshBuilder, Scene, StandardMaterial, Vector3 } from "@babylonjs/core";
import { loadCreatureGlb, type LoadedCreatureSource } from "../src/render/creatureAssets";
import { CREATURE_FORMS, creatureModelPath } from "../src/render/creatureContract";
import { GltfCreature } from "../src/render/gltfCreature";
import { ProceduralCreature } from "../src/render/proceduralCreature";

const canvas = document.querySelector<HTMLCanvasElement>("#review")!;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.065, 0.095, 0.115, 1);
const camera = new ArcRotateCamera("camera", Math.PI / 2 + 0.45, 0.85, 6.4, new Vector3(0, 1.05, 0), scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 3; camera.upperRadiusLimit = 10;
const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
ambient.intensity = 0.9;
const key = new DirectionalLight("key", new Vector3(-0.4, -1, 0.5), scene);
key.intensity = 1.3;
const floor = MeshBuilder.CreateGround("floor", { width: 10, height: 10 }, scene);
const floorMaterial = new StandardMaterial("floor", scene);
floorMaterial.diffuseColor = new Color3(0.045, 0.065, 0.07);
floorMaterial.specularColor = Color3.Black(); floor.material = floorMaterial;
const creature = new GltfCreature(scene, new ProceduralCreature(scene, null), null);
const status = document.querySelector<HTMLElement>("#status")!;
const sources: Array<Extract<LoadedCreatureSource, { kind: "ready" }>> = [];
for (const form of CREATURE_FORMS) {
  const bytes = new Uint8Array(await (await fetch(`../${creatureModelPath(form)}`)).arrayBuffer());
  const source = await loadCreatureGlb(scene, form, bytes);
  if (source.kind !== "ready") throw new Error(`${form}: ${JSON.stringify(source)}`);
  sources.push(source); creature.addForm(form, source);
}
status.textContent = "All four models loaded · 27 bones · 8 capture sockets · 6 clips per stage";
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tier]")) {
  button.onclick = () => {
    creature.setForm(Number(button.dataset.tier), false);
    for (const other of document.querySelectorAll("[data-tier]")) other.setAttribute("aria-pressed", String(other === button));
  };
}
let capture = false, turn = false, heading = 0;
for (const id of ["capture", "turn"] as const) {
  const button = document.querySelector<HTMLButtonElement>(`#${id}`)!;
  button.onclick = () => {
    if (id === "capture") capture = !capture; else turn = !turn;
    button.setAttribute("aria-pressed", String(id === "capture" ? capture : turn));
  };
}
document.querySelector<HTMLButtonElement>("#gulp")!.onclick = () => creature.gulp();
document.querySelector<HTMLButtonElement>("#hurt")!.onclick = () => creature.hurt();
const motion = document.querySelector<HTMLSelectElement>("#motion")!;
const goals: Array<Vector3 | null> = [null, null];
const captureGoals = [new Vector3(-1.3, 0.9, 1.5), new Vector3(1.3, 0.9, 1.7)];
engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  if (turn) heading += dt * 0.7;
  const speed = Number(motion.value);
  goals[0] = capture ? captureGoals[0]! : null;
  goals[1] = capture ? captureGoals[1]! : null;
  creature.update(dt, 0, 0, Math.sin(heading) * speed, Math.cos(heading) * speed, goals);
  scene.render();
});
window.addEventListener("resize", () => engine.resize());
window.addEventListener("pagehide", () => {
  creature.dispose(); for (const source of sources) source.container.dispose();
  scene.dispose(); engine.dispose();
}, { once: true });
