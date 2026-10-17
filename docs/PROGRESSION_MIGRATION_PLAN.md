# Finite progression: implementation and save migration plan

Planning only · 2026-10-15. Builds on [PROGRESSION_REDESIGN.md](PROGRESSION_REDESIGN.md). No runtime code, player data or schema has changed in this planning pass.

ChatGPT traced the progression/resource dependencies; Claude independently reviewed the parser, store, import and downgrade paths. This is the initial implementation plan, not a completed migration or tested safety guarantee.

## Target and release boundary

Implement four permanent stages (Hatchling, Juvenile, Adult, Apex), three one-time evolutions, separate campaign leveling and no cycling evolution names. Use level 40 as the proposed campaign cap; simulate the tentative 8/20/32 evolution gates before committing their numbers. Retain the current perk-card system for this first implementation; defer the separate evolution-point tree.

Do not deploy a cap-only change. The finite progression release must include the compatibility reader, conversion, validator, recovery behavior, bounded encounter progression and UI together. Internal implementation can be split into small commits, but players must not receive a half-converted ruleset. Renderer/assets and save/economy migration are separate concerns; the four models already exist.

## Verified dependencies and failure modes

| Current code | Consequence for the redesign |
| --- | --- |
| `src/persistence/schema.ts`: schema 16; evolution parsed and bounded before upgrade levels | Reducing the evolution cap first can discard paid upgrade levels. |
| Same parser: perks, upgrades and capacity parsed before cargo/health; excess cargo is dropped and health is bounded | Lower stats/caps can remove carried rewards or health during loading. Preserve effective capacity and health before these checks. |
| Same parser: pending perk level must not exceed `levelForXp(progress.xp)` | A gameplay cap of 40 cannot also become the sole validator bound for already earned level-41+ choices. |
| `src/domain/economy.ts`: evolution changes power, health, tentacles and mutation caps | A form index is insufficient to reproduce an advanced player's earned power. |
| `src/domain/biome.ts`: depth scales resistance, damage, costs, rewards and XP | Stopping player growth without bounding encounters eventually makes progression impossible. |
| `schema.ts#parseDrop`: cargo payouts rebuilt from current target definitions/depth | Capping depth scaling can revalue existing cargo. Protect earned payout value, not just item count. |
| `src/domain/perks.ts`: one-time grants depend on the choice's earned level and current depth | Retain queued options/levels and define their payout basis; a new curve must not reroll or duplicate rewards. |
| `src/persistence/store.ts`: pre-migration backup is best effort and keyed once per old schema; load may fall back to previous | Conversion needs a stronger transactional backup boundary and a distinct failure result. Never turn a conversion error into an unnoticed older save or fresh game. |
| `store.ts` scans both current and previous for newer schemas before loading | Older builds already block on newer saves. Do not bypass this downgrade protection to roll back. |
| `src/persistence/transfer.ts`: imports use `parseSave`, then store the converted object | Preserve the incoming raw legacy candidate before parsing discards its original representation. Import and local-load migration must share the same conversion. |

## Preservation contract

Compare a conversion against the **old rules' validated, canonical state**, not arbitrary raw JSON. Historical v1–v15 saves must first undergo their existing historical normalization. Distinguish any historical repairs from changes caused by the new migration.

Must survive conversion without loss:

- Every banked currency, player cargo, drone/catcher cargo, production stock and already paid refinery batch; preserve item identity, weight, order, earned payout basis and remaining work where applicable. Do not silently bank or discard cargo to make it fit.
- Purchased upgrade levels, exact recorded spending by currency, respec refunds, structure levels and ownership, mutagen purchases and lifetime purchase counts.
- Applied perks and unclaimed choices, including choices earned above level 40. Keep their option order, earned level and entitlement; no rerolls or retroactive duplicate picks.
- Effective permanent stats and previously unlocked caps. At conversion, max health and cargo capacity cannot fall; preserve current absolute health. Compare unboosted permanent stats, not temporary frenzy or pod buffs that are not saved today.
- Current physical form: old tier 0 → Hatchling, 1 → Juvenile, 2 → Adult, 3+ → Apex. Previously earned forms never become locked again by new gates.
- Floor ID, depth, visits, position, doors, quest progress, objective completion, spawn cooldowns, paid wave state and remaining timers. Keep valid geometry positions; do not reset the floor or invoke historical floor-remapping helpers for this redesign.
- Earned XP history and equivalent campaign level progress, settings and active play time. No offline rewards or wall-clock timestamps are introduced.

