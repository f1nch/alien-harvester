# Roadmap

Where Alien Harvester is, and the major milestones from here. Grounded in the [spec](../Alien-Harvester-Web-Game-Spec.md); stage names (A–D) refer to its section 3.

## Status (October 2026)

Stage A is done; Stage B's systems are feature-complete:

- Four-zone facility with doors, XP levels, 12 quests, three currencies
- Workers, runners, technicians, guards, armored guards, and the reactor warden boss
- Evolution (two forms), eight upgrade tracks, free respec, level-up perk cards
- Biomass vat (foreground-only production) and delivery drone
- Reactor repair completion screen, then free play
- Versioned saves with migrations, backups, single-tab lock; export/import (in progress)

What Stage B still lacks before it meets the spec's MVP acceptance (section 11): offline caching, pacing simulations and tuning, real-device validation, and audio. Visuals are procedural placeholders.

## Milestone 1 — Stage B complete and polished

Goal: a new player can finish the game on a phone, offline after first load, at the spec's 60–120 minute pace, and it looks and feels good.

| Work | Notes |
| --- | --- |
| Save export/import | Download or copy; validated preview before replacing; permanent pre-import backup |
| Polish round 1 | Denser crowds with limb animation, per-zone set dressing, particles, post-processing, floating numbers, camera shake (see below) |
| Settings menu | Sound and music volume, reduced effects, quality preset (render scale, shadows, bloom), handedness |
| Audio | Capture, deposit, hits, windups, level-up, ambience per zone; unlock on first gesture |
| Offline play (PWA) | Service worker caches the app shell and assets; installable but optional |
| Pacing simulations | Bot players (balanced, capacity-focused, power-focused, inefficient novice) run the full campaign; flag any milestone over budget or any >1.5× jump between bands; tune costs |
| Device validation | Physical iPhone and Android: full tutorial, interrupted input, rotation, background/resume, offline reload, 20-minute stress at 30+ FPS; publish the browser matrix |

### Polish round 1 (first pass, in progress)

- **Crowds:** more targets per room in loose groups; legs and arms that swing while walking; idle fidgets; panic animation when fleeing or held
- **Set dressing per zone:** containment holding tubes, service-wing lab benches and pipework, security barriers and camera posts, reactor conduits; floor markings and hazard stripes at doors
- **Effects:** biomass motes on capture, a stream into the base pad on deposit, sparks on hits, a burst on level-up and evolution
- **Rendering:** bloom, tone mapping and anti-aliasing behind the quality setting
- **Feedback:** floating "+3 ◆" numbers on deposit, light camera shake on heavy hits

Each item respects "reduced effects" and keeps the 30 FPS floor on the stress case.

## Milestone 2 — Production visuals

Goal: the spec's visual bar (section 10): original rigged 3D assets that meet or beat the reference at a stable mobile frame rate.

- Blender pipeline: GLB export, shared materials, compressed textures (KTX2), validated room manifests (spawn, door, collision markers)
- Rigged creature with idle, move and capture animations, and distinct evolution silhouettes; tentacles that extend, attach, bend and retract. Brief, GLB contract and loading plan: [CREATURE_ASSET_BRIEF.md](CREATURE_ASSET_BRIEF.md)
- Skinned crowd characters (profiled separately; instancing doesn't cover independently animated characters)
- Modular floor, wall and door kit; baked ambient shading; limited dynamic shadows
- Camera projection decided by side-by-side review; recorded reference comparison
- Budgets (polygons, draw calls, textures, shadow casters) set from the polished scene on baseline phones

## Milestone 3 — Stage C expansion

Goal: more game after the reactor, without changing the fair-progression rules.

- Cold biome with freezing penalties, warming shelters and route choices (not a resistance grind)
- Two new enemy types, a second base, a catcher helper
- Industrial production chains and reactor summons
- A third evolution tier with its own silhouette; more quests
- Loaded on demand so the initial download stays under 15 MB

## Milestone 4 — Release readiness

- Static hosting and CDN with CI (tests, build, bundle-size check)
- Supported-browser matrix from real devices
- Accessibility pass: text contrast, focus order, screen-reader labels, colour-independent cues
- Save recovery UI (restore a backup or quarantined snapshot) built on the existing backup slots

## Milestone 5 — Optional live content (Stage D)

Seasonal event targets and milestone rewards. Public rankings only with server-validated progression. Paid progression stays excluded in every stage.
