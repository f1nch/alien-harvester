# Tendon Stalker apex — runtime asset and preserved blockout

**Superseded visually on 2026-10-16:** `creature_apex.glb` and `rig-report.json` now copy the [refined Apex](../refined/README.md), with 4,363 triangles and one broad mantle pair. The current editable source is `../refined/apex/tendon-stalker-apex.blend`. The older rigged source, blockout and previews described below remain historical references; the previous runtime export is backed up under `../refined/previous-runtime/apex/`.

Built and integrated in Blender 4.5 on 2026-10-15. The runtime apex now appears at existing evolution tier 3 (Devourer) and above; adult remains tier 2. Progression costs, stats and saves are unchanged.

## Runtime

- Editable rig: `tendon-stalker-apex-rigged.blend`; export: `creature_apex.glb`, also copied byte-for-byte to `public/models/creature_apex.glb`.
- One skinned mesh, five materials, 6,999 triangles, 27 bones, eight bone-parented capture sockets; all vertices have normalized skin weights.
- Six in-place clips: idle, move, capture, gulp, hurt and evolve. The proven adult rig, planted gait, clip timing and gait-speed metadata are reused; added apex geometry is weighted to the relevant body, mantle, jaw, capture-arm and tail bones. This is a shared gait, not a newly authored apex locomotion set.
- The curled tail plates were seated on their tail segments for the runtime version.
- Runtime previews: `preview-runtime.png`, `preview-runtime-walk.png`; mobile verification: `game-mobile.png`.
- Rebuild: `art/blender/rig_stalker_apex.py` in background Blender. Its input is `apex-runtime-source.blend` (a snapshot of the user's live blockout scene), falling back to the preserved blockout if absent. It writes separate runtime outputs.

All 448 tests, TypeScript checking and production build pass. Real GLBs are checked for skin weights, clips, four-form switching, fallback, delayed loading, disposal and shipped-file identity. Mobile browser verification at 375 × 812 showed evolution into Devourer, apex loading and subsequent captures with no console errors. Capture tubes remain procedural. Physical-device performance and further silhouette/animation polish remain open.

## Preserved initial blockout

- Source: `tendon-stalker-apex-blockout.blend` (one apex scene; separate armor/organ meshes).
- Review export: `tendon-stalker-apex-blockout.glb` (static, no skeleton or clips; intentionally outside `public/models`).
- Previews: `preview-three-quarter.png`, `preview-side.png`, `preview-top.png`.
- Complexity: 42 mesh objects and 7,143 triangles. This is an initial geometry count, not a final mobile performance result.
- Rebuild: run `art/blender/create_stalker_apex.py` with Blender's `--background --python` options. It reads the adult source and writes only this apex directory.

The adult-derived foundation keeps the wedge skull, mint crest, two capture arms, four walking legs and tail. The new silhouette adds a wider split mantle crown, overlapping lateral armor, hooked jaw guards, forearm blades, chest ribs and dorsal tail plates. Individual added parts remain editable for silhouette refinement.

The static blockout remains intact as an editable design reference. Runtime integration uses the separately rigged export above, not this static review GLB.
