# Alien Harvester: notes for Claude sessions

Design source of truth: [Alien-Harvester-Web-Game-Spec.md](Alien-Harvester-Web-Game-Spec.md). Status and milestones: [docs/ROADMAP.md](docs/ROADMAP.md). Repo: https://github.com/f1nch/alien-harvester (push to `main`).

## Commands

- `npm test` (Vitest), `npx tsc --noEmit`, `npm run build`. Run all three before committing.
- Dev servers (`.claude/launch.json`): **`dev` on 5199 is the user's own game**. They play in that tab, and its IndexedDB save is theirs. **Do browser testing on `dev-test` (port 5200)**: a separate origin, so it has its own save and doesn't hit the single-tab lock. If another tab already holds 5200's lock ("Already open"), use `dev-test-2` (port 5201) rather than closing that tab.
- Dev builds expose `window.__game` (`world`, `loop`, `step(n, ix, iz)`) for deterministic checks, and a **Dev** panel (currencies, XP, complete objectives, devolve). Neither ships in production.
- The browser pane only renders frames when it's visible, so screenshots can be stale. Step the sim with `__game.step`, pause with `__game.loop.pause("debug")`, and read DOM text to confirm UI state.

## Architecture rules

- `src/content` is data, `src/domain` holds renderer-free rules (progress, economy, quests, doors, perks, structures, reactor), `src/game` is the fixed 30 Hz simulation, `src/render` is Babylon, `src/ui` is the DOM HUD, `src/persistence` is saves.
- **Foreground-only:** game time advances only in `stepWorld`. No wall-clock timestamps in saves; durations are stored as remaining seconds.
- **Transactions:** every purchase, unlock, build, evolve or repair checks all requirements, then pays and applies in one synchronous step. Shared requirement logic lives in `domain/requirements.ts`.
- **Stats** are computed only in `domain/economy.ts#computeStats` (order: upgrades, then summed perk percentages, then flat perks).
- **Wallet math** goes through `roundCents`.
- **Cargo** is only ever moved, never copied; banking goes through `game/systems/deposit.ts#bankDrop`.

## Saves (high risk; handle carefully)

- Schema version is in `persistence/schema.ts` (currently 8). Any change to persisted state means: bump `SCHEMA_VERSION`, add a step to `migrate()`, validate in `parseSave`, and add a migration test. Tests use the `SCHEMA_VERSION` constant, never literals.
- `parseSave` must accept every reachable live state, because `store.write` refuses invalid saves and would block saving for good. Bound numbers (`MAX_AMOUNT`). Parse order matters: perks before cargo and health; structures after doors.
- Never lower an upgrade cap or rename persistent IDs (quests, perks, spawns, doors). A test pins the caps.
- The store keeps `current`, `previous`, `premigration:v<n>`, `quarantine:<n>` and `preimport:<n>`. Backup slots are never overwritten.

## Workflow the user expects

- Per the user's global CLAUDE.md, high-risk changes (saves and migrations, economy and resource transfers, anything that could lose progress) get a **reviewer subagent pass** before committing; fix the findings, add regression tests, then commit and push.
- Commit messages end with the co-author line given by the session. Work directly on `main`.
- Verify UI changes in the browser on port 5200 at the mobile preset (375×812), then reset the viewport.

## Next up (see roadmap)

Milestone 1 remainder: settings menu (sound, reduced effects, quality), audio, offline PWA, pacing simulations, real-device validation. Milestone 2: the user wants to **build the creature in Blender** (`.blend` source in `assets/creature/`, GLB exports in `public/models/`, loaded in place of the procedural `render/proceduralCreature.ts` with per-form fallback). The asset contract and the loading plan are in [docs/CREATURE_ASSET_BRIEF.md](docs/CREATURE_ASSET_BRIEF.md); steps 1–2 (the `CreatureLook` interface, `tentacleCurve`, the loader and contract checker) are done, and step 3 (`GltfCreature`) waits for the user's greybox export.
