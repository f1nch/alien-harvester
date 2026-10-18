# Creature concept matching

2026-10-16. Accepted direction: continue toward the organic realism ImageGen concept. The existing organic pass is a baseline, not a close visual match. This document proposes the production sequence; no new sculpt or export is claimed complete.

## What actually needs changing

| Area | Current gap | Required work |
|---|---|---|
| Silhouette | Narrow, disconnected-looking volumes; straight angular appendages | Rebuild shoulder masses, elbow/wrist transitions, curved claws and tapered horn profiles against the concept |
| Anatomy | Smoothed tubes rather than muscle and tendon | Sculpt integrated shoulders, forearms, thigh/calf transitions, knuckles and tendon bundles |
| Armor | Broad flat shields and extruded strips | Shape layered skull plates, inset seams, irregular rounded edges and believable roots for horns/back plates |
| Surfaces | Generic mottling and weak fiber definition | Bake anatomy-specific normal maps, paint tissue/chitin/bone color variation and roughness; avoid uniform noise |
| Movement | Existing rig improved, but anatomy still drives a mechanical impression | Reweight rebuilt joints, preserve planted toes, animate shoulder weight transfer and delayed tail response |
| Presentation | Different camera/light from the concept | Compare matched three-quarter views, scale and neutral lighting before judging fidelity |

## Production sequence

1. Build an Apex sculpt study in a separate native source. Establish the concept's silhouette, shoulders, skull and claws in plain gray material first. Preserve the settled horns, low back sweep and tail spike. Check side and rear views as well as the concept view.
2. Build a clean game mesh around that sculpt; unwrap intentionally and bake the high-detail shape into normal maps. Start with 1K maps, consider 2K only if close-up comparison shows a visible benefit. Triangle budget changes require measurement; do not silently expand the current 12k target.
3. Match the dry fibrous plum tissue, worn gray chitin and ivory claws through color and roughness. Keep mint emission restrained.
4. Transfer the existing rig, correct skin weights and rework movement around the new volumes. Retain eight capture sockets and six clips; validate idle/walk/run/capture, foot contact and loop closure.
5. Review actual Apex runtime captures beside the concept. Extend the established anatomy/material construction to Hatchling, Juvenile and Adult once the Apex study is convincing.
6. Measure loading, frame rate and memory on physical mobile hardware before replacing the deployed assets.

## Acceptance and limits

Judge silhouette and major masses first, joints and armor second, surface detail third. A sharper texture cannot correct the wrong shape. Compare actual exports, not generated mockups. Preserve separate source and release assets until reviewed.

Near matching the concept's appearance from its illustrated view is the target. A literal pixel-identical animated 3D asset from every view is not defined by a single generated image: hidden geometry, some attachment details and lighting must be resolved consistently. These interpretations should be recorded during the Apex study.

Handoff (2026-10-16): user authorized proceeding, then rejected detached parts and requested a more alien, frightening result. The [latest separate Apex study](../art/alien/tendon-stalker/concept-study-v2/apex/README.md) has connected tissue roots, seated armor, layered skull plates, sharp rooted blades/mandibles and front claws with shared knuckles. Removed floating trim and the old chest bars; recessed/darkened the mouth. The 11,596-triangle export retains the rig; one connected tissue surface, native loops and browser loading were verified. This remains a procedural study, not a close concept reproduction. Further fidelity/deformation work, the other stages and physical-device measurements remain pending. The default game assets remain unchanged by this study.

Handoff (2026-10-18): the [four-stage connected surface study](../art/alien/tendon-stalker/surface-lineage/README.md) is complete as a local review artifact. Each stage has a native source, GLB, baked fiber/chitin/bone surfaces, actual stills and walk previews. Rest matrices, foot-side bindings, weights, asset contracts and native loops pass; 36 creature tests, typecheck and build pass. This pass retains the prior smoothed motion. Closer concept sculpting and deformation polish remain necessary; physical-device performance and visual acceptance are unverified. No default asset replacement, push or deployment.

Handoff (2026-10-18, eyes/pincers): accepted user direction now implemented in the separate [feature-lineage study](../art/alien/tendon-stalker/feature-lineage/README.md). Each evolution increases visible eye extent and develops broader scorpion chela palms with opposing curved fingers. Previous anatomy/surface studies remain intact. New exports retain skeletons and motion; separately animated pincer fingers are not implemented. All 41 creature tests, typecheck and build pass. No deployment.