Numerical wallets/spending and discrete state must match exactly. Use a documented floating-point tolerance only for recomputed stats, never to excuse missing currency, items or levels. Treat an unexplained mismatch as a migration failure, not as permission to clamp.

## Proposed compatibility representation

These are implementation recommendations; field names and version numbers remain provisional until the schema work starts.

1. **Separate form identity from old power accounting.** Add a bounded `formStage` (0–3). Keep the old evolution tier as immutable compatibility evidence, not as a new visible rank or purchasable counter. Stop using the new form index directly in old save clamps.
2. **Fixed legacy benefits, not an endless replacement system.** Prefer a frozen compatibility evaluator using the original tier, original earned cap entitlements and original stat rules. It must reproduce the old player's benefits while form advancement for fresh players uses the new finite tables. A fixed legacy multiplier/cap floor is acceptable; a total-stat snapshot added on top of existing upgrade/perk bonuses would double-count them. Keep compatibility accounting separate from refundable purchases so respec cannot cash out legacy benefits repeatedly.
3. **Freeze entitlements, not just current holdings.** Preserve each old unlocked upgrade cap, not only the purchased level, and honor existing spending/refund ledgers. The post-conversion purchase ceiling is at least the retained cap entitlement. No future purchase increases the legacy entitlement. Test respec, rebuy and subsequent finite evolution for exploits or lost power.
4. **Versioned XP conversion.** Preserve original XP and earned level in immutable migration metadata. Map pre-cap levels to the same campaign level and proportional progress under the chosen new XP curve; map above-cap levels to level 40 while retaining all already earned perk benefits and queues. Do not continue accumulating hidden post-cap XP. Separate `campaignLevelForXp` from legacy choice entitlement validation, and do not create fresh reward queues merely because the curve changed.
5. **Honor pre-existing payouts.** Preserve the old validated payout basis for existing player/helper cargo, stock and paid batches. If persisted provenance is needed, derive and validate it using frozen old content/depth rules; do not begin trusting arbitrary serialized `reward` amounts. Newly earned items use the new rules. Define the basis for legacy queued grant cards explicitly so their earned reward is not accidentally repriced by the new depth cap.
6. **World identity and encounter difficulty are separate.** Keep floor/depth/visits intact. Introduce bounded encounter scaling for fresh finite progression. For legacy saves, retain an explicitly versioned encounter/cost/payout compatibility context sufficient to continue their current run; final rebalance must be simulated with their retained stats and unlocks. Do not clamp or reset depth, and do not strand a save at a legacy difficulty it can no longer beat.

The compatibility context is a fixed record. It never has an XP bar, numbered form name, upgrade button or new reward loop. If we cannot preserve equivalent value with a simple representation, retain a versioned legacy evaluator rather than inventing an untested refund approximation.

Upgrade purchases have recorded primary/extra spending, but there is no equivalent itemized history of every old evolution payment. Do not promise exact evolution cash refunds reconstructed from today's price tables; preserve earned benefits instead unless historical paid amounts can be established reliably.

## Work packages and order

| Order | Deliverable | Files / subsystem | Completion gate |
| --- | --- | --- | --- |
| 1 | Capture legacy rules and fixtures | Versioned v16 decoder/stat/XP/content dependencies; `tests/fixtures` | Frozen evaluator reproduces canonical v16 state and permanent stats. No new balance rules yet. |
| 2 | Harden save recovery | `store.ts`, transfer/import, recovery UI and store tests | Raw current/previous/import candidates can be archived atomically; conversion failure cannot enable autosave over them. |
| 3 | Pure conversion prototype and comparison report | New progression migration module and fixture tests | Same input gives same output; input unchanged; every preservation invariant checked; no production schema bump yet. |
| 4 | Finite data and campaign simulator | Levels, evolution, economy, biome scaling; headless tools | Multiple profiles reach all three evolutions and required bosses without resource/dead-end failures. Test fresh and advanced legacy states. Gates/bonuses finalized from results. |
| 5 | Integrated schema and runtime | Next unused schema (v17 if still available), `progress.ts`, `schema.ts`, requirements, stats, world actions and UI | Legacy context parsed before upgrades/perks/cargo/health. Every reachable converted state round-trips and remains writable. |
| 6 | Review and release candidate | Save/economy reviewer, complete tests/typecheck/build, isolated browser | Findings fixed; fixtures, imports, recovery, limits and rollout gates pass. Release all mutually dependent changes together. |

Suggested parallel ownership: ChatGPT handles the conversion contract, frozen-rule integration and runtime wiring; Claude handles independent fixtures/store-failure tests and later reviews the completed migration. Avoid overlapping edits. Existing user authorization covers continuing to delegate through `claude` in PowerShell.

