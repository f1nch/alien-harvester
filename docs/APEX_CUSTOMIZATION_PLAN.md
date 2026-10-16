# Post-Apex evolution and customization — proposal

Date: 2026-10-16. Status: planning only; no runtime, asset or save changes.

## Direction and relationship to finite progression

The user proposes keeping the four existing body models and making subsequent evolutions unlock appearance customization: colors, effects, wings and alternate arms/legs. This extends the agreed Hatchling → Juvenile → Adult → Apex direction. On 2026-10-16 the user accepted choosing the desired feature as a goal before working toward its unlock. Other mechanics below remain recommendations awaiting agreement.

Keep Apex as the permanent final body identity. Post-Apex evolution means unlocking a cosmetic adaptation, not a fifth body, cycling form names, resetting progress or adding mandatory power ranks. Keep level progression and combat mutations separate. The proposed level-40 cap and numerical evolution gates remain unresolved.

## Recommended player loop

1. Reach Apex and unlock a customization preview with a free starter palette choice.
2. Preview available adaptations and their explicit unlock requirements, then select the specific feature to pursue (accepted goal-selection direction).
3. Track progress toward that feature. Visible, guaranteed objectives such as an expedition, boss challenge or exploration collection are proposed; exact requirements remain open.
4. Unlock the selected adaptation permanently when its requirements are met; other features remain available as future goals.
5. Play a brief evolution reveal, then equip the new part or keep the current look.

Unlocked choices can be mixed, removed and re-equipped freely outside combat. Previewing and canceling costs nothing. No random essential drops, duplicate rewards, reset, escalating biomass bill or new currency is recommended. Requirements and reward cadence need content and pacing validation. Do not silently turn excess XP into a new progression meter: the existing post-cap XP question remains open.

## Customization slots

| Slot | Example choices | Initial scope |
|---|---|---|
| Body palette | Charcoal, bone, crimson, deep violet | First slice; authored swatches |
| Accent/glow palette | Mint, amber, cyan, magenta | First slice; bounded brightness |
| Crest/back | Spines, carapace plates, folded fins | First geometry expansion |
| Arms | Talons, armored forearms, blade-like tips | Later, rig-compatible replacements |
| Legs | Chitin armor, hooked feet, alternate silhouettes | Later, preserve initial gait/footprint |
| Wings/back appendage | Membrane wings, beetle covers, energy fins | Later; folded or limited idle motion first |
| Cosmetic effect | Spores, pulses, short movement trail | Later; bounded and optional |

Every geometry slot includes the original Apex option. Back pieces and wings may need to share a slot or use explicit incompatibility rules to prevent clipping. Start with paired arms/legs rather than independent left/right editing. No free scaling, limb repositioning or arbitrary part combinations in the first release.

Cosmetic wings do not grant flight; cosmetic blades do not increase damage. Capture tentacle count, range, hitboxes, movement and ability effects remain governed by gameplay systems. If functional wings or different locomotion are wanted, plan them separately as explicit gameplay changes.

## Customization screen

At Apex, expose an appearance action alongside evolution. Show a rotatable creature preview, slot tabs, owned/locked options and exact requirements. Allow several changes before Apply; Cancel restores the equipped look. Include Reset to original Apex and a clear distinction between unlocking and equipping. Saved look presets can follow after the first slice.

The original silhouette, enemy telegraphs and capture action must stay readable at the actual mobile camera distance. Effects follow reduced-effects settings and never hide gameplay warnings. A low graphics setting can suppress particles while retaining equipped geometry and colors.

## Asset and implementation planning

The current Apex is an integrated GLB, not a verified modular character kit. Inspect mesh separation, material ownership, rig weights and renderer overrides before estimating work. The 2026-10-16 refinement records 4,363 triangles, 27 bones and eight capture sockets; existing budgets are not proof that wings or replacement limbs fit. The simpler base silhouette was implemented at the user's request, while modular customization remains planned.

Use named tint regions and per-creature material ownership for palettes. For geometry, author validated attachment points and compatible part sets; replacement limbs need separable original meshes and matching bone weights. Preserve capture sockets and all existing clips. Changed leg counts or gaits require separate rig/animation work. Author combinations deliberately rather than promising every combination will fit.

Persist owned cosmetic IDs separately from equipped appearance. Derive combat stats independently. Any persisted changes require the repository's schema bump, migration, parser validation, old-save regression tests and save/economy review. Missing assets fall back visually without deleting ownership. Decide unknown-ID handling before implementing imports. Apply unlocks transactionally and retain existing progress; no wall-clock reward tracking.

## Delivery slices and validation

1. Palette prototype: body/accent swatches, preview/apply/cancel, ownership and save-safe persistence. Verify material regions and readable colors through the mobile game camera.
2. One modular slot: original crest plus two alternatives. Verify all clips, capture sockets, turns and mesh combinations.
3. Rig-compatible arm/leg sets and back appendages. Verify clipping, gait and maximum equipped geometry on target devices.
4. Cosmetic effects and optional presets. Measure transparency cost and reduced-effects behavior.

Before release, test legacy saves, unlock/equip/reload/export/import, cancel without spending, repeated unlock prevention and missing assets. Run repository checks and mobile browser review on the isolated test origin. Benchmark the most demanding supported combination; do not claim performance from triangle counts alone.

## Decisions to agree next

- Accepted: choose the desired feature before pursuing its unlock, rather than completing a generic evolution and choosing its reward afterward. Goal-switching behavior, retained partial progress, retroactive credit and number of simultaneous goals still need specification.
- Cosmetic-only post-Apex adaptations, or a separate proposal for functional anatomy? Recommend cosmetic-only first.
- Curated challenge unlocks, an additional earned meter, or both? Recommend guaranteed authored challenges first; avoid replacing finite progression with an endless required rank.
- Apex-only geometry versus recoloring earlier forms too? Recommend Apex geometry first; evaluate earlier-form palettes separately.
- How large is the initial catalog, and when is each category introduced? Recommend palettes plus one crest slot before wings/limb replacements.
- Optional paid cosmetics remain a later GDD possibility; do not assign paid exclusivity to this progression catalog without a separate decision.

## Handoff

Completed: read GDD, CLAUDE, finite progression proposal and creature asset brief; documented the user's direction and recommended phased design. Recorded accepted feature-first goal selection on 2026-10-16. Validation: documentation review only; no gameplay, asset compatibility, balance, performance or save migration claims. Claude CLI review failed with ECONNREFUSED (connection refused); no independent review was received. Remaining: specify goal tracking/switching and unlock requirements, agree scope, inspect modular feasibility, define catalog and pacing, then implement a reviewed vertical slice.
