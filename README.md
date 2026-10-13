# Alien Harvester

Portrait-first 3D browser game (Babylon.js + TypeScript). Design: [Alien-Harvester-Web-Game-Spec.md](Alien-Harvester-Web-Game-Spec.md).

**Current status: Stage B in progress.** Done: Stage A loop; four-zone facility with doors (requirements shown, atomic unlock); ten XP levels; quest chain (11 of 12; guard quest arrives with guards); runners (flee) and technicians (genetic material); evolution to a second form (third tentacle, raised mutation caps, new silhouette); guards and armored guards with telegraphed attacks, health, death and respawn (first death forgiven); all eight upgrade tracks (incl. tentacles, max health, regeneration, resource yield) with a free respec at base; three-card level-up perks (saved when rolled, queued, capped); biomass vat (foreground-only production) and a delivery drone that ferries cargo through doors; the reactor warden boss (telegraphed slam and charge, multi-tentacle capture) and reactor repair with a completion screen; save schema v8 with migrations from v1–v7; save export/import with validated preview and permanent backups. Next: perks, farm, helper, boss, export/import. Visuals are procedural placeholders pending the Blender pipeline.

Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md).

## Commands

```bash
npm install
npm run dev        # http://localhost:5173 (exposed on LAN for phone testing)
npm test           # Vitest: capture, economy, save, foreground rules
npm run build      # typecheck + production bundle
```

## Layout

| Path | Role |
| --- | --- |
| `src/content/` | Typed data: map (zones, doors, spawns), targets, upgrades, quests, levels, currencies |
| `src/domain/` | Persistent progress, economy, levels, quests, doors (renderer-free) |
| `src/game/` | World, fixed 30 Hz loop, systems (movement, targets, capture, deposit), geometry, spatial hash |
| `src/persistence/` | Save schema/validation and the Dexie store (current + previous + quarantine snapshots, single-tab lock) |
| `src/render/` | Babylon scene: environment, creature + tentacles, crowd pooling, camera |
| `src/ui/` | DOM HUD, upgrade panel, joystick/keyboard input |
| `tests/` | Rule tests; none touch Babylon |

## Rules worth knowing

- Simulation only advances inside `FixedLoop.frame` while no pause reason is active. Hidden pages and open menus pause it; resuming resets the clock so missed time is discarded.
- Saves hold remaining cooldown seconds, never wall-clock timestamps.
- In dev builds, `window.__game.step(n, ix, iz)` advances the sim deterministically for automated checks, and a **Dev** button grants currencies and XP, completes current objectives, and can devolve for repeat testing. Neither ships in production builds.
- Older saves are migrated on load; the raw pre-migration save is kept in IndexedDB under `premigration:v<n>`.