## Transaction, backup and failure protocol

1. Read raw slots without rotating or modifying them. Distinguish **no save** from **unreadable save**, **newer schema**, and **conversion failed/unsafe**.
2. Decode and convert in memory using frozen legacy rules; validate the candidate and generate a before/after comparison.
3. Under the active-tab lock and serialized write queue, re-check that the source has not changed. In one IndexedDB transaction, append an immutable snapshot of the actual raw current and previous candidates, record any raw imported candidate, and commit the converted current save. Preserve the old slots in the archive before rotation can remove them. Use monotonically allocated keys, not timestamps or an overwriteable single `premigration:v16` slot.
4. If backup or commit fails (quota, abort, lock contention), leave current and previous untouched. Present recovery/export/retry; do not start an autosaving fresh game. A conversion failure is not ordinary corrupt-slot fallback.
5. Run schema migration once. Loading, exporting, importing and reloading an already converted save must not grant benefits or refunds again. Historical migrations must not be rerun under new level/content formulas.
6. Give the player a concise migration summary when relevant: retained form, capped campaign level, preserved earned benefits and outstanding choices. Technical compatibility counters do not become gameplay progression.

Imported old saves deliberately replace progress only after the existing preview/confirmation flow; they do not merge banks, perk queues or legacy bonuses with the current save.

## Required fixture and failure matrix

Use synthetic fixtures and copies of user-provided exports only; do not experiment on the main browser's IndexedDB save. Construct fixtures within the old reader's reachable limits and `MAX_AMOUNT`.

| Case | Required assertions |
| --- | --- |
| Fresh and old schema versions 1–16 | Historical normalization still works; exactly one finite conversion; no duplicate quest/perk rewards. |
| Tiers 0, 1, 2, 3, 4, 40, 300, 301 at legal depths | Correct form; retained stats and cap entitlements; no cyclic display names; no further legacy-tier purchase. |
| Levels below, at and above each proposed gate; levels 39, 40 and reachable legacy levels above 40 | No lost earned form; correct XP mapping; max-level display; no hidden post-cap growth; retained old perk choices remain legal. |
| Every upgrade at old cap; high values past the original cost table; second-currency spending | No clamping, correct affordability, exact respec refund; refund/rebuy cannot duplicate money or legacy benefits. |
| Full player cargo and both helper holds; summoned cargo; low health; production stock and paid batch | Same items and economic value, capacities, health and remaining timers after conversion and reload. |
| Pending high-level grant cards, stacked perks, cravings, mutagen and bestiary bonuses | Original options/entitlements retained; no rerolls or duplicate grants; stats and payouts computed once. |
| Every floor ID; deep repeat visits; unlocked doors; partial quests; repaired objectives; active waves | Identity and progress retained; next required objective remains accessible; no teleport/reset for valid positions. |
| Invalid current with valid previous; both invalid; a valid legacy input whose conversion fails | Corruption and conversion failures distinguished; raw slots recoverable; no silent destructive fallback. |
| Existing migration backup, multiple old imports, failed backup, quota error, transaction abort | Append-only archives; both slots unchanged on failure; converted state only becomes current after successful commit. |
| Reload, repeated parse, converted import/export round-trip, concurrent tab attempt | Idempotent conversion; stable derived stats; no duplicate bonuses; only the lock owner writes. |
| Old app with newer current or previous | Update-required block remains; no downgrade overwrite or automatic older-slot selection. |

The current opening pacing bot is insufficient for package 4. Extend it to bounded campaign travel, perks/builds, all three evolution gates, required bosses and completion, with at least casual/inefficient, balanced and specialized profiles. Compare identical seeded encounters before/after for legacy viability. Keep presentation targets separate from hard safety invariants.

## Rollout and rollback

Develop and rehearse against isolated test origins (5200/5201), never the user's 5199 game. Offer save export before release, but do not rely on a manual export as the only backup. Ship only after the migration matrix and save/economy review pass.

A schema upgrade is forward-only for existing app versions. Prefer a forward-fix build that still reads the new schema and retains earned post-migration progress. Deploying the old app alone is not a working rollback: it must refuse the newer slots. Restoring a pre-migration snapshot is an explicit recovery operation with a preview of any progress earned since that snapshot; never silently overwrite newer progress or falsify the schema version.

## First implementation task

Build the frozen v16 decoder/evaluator and representative fixtures, plus a read-only comparison harness. It should report form, XP/level, every stat/cap, wallet, all carried/produced resources, spending/refund ledgers and pending entitlements without writing IndexedDB. This provides a measurable contract before changing the game rules.
