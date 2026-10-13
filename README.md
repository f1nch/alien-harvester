# Alien Harvester

Portrait-first 3D browser game (Babylon.js + TypeScript). Design: [Alien-Harvester-Web-Game-Spec.md](Alien-Harvester-Web-Game-Spec.md).

**Current status: Stage A (prove the loop).** One room, one base, one passive target type (worker), joystick/WASD movement, automatic tentacle capture with cargo reservation, deposit, four upgrades, respawns, IndexedDB saves, foreground-only simulation. Visuals are procedural placeholder meshes pending the Blender pipeline.

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
| `src/content/` | Typed data: targets, upgrades, rooms, currencies |
| `src/domain/` | Persistent progress state and the upgrade economy (renderer-free) |
| `src/game/` | World, fixed 30 Hz loop, systems (movement, targets, capture, deposit), geometry, spatial hash |
| `src/persistence/` | Save schema/validation and the Dexie store (current + previous + quarantine snapshots, single-tab lock) |
| `src/render/` | Babylon scene: environment, creature + tentacles, crowd pooling, camera |
| `src/ui/` | DOM HUD, upgrade panel, joystick/keyboard input |
| `tests/` | Rule tests; none touch Babylon |

## Rules worth knowing

- Simulation only advances inside `FixedLoop.frame` while no pause reason is active. Hidden pages and open menus pause it; resuming resets the clock so missed time is discarded.
- Saves hold remaining cooldown seconds, never wall-clock timestamps.
- In dev builds, `window.__game.step(n, ix, iz)` advances the sim deterministically for automated checks.
