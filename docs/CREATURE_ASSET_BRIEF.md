# Creature asset brief

**Refinement update (2026-10-16):** the [refined four-stage lineage](../art/alien/tendon-stalker/refined/README.md) supersedes earlier runtime geometry/animation measurements: Hatchling 3,819, Juvenile 5,015, Adult 5,567, Apex 4,363 triangles; each has 27 bones, eight sockets, five materials and six clips. The user requested smoother animation and a less busy Apex. New sibling Blender sources preserve the originals. The simpler Apex is still a single skinned mesh; modular customization remains planned.

**Runtime update (2026-10-15):** the adult GLB renders at existing tier 2 and the rigged [apex](../art/alien/tendon-stalker/apex/README.md) at tier 3 and above, after hatchling (0) and juvenile (1), with independent procedural fallback. Adult and apex each have an 8,000-triangle body budget. The apex has 6,999 triangles, 27 bones, eight sockets and six inherited adult clips. Progression and saves are unchanged; the initial static blockout is preserved. Historical two-form dimensions and examples below describe the original brief, not an instruction to remove the adult.

> **Selected art direction (October 13, 2026):** Tendon Stalker replaces the original blob concept below: dry charcoal-plum tissue, swept chitin, mint crest/core, two resting capture arms, four walking legs and one tail. The older silhouette and wet material descriptions are historical starting points, not requirements for this approved design. Technical names, sockets, budgets, in-place animation and export rules still apply. The first rigged hatchling is integrated; see [its workflow](../art/alien/tendon-stalker/README.md). Its materials retain the authored dry look, and procedural capture tubes are rooted at its sockets. The juvenile is integrated as the evolved form, and the adult is integrated at tier 2 and apex at tier 3 and above.

What to build in Blender so the game can load the creature as a GLB in place of the procedural placeholder (`src/render/creature.ts`). This is a brief to model against: the measurements, names and limits below are what the game will check for. Part 1 is for modelling, Part 2 is the code plan, Part 3 is a first-pass Blender workflow.

Spec references: section 10 (visual bar), section 6 (tentacle capture), section 9 (15 MB initial download).

---

## Part 1: The asset

### 1. Scale and camera

