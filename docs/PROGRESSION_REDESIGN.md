# Proposed finite leveling and evolution

Design direction agreed for implementation planning, 2026-10-15: fewer required alien models, four permanent stages and no repeated evolution names, with leveling separate from physical evolution. Numerical gates, rewards, costs and migration details remain subject to validation. No runtime rules are changed by this document.

## Recommended player-facing structure

- Exactly four permanent body stages: **Hatchling → Juvenile → Adult → Apex**. The existing four models cover the complete progression. Three physical evolutions happen once each.
- Separate XP levels **1–40**, matching the draft GDD's campaign level cap. Leveling provides frequent build progression; it does not rename the alien or require another model.
- Tentative evolution gates: juvenile at level 8, adult at level 20, apex at level 32, each paired with an authored campaign milestone. These levels need simulation and remain provisional. Reach apex before the final campaign encounters so the player has time to use it.
- Show one identity such as **Adult · Level 24**. Do not cycle Ravager/Devourer/etc., add Roman numerals to forms, or replace endless evolution with an endless mastery rank.
- Evolution is an explicit, previewed action once its gates are met. It never resets levels, upgrades or currencies. Essential resources must be guaranteed; do not put a large additional resource bill in front of a milestone already earned through play.
- Levels unlock existing upgrade/build options and curated perk choices; ordinary upgrades provide smaller improvements between evolutions. Keep evolution bonuses finite and understandable. Tentacle count remains a gameplay upgrade, with authored sockets reused by the procedural capture system rather than demanding more body meshes.
- At level 40, show **Max level** and the permanent **Apex** identity. Optional expeditions, bosses, challenges and alternate builds supply endgame goals. No automatic extension of enemy strength or required power progression beyond the cap. Finishing is valid; no prestige reset.
- Cosmetic skins or alternate lineages may reuse animation/rig infrastructure later, but are optional art work, never required for progression.

## Decisions still open

1. Confirm the 40-level campaign cap and test whether levels 8/20/32 put each form in a useful portion of the campaign. Current content and XP rewards must be measured; do not copy these numbers directly into production.
2. Keep current perk cards for an incremental implementation, or adopt the GDD's evolution-point mutation tree later. Do not silently run two contradictory level-reward systems. Recommend keeping the existing card system for the first implementation pass.
3. Define each finite evolution's bonuses and which existing upgrade caps it unlocks. A visual stage cap cannot safely be substituted for the current numeric evolution tier without changing power calculations.
4. Reconcile authored campaign completion and optional replayable content with the current 300-depth endless world scaling. Finite player progression needs reachable, bounded encounter difficulty; avoid a final form that immediately hits an impossible stat wall.
5. Specify what happens to XP earned after level 40: recommend no further power and no hidden XP accumulation; explain the cap in the UI. Preserve already earned progression during migration.

## Existing-save protection and implementation order

Current saves use numeric evolution for damage/health multipliers, tentacle bonuses and mutation caps, not just the model. `src/persistence/schema.ts` also clamps saved upgrades using that tier. Merely setting `MAX_TIER` to 3 would remove earned power or upgrade levels on load.

Before implementation, inventory old-save XP, tier, paid evolution costs, spent upgrade amounts, current stats and pending perk choices. Define and test a conversion that preserves earned benefits or refunds them explicitly, including saves already beyond the new level/form caps. Do not silently clamp or delete them. Legacy compatibility must not introduce an endlessly purchasable fifth progression system.

Claude's design review also flags late-floor scaling and saved upgrade caps as migration risks. A candidate is a one-time, fixed legacy bonus preserving already earned benefits, with no ranks or further purchases; this remains a migration proposal, not a selected policy. Regression scenarios should include late-game saves near old tiers 40 and 300 as well as fresh players. Raw currency refunds alone may fail to preserve equivalent power.

First agree on the player-facing structure. Then simulate a fresh campaign through all three evolutions and the final boss, including multiple builds, guaranteed resource supply and short-session play. Only then implement a versioned migration, finite upgrade/reward data and UI together; obtain the required save/economy review and run old-save regression tests. Update GDD sections 5, 7, 8 and 11 when the design is agreed.

The user has requested implementation planning. See [PROGRESSION_MIGRATION_PLAN.md](PROGRESSION_MIGRATION_PLAN.md) for the preservation contract, work packages, transaction/recovery policy and test matrix. Numerical gates and final balance remain subject to simulation; runtime progression is still unchanged.
