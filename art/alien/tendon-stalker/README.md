# Tendon Stalker hatchling

## Current runtime asset

`tendon-stalker-rigged.blend` is the editable rigged version. `creature_larval.glb` is its export, also copied to `public/models/creature_larval.glb` for the game.

The runtime model has 3,203 triangles, 27 bones, one mesh with four material primitives, eight bone-parented capture sockets, and six clips: idle, move, capture, gulp, hurt and evolve. Every vertex is weighted. Animations stay in place, and the game drives position and heading. `rig-report.json` records the export's measurements.

The game's `GltfCreature` view displays this hatchling, blends idle/walk, plays additive feedback clips, and reuses procedural capture tubes rooted at the authored sockets. The evolved slot now uses the juvenile model described below. Optional independently skinned capture tentacles are not supplied yet.

Verification: actual exported file loaded through Babylon's loader and passed the asset contract; procedural fallback and return tested; 213 tests and typecheck passed. Production build passed with a large Babylon bundle warning. Browser checked at 375 × 812: model visible, movement and a worker capture successful, no browser errors. `game-mobile.jpg` is the verification screenshot. Real-device frame rate and foot sliding still need evaluation; the gait and detail are a first pass.

Build the runtime variant with `art/blender/rig_tendon_stalker.py` through Blender MCP after the blockout collection is present.

## Juvenile and adult

Both forms are complete stylized low-poly assets with editable Blender files, skinned GLB exports, eight capture sockets, 27 bones and the same six animation clips as the hatchling. Every vertex is weighted. Three-quarter idle, walking pose and side renders are stored alongside each export.

| Stage | Blender file | GLB | Triangles |
| --- | --- | --- | --- |
| Juvenile | `juvenile/tendon-stalker-juvenile.blend` | `juvenile/creature_juvenile.glb` | 4,399 |
| Adult | `adult/tendon-stalker-adult.blend` | `adult/creature_adult.glb` | 5,039 |

The juvenile rises from the hatchling crouch, gains swept shoulder blades, layered flank armor, longer mandibles, exposed neck tendons and a rib-framed chest seam. The adult rises further and develops a larger segmented shoulder crown and additional grasping hooks. Both retain two capture arms, four walking legs, one tail, a wedge skull and the mint crest. Growth changes anatomy and posture as well as size.

`public/models/creature_evolved.glb` is a copy of the juvenile export, used by the existing two-form gameplay. The adult is ready as an asset; the game still has only two gameplay forms, so adding a third progression tier is separate work. The apex and alternate alien lineages are not part of these two models.

Rebuild using `art/blender/create_stalker_evolutions.py` through Blender MCP with the hatchling source collection loaded. The script reuses the rig workflow, grows geometry and bones together, and saves each stage separately. These are game-scale interpretations of the concept, with material colors rather than baked high-detail tendon textures. The animation gait is authored without IK; physical-device performance and foot sliding remain to be evaluated.

Final validation: 215 tests pass, including both actual GLB exports loaded through Babylon, skin bounds and form switching; TypeScript and production build pass. The build retains the existing large Babylon chunk warning. Browser console confirms hatchling and juvenile loaded with no errors. Capture tubes remain procedural by design.

## Preserved blockout

Selected lineage modeled in Blender through MCP using `art/concepts/04-tendon-stalker-hatchling-views.png` as concept guidance.

Files: editable `tendon-stalker-hatchling.blend`, static `tendon-stalker-hatchling.glb`, and front, side, top and three-quarter PNG previews. Earlier alien concepts remain separate.

The model has two hooked capture arms, four walking legs and one tail. Its wedge skull, crouching posture, swept chitin and mint forehead crest establish the chosen silhouette. `model-report.json` records complexity and anatomy. The export contains one scene and only this model.

This earlier static blockout has 81 editable mesh parts. Keep its `tendon-stalker-hatchling.glb` separate from the rigged runtime export: it does not meet the skeleton and animation contract. Sculpted tendons and plate transitions can be developed further on the chosen design.

Generation: `art/blender/create_tendon_stalker.py`. A crest visibility repair used `art/blender/refine_stalker_core.py`; final exported mesh counts are in the report.