**Units:** 1 Blender unit = 1 metre (Blender's default). glTF is in metres too, so the game uses the model as-is with no scaling. **Model each form at its real size.** The game no longer scales one model up for the evolved form.

**Reference sizes in the game world:**

| Thing | Size |
| --- | --- |
| Crowd humans (workers, technicians, guards) | about 1.6 m tall |
| Reactor warden boss | about 2.9 m tall |
| Creature collision circle | 0.6 m radius (fixed by the simulation, the same for both forms) |
| Point where a tentacle grabs a human | 0.9 m above the floor, at the human's centre |
| Capture radius (tentacle reach from the creature's centre) | 1.9 m at start, up to 4.0 m fully upgraded |
| Movement speed | 3 m/s at start, up to about 5 m/s |

**The camera** (`src/render/renderer.ts`) is a perspective camera 16 m up and 12 m behind the creature, looking down at about **53°** from horizontal, about 20 m away. Its field of view is 35.5° across the screen's width in portrait. On a phone in portrait the screen shows about **12.8 m of floor across**. A 375-point-wide phone therefore draws roughly **30 points per metre** (60 to 90 physical pixels per metre on high-DPI screens).

What that means for the model:

- The larval body (1.4 m wide) is only about 40 points across. Players read **silhouette, colour contrast and glow**, not surface detail. Anything smaller than about 5 cm is invisible.
- The creature turns freely to face where it moves, so the camera sees it from above and from **every side**. The silhouette from directly above matters most. The back and the top of the mantle are seen more than the face.
- Exaggerate: wider stance, chunkier legs, bigger eyes, and brighter tips than feel right in Blender's close-up viewport. Check every pose through the game camera (Part 3 sets up a matching Blender camera).

**Orientation and origin:**

- The creature **faces Blender −Y**, which is the side you see in Front view (numpad 1). The glTF exporter and Babylon's loader turn that into the game's forward (+Z).
- The **origin sits on the floor (Z = 0) at the centre of the body**, between the feet. The game places the origin at the simulation position.
- **No root motion.** The game moves and rotates the creature. Animations play in place.

### 2. Silhouettes (from the current procedural version)

Keep these proportions; refine the shapes. All measurements are in metres, with the origin on the floor.

#### Larval form (tier 0)

| Part | Shape and placement |
| --- | --- |
| Body | Squashed egg about **1.4 wide × 1.15 tall × 1.5 long**, centred **0.85 m up**. Top of the body at about 1.4 m. |
| Mantle | A swept-back hood on top of and behind the body, reaching back about 1.0 m behind centre and up to about 1.6 m. It gives the readable "teardrop" silhouette from above. |
| Eyes | Two large eyes on the front face, about **0.48 m apart**, at about 1.0 m height, **0.3 m wide**, slightly flattened, with black vertical slit pupils. |
| Legs | **6 legs**, splayed evenly around the body. They leave the body low on its sides, arch up to about 0.55 m at the knee, and touch down **1.15 m from centre**. The footprint is about **2.3 m across**. Thick at the hip (about 0.17 m radius) and tapering to a point. |
| Tentacles | Not part of the body mesh. See section 4. |

Overall it reads as a dark, glossy, roughly human-height blob with a hood and a wide insect stance. It is not much taller than a human but much wider.

#### Evolved form (tier 1)

The evolved form must read differently **from above**, not only in colour:

| Change | Detail |
| --- | --- |
| Bigger | Everything about **1.28× larger**: body about 1.8 wide, centred about 1.1 m up; footprint about **2.95 m across**. |
| 8 legs | Two more legs, still evenly splayed. |
| Dorsal crest | **5 spines** in a row down the mantle, leaning back, tallest at the front (about 0.75 m), shrinking toward the back. The tip of the front spine is about 2.3 m up. |
| Side spines | **2 spines** sticking out sideways and back from the shoulders, about 0.55 m long. |
| Extra eyes | A **second, smaller pair** (about 0.6× size) above and just inside the first pair. |
| Colour shift | Violet-black becomes blue-black, the purple rim becomes cyan, and the green tips become magenta (see section 5). |

The crest and side spines change the top-down outline from a teardrop to a spiked shield. That outline change is the point of evolving.

### 3. Polygon and texture budgets (phones)

The creature is the hero asset, but it shares the frame with up to 150 crowd characters on a mid-range phone at a 30 FPS floor. Budgets are in **triangles** (Blender shows these in the status bar: right-click the status bar, then enable *Scene Statistics*).

| Item | Budget |
| --- | --- |
| Larval body + legs + eyes | **≤ 5,000 triangles** |
| Evolved body + legs + eyes + spines | **≤ 8,000 triangles** |
| Adult or apex body | **≤ 8,000 triangles** each; current apex 6,999 |
| One tentacle | **≤ 400 triangles** (the game shows up to 8 at once) |
| Body skeleton | **≤ 40 bones**; at most **4 bone influences per vertex** |
| Tentacle skeleton | **10 bones** in a single chain |
| Materials per form | **3 to 4** (body, tentacle, tentacle tip, eyes); each material costs a draw call |
| Textures per form | One **512 × 512** base-colour texture (1024 × 1024 at most). A normal map is optional and the same size. Everything else is plain material values. |
| File size per form | **≤ 1.5 MB** GLB before compression (both forms together use about 20% of the 15 MB initial-download budget) |
| Morph targets (shape keys) | Avoid in the first pass; use bones. |

A first pass with **no textures at all** (flat material colours) is fine and fits the look; the glossy rim lighting does most of the work.

### 4. Rig

There are **two kinds of object per form**: the body (with its armature, sockets and animations), and **one** tentacle (with its own small armature). The game clones the tentacle for each capture slot (up to 8) and poses it itself.

#### Body armature (object name `Creature`)

| Bone | Purpose |
| --- | --- |
| `root` | At the origin on the floor. Not animated (or barely). |
| `body` | Body centre, 0.85 m up (larval). Bob, lean and squash go here. |
| `mantle` | Child of `body`, for hood sway. |
| `eye.L`, `eye.R` | Optional, for blinks and looks. Evolved form adds `eye2.L`, `eye2.R`. |
| `leg.0.a`, `leg.0.b`, `leg.0.c` … | Three bones per leg (hip, knee, foot), numbered clockwise from front-left as seen from above: `leg.0` to `leg.5` (larval) or `leg.0` to `leg.7` (evolved). |
| `spine.0` … `spine.4`, `spine.L`, `spine.R` | Evolved only, so the crest can rise during `evolve`. |

You can add helper or control bones (IK targets, poles) freely. Untick *Deform* on them so they don't export (see section 7).

**Tentacle sockets:** add **8 empties** named `socket.tentacle.0` to `socket.tentacle.7`, **parented to the `body` bone**. Place them in a ring around the lower front half of the body, where tentacles should emerge (about 0.45 m from centre, slightly below body centre). For each capture, the game roots a tentacle at the socket that points most toward the target. Sockets follow the body's bob and squash because they're parented to it.

#### Tentacle (object name `Tentacle`, armature `TentacleRig`)

- Model it **straight, pointing up along +Z** from the origin, **1.5 m long** at rest. It's thickest at the base (about 0.16 m radius larval, 0.2 m evolved) and tapers to about 0.06 m. The last 15 to 20% is the **tip**, with its own material (section 5).
- **10 bones in one chain**, `tentacle.00` (base) to `tentacle.09` (tip), evenly spaced along the length, each bone pointing up the tentacle. Use plenty of edge loops (about 16 rings of 8 sides) so it bends smoothly.
- **No animations** on the tentacle. The game drives every tentacle bone, every frame.

How the game drives it, so you know what the mesh must survive:

- **Extend:** bones are spaced along a curve from the socket to the target. The tentacle stretches from about 0.3 m (just emerging) to about 4.5 m (full upgraded reach), so the **mesh will stretch up to 3× its rest length**. The game thins it as it stretches to keep the volume roughly constant. Avoid surface details that look wrong when stretched (rings, suckers with fixed spacing). Smooth gradients survive best.
- **Bend:** the curve arcs up and over (the same Bézier arc as today), with a sideways wiggle. Each bone turns to follow the curve.
- **Attach:** the tip bone sits exactly on the grab point (0.9 m up, at the human's centre). Design the tip to read as "gripping": a small curl or a bulb.
- **Retract:** the curve shortens back into the socket, then the tentacle hides.

### 5. Materials

Use Blender's **Principled BSDF** only; that is what the glTF exporter understands. Name the materials exactly as below. The game finds them by name to apply its rim lighting and to recolour during evolution.

| Material | Look | Larval | Evolved |
| --- | --- | --- | --- |
| `M_Body` | Dark, glossy, wet-organic. Roughness about **0.15**, metallic **0**. The game adds a coloured rim (Fresnel) glow around the silhouette edge. | base `#120A1A`, rim `#7326BF` | base `#08121A`, rim `#33BFF2` |
| `M_Tentacle` | Same as the body but a little lighter, with a stronger rim, so tentacles read against the body. | base `#240F33`, rim `#BF59FF` | base `#0F2633`, rim `#59D9FF` |
| `M_TentacleTip` | **Emissive**: set *Emission Color* and *Emission Strength* (1.0). It glows through the game's glow layer. | `#33FFBF` | `#FF59D9` |
| `M_Eye` | **Emissive** lime iris; pupils use the body material or plain black. | `#BFFF4D` | `#BFFF4D` |
| `M_Spine` (evolved) | Slightly lighter blue-grey gloss with a faint emissive. | — | base `#33525F`, emission `#0A2933` |

Enter the hex codes in Blender's colour picker *Hex* field (Blender treats hex as display colour, which is what these are). Rim colours are not a Blender setting: the game applies them. They're listed so you can preview the look by eye.

Textures, if you paint any: base colour only, 512 × 512, keep it dark, and use it for subtle mottling or veins, not contrast. Bright detail on the body fights the silhouette.

### 6. Animations

Set the scene frame rate to **30 fps** (*Output Properties → Frame Rate*). Each animation is a separate Blender **Action** on the `Creature` armature, named **exactly** as below. Both forms need the same set.

| Name | Type | Length | What it shows | How the game plays it |
| --- | --- | --- | --- | --- |
| `idle` | Loop | about 2 s (60 frames) | Slow breathing bob (about 5 cm), legs shifting weight, mantle sway, a blink. | Plays when the creature stands still; cross-fades with `move` by speed. |
| `move` | Loop | about 0.6 s (18 frames) for one full gait cycle | Scuttle **in place** at **3 m/s**: legs alternate in two groups, body leans forward about 10° and bobs. | Playback speed scales with movement speed (×0.6 to ×2). Make the feet travel about 1.8 m per cycle relative to the body, or they'll look like they slide. |
| `capture` | Loop | about 1 s (30 frames) | Hunched toward the front, mantle pulsing as it draws in. **Small motion** layered on top of idle or move. | Layered on (additive) while any tentacle holds a target. |
| `gulp` | One-shot | about 0.35 s (10 frames) | Body squashes then swells, as if swallowing. | Layered on when a capture completes. |
| `hurt` | One-shot | about 0.35 s (10 frames) | Recoil backward with a flinch. | Layered on when a guard or the boss hits it. |
| `evolve` | One-shot | larval about 0.5 s; evolved about 0.6 s | Larval: convulse and swell. Evolved: unfurl from a crouch, crest spines rise from flat. | Larval `evolve` plays, the model swaps under the particle burst, then evolved `evolve` plays (about 1.1 s total, the same as today). |

Rules:

- **Loops:** the first and last frames must be identical.
- **Layered animations** (`capture`, `gulp`, `hurt`) are applied as *differences* from their **first frame**. **Frame 1 must be the rest pose**, and `gulp` and `hurt` must also **end** on the rest pose. Keep their motion small. If they're big, they double up on top of `move`.
- **Never animate `root`** moving or turning, or the creature will drift away from its collision circle.
- Don't animate the tentacle, the sockets' positions relative to `body`, or object-level transforms. Animate bones only.

### 7. Blender → GLB export

Export each form to its own file: **`creature_larval.glb`** and **`creature_evolved.glb`**. Both files use the same object, bone, material and animation names.

Before exporting:

1. Select the body mesh and the tentacle and press **Ctrl+A → All Transforms**, so rotation is 0 and scale is 1. Do the same for the armatures before skinning.
2. Check the object names: `Creature` (armature), body mesh (any name), `Tentacle`, `TentacleRig`, `socket.tentacle.0` to `socket.tentacle.7`.
3. In the Action editor, every action has the **shield (Fake User)** icon on, so unused actions aren't dropped.
4. Put the armature back in its rest pose (frame 1 of `idle` is fine).

*File → Export → glTF 2.0 (.glb/.gltf)*. The option names below are from Blender 4.x; newer versions keep the same groups.

| Section | Setting |
| --- | --- |
| Format | **glTF Binary (.glb)** |
| Include | **Limit to: Selected Objects** (select the armatures, meshes and socket empties of one form). Untick cameras, lights and custom properties. |
| Transform | **+Y Up: on** |
| Mesh | **Apply Modifiers: on** (so Mirror and Subdivision are baked). UVs on, Normals on. Tangents only with a normal map. Vertex colours off unless you used them. |
| Material | **Export**; Images: **Automatic** (PNG or JPEG). |
| Compression | **Off** (no Draco). The game will add compression in a later pipeline step with decoders it can cache offline. |
| Data → Armature | **Export Deformation Bones Only: on**. |
| Data → Skinning | On. Leave *Include All Bone Influences* **off** (limits to 4). |
| Animation | On. **Mode: Actions**. **Always Sample Animations: on**. Leave the sampling rate at 1. |
| Shape keys | Off (unless you deliberately used them). |

Put the exported files in **`public/models/`** in the repo. Keep the `.blend` source in **`assets/creature/creature.blend`** (with textures beside it, not packed). If the `.blend` grows past about 20 MB, tell Claude and we'll move it to Git LFS.

**Checking a file** before trying it in the game:

```bash
npx @gltf-transform/cli inspect public/models/creature_larval.glb
```

That lists meshes, triangle counts, materials, textures and animations, so you can check them against sections 3 to 6. Dropping the file on <https://sandbox.babylonjs.com> shows it in Babylon itself, with an animation picker.

---

## Part 2: Loading the GLB in the game (code plan)

The goal: the game uses the GLB when it's present and valid, and the current procedural creature otherwise. Tentacle targeting stays entirely in the game. Nothing in the simulation or the save changes: this is render-only work in `src/render`, so it isn't a high-risk change under the save rules. It still gets a reviewer pass because it touches the hot render loop and adds a dependency.

### Shape of the change

1. **Extract an interface** from `CreatureView`, with no change in behaviour:

   ```ts
   interface CreatureLook {
     readonly root: TransformNode;
     setForm(tier: number, animate: boolean): void;
     gulp(): void;
     hurt(): void;                 // new; procedural version maps to gulp()
     update(dt: number, x: number, z: number, vx: number, vz: number, goals: Array<Vector3 | null>): void;
     dispose(): void;
   }
   ```

   Today's class becomes `ProceduralCreature`. The renderer holds a `CreatureLook` and calls `hurt()` on `playerHit` instead of `gulp()`.

2. **Move the tentacle curve into a pure module** (`render/tentacleCurve.ts`): the extension smoothing and the Bézier-plus-wiggle path from today's `Tube.set` and arm code, returning sample points and tangents. Both creatures use it, so GLB tentacles move exactly like today's. It has no Babylon dependency, so it gets Vitest tests (endpoint lands on the goal, wiggle vanishes at both ends, retraction reaches zero).

3. **Add `GltfCreature`** (`render/gltfCreature.ts`), built from one loaded asset container per form:
   - **Body:** instantiated from the container, positioned and turned each frame exactly as today (heading follows velocity).
   - **Animations:** `idle` and `move` cross-faded by speed with move's speed ratio set to `speed / 3`, clamped 0.6 to 2. `capture`, `gulp` and `hurt` are converted with Babylon's `AnimationGroup.MakeAnimationAdditive` and layered by weight. `evolve` overrides while it plays.
   - **Tentacles:** `Tentacle` + `TentacleRig` are cloned once per slot (8) with `instantiateModelsToScene`, so each has its own skeleton. Every frame, for each slot with a goal, the game picks the socket facing the target, samples `tentacleCurve` at 10 points from the socket to the goal, and writes each bone's position and rotation (aligning the bone's +Y to the curve tangent; converted to the parent bone's local space). Bone spacing does the stretching. Bone X/Z scale is `1 / sqrt(stretch)` to thin it. Idle slots are hidden, as today.
   - **Materials:** looked up by name. Babylon loads glTF materials as PBR, which looks flat black without an environment map. So, in the first pass, the game **replaces** `M_Body`, `M_Tentacle` and `M_Spine` with today's glossy `StandardMaterial` with a Fresnel rim, keeping any authored base-colour texture. Rim and tip colours come from the per-form palette, as now. Tip and eye emissive come from the file and feed the existing glow layer. A PBR + small environment-map version can be compared later in the visual review.
   - **Shadows:** the body mesh and tentacles are added as shadow casters, as today.
   - **Evolution:** both forms are loaded up front. `setForm(1, true)` plays larval `evolve`, swaps visibility at the peak of the particle burst, then plays evolved `evolve` (about 1.1 s total). `setForm(tier, false)` (loads, dev devolve) swaps instantly.

4. **Loading and fallback** (`render/creatureAssets.ts`):
   - The renderer **starts with `ProceduralCreature` immediately**, so the game is playable before any download finishes, and starts loading both GLBs in the background.
   - The renderer fetches each file as bytes from `/models/creature_<form>.glb`. A missing file or a body that doesn't start with the `glTF` magic bytes counts as **missing**. (Vite's dev server answers missing paths with `index.html` and status 200, so the status code alone isn't enough.) Only then does it dynamic-import `creatureAssets` and the glTF loader from **`@babylonjs/loaders`** (pinned to the same version as `@babylonjs/core`; only the glTF loader is registered), so a game without model files never downloads loader code. Loading uses `LoadAssetContainerAsync` with `animationStartMode: NONE`, and nothing is added to the scene until the GLB creature uses it.
   - The container is **checked against the contract** (`render/creatureContract.ts`). Required: a `Creature` node, a `body` bone, at least one `socket.tentacle.N`, and the `idle` and `move` animations; a `Tentacle` that is present must have exactly the 10 tentacle bones. Warnings (the file still loads): no `root` bone, fewer than 8 sockets, missing optional animations, no tentacle, over the triangle budget. So the one-bone greybox from Part 3 loads. Blender's `.001` duplicate names get a "rename it" hint. The checker works on a plain summary (names and counts), so it's unit-tested without Babylon.
   - **Each form falls back independently.** Missing file: procedural, logged with `console.info`. Invalid file: procedural, with a `console.warn` listing every problem. Missing optional pieces degrade instead: no `hurt` falls back to `gulp`, and no `Tentacle` uses today's procedural tubes on the GLB body. This lets you ship the larval form before the evolved one exists.
   - When a form loads, the renderer swaps it in at the start of the next frame (copying heading and current form), then disposes the procedural meshes it no longer needs.
   - Files under `public/` aren't bundled, so the build never fails because a model is absent. The offline service worker (Milestone 1) will precache `/models/*.glb`.

5. **Dev tools:** the Dev panel shows the creature source per form (`GLB`, `procedural (no model)`, `procedural (invalid: …)`; the console lists each problem), and `?creature=procedural` forces the fallback for side-by-side comparison. Neither ships in production.

### Order of work

| Step | Work | Check |
| --- | --- | --- |
| 1 ✅ | Extract `CreatureLook` and `tentacleCurve`; no visible change | Tests, typecheck, build; the game looks identical on port 5200 |
| 2 ✅ | Loader, magic-byte check, contract checker, fallback | Unit tests for the checker; with no files present the game is unchanged and logs "missing" |
| 3 | `GltfCreature` body, sockets and idle/move, using your **greybox** export (Part 3, step 2) | Scale against humans, facing direction, feet on the floor, in the browser at the mobile preset |
| 4 | Tentacle bone driving | Extend, bend, attach and retract with 1 to 8 tentacles; the boss's multi-tentacle capture |
| 5 | Layered capture, gulp and hurt; evolution swap; material overrides | Visual review through the game camera |
| 6 | Performance | Stress case (150 targets, 8 tentacles) stays at 30+ FPS; draw calls and triangle count noted in the roadmap's budgets |

Browser checks happen on the `dev-test` server (port 5200) at the 375 × 812 mobile preset, never in the port 5199 game tab.

---

## Part 3: A first-pass Blender workflow

For someone new to Blender. Aim for a **rough but complete** larval creature that loads in the game first, then improve it. Don't polish anything until the whole pipeline (model → rig → animate → export → in game) has worked once.

**Version:** the current Blender LTS release from blender.org. **Learning:** Blender's free official *Blender Fundamentals* video series covers the interface, modelling and rigging basics; Grant Abbitt's beginner series on YouTube is a good, slower-paced alternative. You need only the interface, Edit Mode, modifiers, armatures and the Action editor.

### Step 0: Set up the scene (about 30 minutes)

1. New *General* file. Delete the default cube. Save as `assets/creature/creature.blend`.
2. *Output Properties → Frame Rate: 30*. *Scene Properties → Units*: Metric, Unit Scale 1.0.
3. Add **scale references** on a hidden-from-export collection called `_ref`: a 0.4 × 0.3 × 1.6 m box for a human, standing 2 m in front of the origin; a cylinder of radius 0.6 m (the collision circle); a circle of radius 1.9 m on the floor (starting capture reach).
4. Add the **game camera**: location `(0, 12, 16)`, pointing at the origin (add a *Track To* constraint aimed at an empty at the origin), *Sensor Fit: Horizontal*, *Field of View: 35.5°*, output resolution 750 × 1624 (portrait). Press numpad 0 to look through it. Rotate the creature in Z to check it from every heading; that's how the game sees it.

### Step 1: Block out the body (an evening)

1. Add a **UV sphere** for the body; scale it to about 1.4 × 1.5 × 1.15 m and move it up so its centre is 0.85 m above the floor. Add a second squashed sphere for the mantle, tilted back.
2. Add a **Mirror modifier** (X axis) so you only model the left half, and a **Subdivision Surface modifier** (level 1) for smoothness.
3. Two small flattened spheres for eyes, on the front (the −Y side).
4. **Legs:** start with one leg from a cylinder of 6 to 8 sides with 4 to 5 loops, bent into an arch (hip → knee about 0.55 m up → foot 1.15 m from centre). Taper it with scaling in Edit Mode. Duplicate (Shift+D) and rotate around the origin for all six. Join the body, mantle, eyes and legs into one mesh (Ctrl+J), or keep the eyes separate if that's easier; both work.
5. Check the triangle count against the budget and the look through the game camera. Too heavy: lower the subdivision level or add a *Decimate* modifier.

### Step 2: Export a greybox (15 minutes; worth doing early)

Before rigging, add a single bone armature named `Creature` with one bone `body`, parent the mesh to it (*Ctrl+P → With Automatic Weights*), make a 2-frame `idle` and `move` that don't move anything, add one `socket.tentacle.0` empty, and export with the section 7 settings. Ask Claude to wire it in (Part 2, steps 1 to 3). Seeing your mesh in the game this early catches scale, orientation and export mistakes while they're cheap to fix.

### Step 3: Tentacle (an evening)

1. Add a **cylinder** with 8 sides, 1.5 m tall, its base at the origin, pointing up (+Z). Add about 16 edge loops (Ctrl+R) along its length. Taper the top in Edit Mode with proportional editing (O). Give it a slightly bulbous or curled tip.
2. Select the top 15 to 20% of faces and assign `M_TentacleTip`; the rest gets `M_Tentacle`.
3. **Armature:** add a bone at the base pointing up, then in Edit Mode extrude (E) 9 more times to make 10 bones up the tentacle. Rename them `tentacle.00` to `tentacle.09`. Name the armature `TentacleRig` and the mesh `Tentacle`.
4. Parent with *Ctrl+P → With Automatic Weights*. Test: in Pose Mode, rotate a few bones; it should bend smoothly. Reset the pose (Alt+R, Alt+G) when done.

### Step 4: Rig the body (an evening or two)

1. Apply all transforms on the mesh (Ctrl+A → All Transforms).
2. In the `Creature` armature: `root` at the origin; `body` from the body centre upward; `mantle` as a child of `body`; three bones per leg (`leg.N.a/b/c`) following each leg's arch, parented hip to `body`. Turn on X-Axis Mirror in the armature's Edit Mode tool settings to build both sides at once, then fix the names to match section 4.
3. Parent the mesh with automatic weights. In Pose Mode, move each bone and fix any wrong deformation in Weight Paint mode.
4. Add the 8 `socket.tentacle.N` empties around the lower front of the body, and parent each to the `body` bone (*Ctrl+P → Bone* with the bone active).
5. Optional, but it makes leg animation much easier: add an **IK constraint** on each `leg.N.c` with a non-deforming target bone at each foot. Untick *Deform* on those control bones.

### Step 5: Animate (a weekend)

1. Open the **Action editor** (Dope Sheet → Action Editor). Click *New*, name it `idle`, and turn on its shield (Fake User).
2. Pose, select bones, press **I** to key them. Frame 1 rest pose, frame 30 breathe in, frame 60 same as frame 1. Play with Space.
3. Make `move`, `capture`, `gulp`, `hurt` and `evolve` the same way, each a *New* action, following the table in section 6. For `move`, animate the legs in two alternating groups of three; key the feet lifting and planting.
4. Look at each action through the game camera at the game's scale; if a motion isn't obvious from there, exaggerate it.

### Step 6: Export and hand off

1. Run through the section 7 checklist and export `public/models/creature_larval.glb`.
2. Run the `gltf-transform inspect` command and compare triangle counts, materials and animation names with this brief.
3. Tell Claude it's there. It will load it on the dev-test server and report anything the contract checker rejects.
4. Then repeat steps 1 to 6 for the evolved form: duplicate the larval `.blend` collection, scale it up, add the two legs, the crest, side spines and extra eyes, and re-skin. Keep every name the same.

### Common beginner mistakes

| Symptom in the game | Likely cause |
| --- | --- |
| Creature is huge, tiny or lying on its side | Unapplied scale or rotation (Ctrl+A → All Transforms before rigging), or *+Y Up* off at export |
| Faces dark or see-through in places | Flipped normals: in Edit Mode, select all and press Shift+N |
| An animation is missing | Its action had no Fake User and got dropped, or it was named `idle.001` |
| Mesh stretches toward the origin when animated | Some vertices have no bone weights; check in Weight Paint mode |
| Creature drifts or slides | `root` was animated, or the `move` cycle's feet don't travel about 1.8 m per cycle |
| Extra bones or objects in the file | *Limit to Selected* off, or control bones left as *Deform* |
