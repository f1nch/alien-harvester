# Implementation status against GDD.md

**Latest visual update (2026-10-16):** all four runtime models use the [refined lineage](art/alien/tendon-stalker/refined/README.md). Current triangle counts are 3,819 / 5,015 / 5,567 / 4,363. Tissue shading and sampled gait were smoothed; idle feet stay planted, the Adult has fewer crown layers, and Apex has a simpler broad mantle. Original native sources and previous exports are preserved. All 606 tests, typecheck and Vite production bundling pass (existing large Babylon chunk warning). Browser review at 375×812 covered all four stages, movement, turns and Apex capture; native idle/move/capture loops close numerically. Claude's read-only review failed with connection refused. No gameplay, save schema or progression changes; real-device performance and modular cosmetic parts remain pending. The local save-free review is `/tools/creature-review.html` on the isolated test server.

Reviewed by ChatGPT on 2026-10-14. `GDD.md` is a draft design target; this inventory describes observed source behavior, not playtest results.

| Area | Current implementation and evidence | GDD target / unresolved difference |
| --- | --- | --- |
| Architecture | Vite, TypeScript, Babylon.js, Dexie; DOM HUD; `package.json`, `src/ui/hud.ts` | Three.js, React, ECS packages and optional API. Migration scope needs a decision. |
| Simulation | Fixed 30 Hz loop with pause/resume resetting accumulated time; `src/game/world.ts`, `src/game/loop.ts`, `src/main.ts` | 60 Hz target; confirm whether changing the existing simulation is intended. |
| Capture | Continuous capture progress based on power/resistance; nearest eligible targets need line of sight; cargo weight reserved before acquisition and targets skipped when they do not fit; `src/game/systems/capture.ts` | Discrete damage, armour, critical hits, absorption and recoverable overflow drops. |
| Death | First cargo-bearing death preserves cargo; later deaths remove unbanked cargo; `src/game/systems/combat.ts` | No resource loss on death. Changing this needs implementation and regression coverage. |
| Resources | Biomass, genetic material, parts, mutagen, crystals, alloy and amber; `src/content/currencies.ts` | Biomass, GS and RC. Existing persistent currency IDs must be preserved or explicitly migrated. |
| Saves | Schema v16, content version 1, validated migrations, IndexedDB backups and import/export; current save contract has no `saveId`, `revision` or `lastSavedAt`; `src/persistence/schema.ts`, `store.ts`, `transfer.ts` | Expanded save contract and optional cloud revision/conflict handling are proposed. Repository instructions currently forbid wall-clock timestamps in saves. |
| Progression | Biome definitions, quests, perks and evolution; `src/content/biomes.ts`, `quests.ts`, `perks.ts`, `evolution.ts` | Four-region campaign, EP, three mutation branches and research tree differ from current content. |

## Handoff

- ChatGPT owns this inventory and GDD collaboration updates for this pass.
- Claude completed a read-only GDD/source audit via the installed `claude` CLI in PowerShell. Its verified capture and save-contract observations are included above.
- Claude drafted `tools/pacing.ts` and wrote the initial pacing tests. ChatGPT recovered the draft after Claude's edit permission block, added the CLI and accounting edge-case coverage, and ran the measurements. No live gameplay, economy or persisted-state changes are included.
- Next design decision: choose whether the GDD describes an incremental adaptation of the existing game or a replacement architecture/campaign. Keep current implementation separate from targets until scope is agreed.

## Implemented opening pacing slice

A seeded headless harness now runs the current first floor using actual movement, capture, deposit, purchase and door actions. `npm run pacing` prints a JSON report; [usage and scope](docs/PACING.md) describe the policy and exclusions. Timing comparisons remain draft hypotheses, not resolved design decisions.

Measured on 2026-10-14 with a 600-second limit, stopping once all four milestones were reached. Times below are active simulation seconds, rounded to one decimal; the report retains exact tick counts.

| Seed | First upgrade | Third upgrade | First quest | First door | Ledger |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 | 32.3 | 104.3 | 15.8 | 121.8 | Balanced |
| 42 | 31.9 | 110.2 | 15.8 | 123.7 | Balanced |
| 2026 | 32.0 | 113.1 | 15.6 | 127.9 | Balanced |

The first purchase in these runs was capture power. Both draft timing comparisons were met by this profile. These results cover the current opening loop, not the proposed four-region campaign or real-player pacing.

Validation: all 433 tests across 28 files passed, including 26 pacing tests; TypeScript checking and the production Vite build passed. The build retained the existing Babylon bundle-size warning. A five-second run stopped at exactly 150 ticks with missing milestones reported as warnings. No tuning or migrations were made.

## Evolution visuals — 2026-10-15

The existing tier 2 (Ravager) and every higher tier now use `public/models/creature_adult.glb`; tier 0 remains hatchling and tier 1 remains juvenile. Claude handled render integration and initial tests; ChatGPT copied the exported asset, reviewed the integration, fixed test assumptions and verified the browser. No evolution requirements, economy, content IDs or save fields changed.

ChatGPT built a separate [apex Blender blockout](art/alien/tendon-stalker/apex/README.md): 42 editable meshes / 7,143 triangles, static review GLB, side/top/three-quarter renders. It is not rigged or animated and is not shipped as a runtime form. The saved Blender file was reopened successfully and inspected.

Validation: all 441 tests across 29 files, TypeScript and production build passed. At 375 × 812 on the isolated test origin, evolving into Ravager displayed the adult and captures continued; console had no errors, only the expected procedural-tentacle notices. Viewport override was reset. Physical-device performance remains unverified.

## Apex runtime integration — 2026-10-15

The apex is now the model for existing tier 3 (Devourer) and every higher tier; adult remains tier 2. This supersedes the earlier adult-at-all-higher-tiers mapping. The preserved blockout is still static; the distinct runtime export is rigged and animated.

ChatGPT snapshotted the user's live Blender blockout, bound the existing anatomical foundation to its adult weights and rig, weighted new apex parts, seated tail plates on the curled tail, joined the runtime mesh and exported six inherited in-place clips. The result has 6,999 triangles, 27 bones, five materials and eight sockets. The user's Blender now shows the rigged apex scene with prior scenes preserved. Claude implemented model mapping and four-form runtime tests; ChatGPT reviewed and validated the exported vertex weights.

Validation: 448 tests across 30 files pass; TypeScript and production build pass (existing Babylon bundle warning). On the isolated test origin at 375 × 812, the normal evolution action changed Ravager into Devourer, loaded the apex, and captures continued. No console errors; procedural-tentacle notices are expected. Screenshot: `art/alien/tendon-stalker/apex/game-mobile.png`; viewport reset. Economy, evolution requirements and save format are unchanged. The adult gait is reused rather than a bespoke apex gait; physical-device performance and further visual polish remain unverified.
