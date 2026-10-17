# Tendon Stalker evolution assets

**Current refinement (2026-10-16):** all four runtime GLBs now use the [refined lineage](refined/README.md): smoother tissue shading, 60 Hz animation sampling with continuous swing velocity and planted idle feet, reduced Adult crown layers and a simpler Apex mantle. Current triangles: 3,819 / 5,015 / 5,567 / 4,363. Editable current sources and previews live in `refined/`; original `.blend` sources and earlier descriptions below are preserved history. All 606 tests, typecheck and Vite build pass. No gameplay/save changes.

## Current runtime asset

`tendon-stalker-rigged.blend` is the editable rigged version. `creature_larval.glb` is its export, also copied to `public/models/creature_larval.glb` for the game.

The current runtime model has 3,947 triangles, 27 bones, one mesh with five materials, eight bone-parented capture sockets, and six clips: idle, move, capture, gulp, hurt and evolve. Every vertex is weighted. Animations stay in place, and the game drives position and heading. `rig-report.json` records the export's measurements.

The game's `GltfCreature` view displays this hatchling at tier 0, juvenile in the `evolved` slot at tier 1, adult at tier 2, and apex at tier 3 and above. It blends idle/walk, plays additive feedback clips, and reuses procedural capture tubes rooted at the authored sockets. Optional independently skinned capture tentacles are not supplied yet.

Verification: actual exported file loaded through Babylon's loader and passed the asset contract; procedural fallback and return tested; 213 tests and typecheck passed. Production build passed with a large Babylon bundle warning. Browser checked at 375 × 812: model visible, movement and a worker capture successful, no browser errors. `game-mobile.jpg` is the verification screenshot. Real-device frame rate and foot sliding still need evaluation; the gait and detail are a first pass.

Build the runtime variant with `art/blender/rig_tendon_stalker.py` through Blender MCP after the blockout collection is present.

## Juvenile and adult

Both forms are complete stylized low-poly assets with editable Blender files, skinned GLB exports, eight capture sockets, 27 bones and the same six animation clips as the hatchling. Every vertex is weighted. Three-quarter idle, walking pose and side renders are stored alongside each export.

| Stage | Blender file | GLB | Triangles |
| --- | --- | --- | --- |
| Juvenile | `juvenile/tendon-stalker-juvenile.blend` | `juvenile/creature_juvenile.glb` | 5,143 |
| Adult | `adult/tendon-stalker-adult.blend` | `adult/creature_adult.glb` | 5,783 |

The juvenile rises from the hatchling crouch, gains swept shoulder blades, layered flank armor, longer mandibles, exposed neck tendons and a rib-framed chest seam. The adult rises further and develops a larger segmented shoulder crown and additional grasping hooks. Both retain two capture arms, four walking legs, one tail, a wedge skull and the mint crest. Growth changes anatomy and posture as well as size.

`public/models/creature_evolved.glb` is a copy of the juvenile export. `public/models/creature_adult.glb` is a byte-identical copy of the adult export, used at the existing Ravager evolution (tier 2). The apex takes over at tier 3 and above. Evolution costs, stats, requirements and save format are unchanged. Each model loads independently with procedural fallback if its own file is missing or invalid; adult and apex each use an 8,000-triangle body budget.

Rebuild using `art/blender/create_stalker_evolutions.py` through Blender MCP with the hatchling source collection loaded. The script reuses the rig workflow, grows geometry and bones together, and saves each stage separately. These are game-scale interpretations of the concept, with material colors rather than baked high-detail tendon textures. The animation gait is authored without IK; physical-device performance and foot sliding remain to be evaluated.

Validation updated 2026-10-15: all 441 tests pass, including actual GLB loading, three-form switching, independent fallback, delayed adult loading, disposal and shipped-file identity; TypeScript and production build pass. Mobile browser check at 375 × 812 confirmed evolution into the adult and subsequent captures with no console errors (`adult/game-mobile.png`). The build retains the existing large Babylon chunk warning. Capture tubes remain procedural by design.

## Apex integrated (2026-10-15)

The [apex runtime asset](apex/README.md) now renders at existing tier 3 (Devourer) and all higher tiers. It has 6,999 triangles, 27 bones, eight capture sockets, five materials and six in-place clips reused from the adult rig, with separately weighted new armor and organs. The original 42-part static blockout is preserved alongside the rigged `.blend`, runtime GLB and previews. All four forms have independent loading and fallback. Validation: all 448 tests, TypeScript and build pass; apex evolution and captures checked in the mobile browser with no console errors.

## Preserved hatchling blockout

Selected lineage modeled in Blender through MCP using `art/concepts/04-tendon-stalker-hatchling-views.png` as concept guidance.

Files: editable `tendon-stalker-hatchling.blend`, static `tendon-stalker-hatchling.glb`, and front, side, top and three-quarter PNG previews. Earlier alien concepts remain separate.

The model has two hooked capture arms, four walking legs and one tail. Its wedge skull, crouching posture, swept chitin and mint forehead crest establish the chosen silhouette. `model-report.json` records complexity and anatomy. The export contains one scene and only this model.

This earlier static blockout has 81 editable mesh parts. Keep its `tendon-stalker-hatchling.glb` separate from the rigged runtime export: it does not meet the skeleton and animation contract. Sculpted tendons and plate transitions can be developed further on the chosen design.

Generation: `art/blender/create_tendon_stalker.py`. A crest visibility repair used `art/blender/refine_stalker_core.py`; final exported mesh counts are in the report.
