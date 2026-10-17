# Refined four-stage lineage — 2026-10-16

Implemented at the user's request: refine all four existing models, smooth their animation and simplify the Apex. The game's four model URLs now contain these exports; tier mapping, gameplay, economy and saves are unchanged.

| Stage | Triangles | Editable source | Export |
|---|---:|---|---|
| Hatchling | 3,819 | `hatchling/tendon-stalker-rigged.blend` | `hatchling/creature_larval.glb` |
| Juvenile | 5,015 | `juvenile/tendon-stalker-juvenile.blend` | `juvenile/creature_juvenile.glb` |
| Adult | 5,567 | `adult/tendon-stalker-adult.blend` | `adult/creature_adult.glb` |
| Apex | 4,363 | `apex/tendon-stalker-apex.blend` | `apex/creature_apex.glb` |

All forms retain 27 bones, five materials, eight capture sockets, normalized skin weights and six in-place clips. The original source `.blend` files remain intact in their original directories. `previous-runtime/` preserves the replaced exports and available measurement reports. Parent-directory GLBs/reports are current copies; older parent-directory previews and Blender sources describe the earlier versions.

## Visual and animation changes

- Apex arm refinement: increased the front-arm cross-section by 50% around the existing joint centerline. Replaced the front hooks/opposing claws and mandibles with thicker roots tapering into longer, sharp hooked tips. Retained the larger head horns, lowered back horns, tail spike, corrected foot bindings and clip timing. Previous Apex source/export/report are preserved with `before-arm-refinement-` filenames in `apex/`. Other forms are unchanged.
- Arm follow-up validation: all 16 targeted Apex/Stalker tests passed, including the exported foot-binding regression. Native idle/move/capture loops close; walking/turning/capture/gulp inspected in the real runtime review, including 375×812, with no console errors or obvious clipping in the reviewed poses. Refreshed the comparison images/animation. Current export and editable source are local; no deployment.
- Tail/foot follow-up: added an ivory terminal spike to the Apex, rigidly attached to `tail.3`. Fixed the shared rig's foot-side parser: the toe index `-1` on a right foot was incorrectly interpreted as the left-side marker. Regenerated all four forms so the claw no longer follows the opposite leg. A new exported-skin regression check failed against all four previous exports and passes against the corrected models. All 22 model tests, TypeScript checking and Vite production bundling pass (existing large Babylon chunk warning); native loop checks and refreshed 375×812 browser walking/turning review also pass. Other anatomy and clip timing are retained. Comparison previews regenerated; changes remain local.
- Follow-up horn adjustment: the user requested larger Apex head horns and a lower back-horn arc. Replaced the small temple points with longer swept skull horns and lowered/extended the mantle pair rearward. The other three forms and all animation clips are unchanged. The first refined Apex source/export/report are preserved with `before-horn-adjustment-` filenames in `apex/`.
- Horn follow-up checks: all 12 targeted Apex/Stalker asset tests passed. The current GLB matches the shipped copy, retains 27 bones/eight sockets/six clips, and passes native loop-closure checks. Reviewed walking at 375×812 in the runtime model viewer with no console errors; comparison sheet and motion preview regenerated. The earlier 606-test result below belongs to the initial four-stage refinement.
- Smooth organic tissue, hooks and glow surfaces; retain readable chitin planes with slightly softer edges. Remove tiny teeth that disappear at gameplay distance.
- Adult: remove one secondary crown layer per side.
- Apex: rebuild from the lineage anatomy with one broad swept mantle pair and one broad side shield per side. Remove stacked adult crowns, added shoulder layers, extra horns and secondary grown jaw/arm hooks. Retain four walking legs, two resting capture arms, the curled tail and mint wedge-skull seam. About 38% fewer triangles than the previous 6,999-triangle Apex.
- Double animation sampling to 60 Hz while retaining original clip durations. Use a Hermite swing trajectory whose forward/back velocity meets the stance velocity continuously; soften foot lift/landing, reduce body bounce, plant idle feet, and offset successive tail segments for delayed motion.
- Capture tubes remain the existing procedural renderer. The Apex remains one skinned mesh, not a completed modular cosmetic kit; attachment parts, tint editing and customization progression are future work.

## Rebuild and preview

Run Blender in a separate background process with `--python art/blender/refine_four_stages.py -- <stage>` for each stage. This deliberately reads the original hatchling source and existing generation scripts. A guarded source patch fails if its expected generator snippets change. Native editable outputs go only into this `refined/` directory.

After reviewing exports, copy each GLB into its original art directory and the matching `public/models/` filename; juvenile is shipped as `creature_evolved.glb`. Copy current measurement reports with the art exports. Preserve old exports before replacement.

`art/blender/preview_refined_stages.py` loads each saved refined source, checks loop closure and renders the motion frames. `art/blender/build_refinement_sheet.py` assembles [the still sheet](lineage-review.png) and [the animated sheet](lineage-motion.gif). `animation-qa.json` records native pose-loop closure; move duration remains 23/30 seconds.

With the isolated Vite test server running on port 5200, open `/tools/creature-review.html` to inspect all four shipped models using the actual Babylon loader and creature view. It supports idle/walk/run, capture, turns, gulp, hurt and camera orbit. It never opens a save store and is outside the production app entry point.

## Validation and handoff

- All 606 tests across 32 files passed, including actual GLB loading, form switching/fallback, exported-file identity and existing planted-gait checks.
- TypeScript checking and production Vite bundling passed; the existing Babylon chunk-size warning remains. Two missing type-only Node import annotations in the legacy fixture test were aligned with existing repository conventions.
- Native idle, move and capture loops close within 1e-5 matrix error for every stage. Maximum authored foot-target errors are below 3e-7 metres. These are numerical export/pose checks, not a claim of perfect visual foot planting under all runtime blends or turns.
- Browser: all four exports loaded in the real game on the isolated test origin. The separate review page was inspected at 375×812 for every stage; Apex capture, Adult running/turning and stage switching worked without console errors. Physical-device performance remains unverified.
- Claude CLI read-only review was attempted but failed with ECONNREFUSED; no independent Claude review was received.
- Remaining: user visual feedback, real-device gait/performance evaluation, and separately planned modular customization. No progression implementation, migration or deployment was performed.
