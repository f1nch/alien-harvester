# Alien Harvester: mobile web game specification

Research and proposal dated 13 October 2026. Revised for full 3D visuals, foreground-only progression, and an economy without purchased acceleration. Working title only.

## 1. Product direction

Build a single-player, portrait-first browser game inspired by Alien Invasion: RPG Idle Space. The player steers an evolving tentacled creature through interconnected rooms, automatically captures nearby targets, banks harvested resources, upgrades harvesting efficiency, and unlocks tougher environments.

Use original creature designs, environments, interface, names, sound, and progression data. The supplied icon is a visual reference, not a game-ready sprite or a complete description of gameplay. This specification recreates the broad gameplay loop and proposes its own implementation and economy.

Required presentation: full 3D with a fixed angled overhead camera, preserving the reference game's readable creature silhouette, animated tentacle harvesting, crowds, and enclosed environments. Aim to meet or exceed its visual quality using original assets. Use Babylon.js, TypeScript, and Blender. Gameplay movement remains on a flat X/Z plane even though rendering is 3D.

Core constraints: no offline earnings of any kind; no purchased currencies, stat boosts, speedups, energy refills, or paid rerolls. Progression must remain satisfying throughout the game without spending money or leaving a device running for hours.

## 2. What research establishes

The following is documented reference-game behavior, not a promise that every detail matches the current build.

| Finding | Evidence and confidence |
| --- | --- |
| Captures feed cargo; the base banks loot and heals. Early rooms introduce farms, upgrade markets, helper bots, and aggressive enemies. Evolution and XP levels are distinct progression systems. | Detailed January 2023 walkthrough [R2]. Strong historical evidence; current balancing may differ. |
| Eggs and DNA are upgrade resources. Cargo capacity and special resource targets matter early. | February 2023 beginner guide [R3]. Corroborates the early resource loop. |
| The winter area adds freezing penalties to movement and capture speed; warming and capture upgrades help with fast targets. | November 2023 quest guide [R4]. Specific documented late-game mechanic. |
| A multistage reactor depends on quests, bosses, and industrial resources. Its portal summons reward-bearing creatures rather than functioning as a travel portal in the described version. | January 2024 reactor guide [R5]. Do not infer the same behavior for all later updates. |
| Update 4.47.00 advertises a three-card perk choice on level-up; later notes advertise recurring themed events. | Current official App Store version history [R1]. Rules and probabilities are not disclosed. |
| Offline bot income is disputed. A guide describes it, while player reports say bots need the game running and only farms accumulate offline. | [R2], [R6], [R7]. Unverified for the current version. Our version earns nothing while suspended, backgrounded, or closed, regardless of reference-game behavior. |

Research method: official listing and update notes, dated walkthroughs, and community reports. No installed-game playtest or binary inspection was performed. Exact current map completeness, hidden formulas, event schedules, and enemy statistics remain unverified. Do not copy invented numbers into a supposedly faithful remake.

## 3. Scope and stages

### Stage A: prove the loop

One room, one deposit base, one passive target, player movement, automatic tentacle capture, limited cargo, four upgrades, respawning targets, and saving. Use simple 3D placeholder meshes for mechanics, alongside an early polished visual slice containing the creature, animated tentacles, one target, and one room. Validate visual quality and phone performance before expanding content.

### Stage B: playable MVP

- One interconnected facility with four zones: containment, service wing, security sector, and reactor hall.
- Six target archetypes: worker, runner, technician, guard, armored guard, and boss.
- Ten XP levels; two visible evolution forms.
- Eight upgrade tracks, three currencies, twelve quests, one foreground production structure, one delivery helper, one boss.
- Three-card level-up perk choices from a small curated pool.
- Touch and keyboard controls; local persistence; save export/import.
- Cached play without an internet connection after an initial online load. All earnings require the game to be visible and running; no elapsed-time rewards.
- A 60–120 minute target for first completion at normal active play pace. This is a tuning goal, not a measured estimate.

### Stage C: expanded release

Add a cold biome, two new enemy types, another base, a catcher helper, industrial production chains, reactor summons, additional evolution tiers, and more quests. Add cloud sync only when there is a demonstrated need.

### Stage D: optional live content

Seasonal event targets and milestone rewards. Public rankings require server-validated progression; local-only saves are insufficient for trusted competition. Paid progression is excluded from every release stage.

Keep multiplayer, user accounts, ads, prestige resets, and procedural worlds outside the MVP. Paid progression remains excluded from the entire product. Any future monetization must be independent of gameplay speed, such as an upfront purchase, cosmetics, or substantive expansion content.

## 4. Core gameplay rules

All numerical values below are proposed starting values, not extracted from Alien Invasion.

### Movement and camera

Use a floating virtual joystick within a configurable lower-screen region. Support left- and right-handed modes, WASD, and arrow keys. Normalize diagonal movement and use a small dead zone. Camera follows with mild smoothing and clamps to room boundaries. Walls and locked doors block movement.

Only movement is needed during ordinary harvesting. Menus pause the single-player simulation. A full cargo indicator gives a clear route back to base.

### Automatic capture

Eligible targets must be alive, in the same accessible area, within radius, visible across unobstructed space, and affordable in remaining cargo space. Assign at most one target to each tentacle. Keep existing assignments stable; select nearest eligible targets for empty slots.

Proposed starting stats: speed 3 metres/second, radius 1.9 metres, two tentacles, capture power 10 units/second per tentacle, cargo capacity 20 units, health 100. Targets have capture resistance and cargo weight separately from resource payout.

Capture progress increases by `capturePower / resistance * dt`. Completion at 1 consumes the target, awards XP, and moves its resource payout into unbanked cargo. Reserve cargo weight when assigning a tentacle so simultaneous completions cannot overflow capacity. Release reservations when a target is lost or destroyed.

If a target leaves range, allow a 0.3-second grace window, then decay progress over one second. This proposed forgiveness makes touch chasing less frustrating. Do not advertise it as the reference game's rule.

Animate a reusable curved 3D tentacle mesh to each captured target, a readable progress indicator, and a short dissolve effect on completion. Avoid gore as the default art direction.

### Cargo and deposit

Treat cargo as a list of captured drops with weights and rewards, not a second spendable wallet. Auto-deposit while within the base zone at a fast fixed throughput. Spend upgrades only from banked resources. A delivery helper transfers cargo to itself and later deposits it; transfers never create resources.

### Hostile targets and death

Guards detect, pursue, attack on cooldown, and return to their spawn area if lured too far. Workers wander or flee; runners are faster but unarmed. The boss uses clear windups and a slow charge that rewards circling and maintaining capture range.

At zero health: return to base, restore health, discard unbanked cargo, retain banked resources, purchased upgrades, completed quests, and XP. Cancel ongoing capture progress and show what was lost. Make the first death forgiving through an explicit tutorial exemption.

## 5. Progression and economy

| Currency | Sources | Uses |
| --- | --- | --- |
| Biomass | Ordinary captures, foreground production structure | Core stats, helper capacity, farm upgrades |
| Genetic material | Technicians, special targets, quests | Mutation upgrades and evolution |
| Reactor parts | Armored guards, boss, late quests | Late doors and reactor repair |

XP is not spendable. Captures award XP immediately; deposited drops award currency. Quests that ask for captures advance on capture, while delivery quests advance on banking.

Upgrade tracks: capture power, cargo capacity, radius, movement speed, tentacle count, maximum health, regeneration, and resource yield. Choose costs from the desired active-play time to an upgrade: `cost = targetMinutes * measuredNetIncomePerMinute`. Store tuned costs by progression band. Avoid unlimited exponential costs paired with linear gains, which can create escalating grind. Compare upgrade costs against currently reachable resources and travel/capture constraints, not theoretical maximum income. Tentacles use milestone unlocks and a small cap. Cap radius and speed to preserve map readability. Define multiplier order centrally to avoid accidental compounding.

Evolution requires an explicit quest milestone, a genetic-material cost, and purchased mutation levels. It changes the creature silhouette and raises selected upgrade caps. XP levels unlock areas and trigger perk selection; they do not automatically buy evolution.

Perks: offer three distinct legal cards on level-up. Initial examples are +10% cargo, +8% capture power, +5% movement speed, +10% farm production, and one-time biomass rewards. Store the generated options immediately so reloads do not reroll them. Cap repeatable perks. Queue choices if multiple levels are gained at once. No paid rerolls, random paid upgrades, or purchases that affect these choices.

Doors show every requirement and current progress. Never consume required resources before all requirements are met. Unlock and cost deduction are one transaction.

Balancing targets: first capture within 20 seconds; first upgrade within two minutes; first new room within 5–10 minutes; useful upgrades every 2–5 minutes early on; ordinary base runs of roughly 30–90 seconds. These are hypotheses to validate through playtesting.

Measure bottlenecks using capture yield per second, travel time, cargo filling time, helper throughput, and upgrade payback time. Increasing enemy resistance should be matched with a meaningful reward increase. Run automated economy simulations in addition to human playtests.

## 6. Quests and map content

Quest types: capture N targets, bank N resources, buy an upgrade, unlock a room, evolve, defeat a boss, build a structure. Quests use persistent IDs and explicit prerequisites; rewards are claimed once.

| Zone | Teaching purpose | Main content | Exit requirement |
| --- | --- | --- | --- |
| Containment | Move, capture, deposit, upgrade | Workers; base; simple resource loop | Level 2 and tutorial completion |
| Service wing | Chase and automate | Runners, technicians, farm, delivery helper | Level 4 and genetic-material objective |
| Security sector | Kite and protect cargo | Guards, armored guards, second resource route | Level 7 and first evolution |
| Reactor hall | Combine systems | Boss arena; reactor repair endpoint | Boss defeat and repair quest |

Use one handcrafted map with short connections, distinctive rooms, and optional farming alcoves. Place unlocks where players can see the next objective. Do not repeat the reference map layout. Treat the boss and repaired reactor as the MVP's clear completion condition, with free play afterward.

## 7. Foreground progression and pause behavior

All resources, XP, production, helper activity, respawns, and gameplay cooldowns advance only during visible, unpaused simulation time. Stationary foreground harvesting may operate normally, but the economy must never require leaving the game running unattended.

On page hide, app switching, screen lock, or a pause menu: freeze the simulation, stop audio as appropriate, clear joystick input, and save. On resume: restore exactly the saved state, reset the timestep accumulator and frame timestamp, and continue without replaying missed time. Opening another browser tab must not produce income.

No farm catch-up, offline helper income, daily income grant, welcome-back reward, real-world replenishment timer, or return notification is included. Foreground production structures may accumulate within their storage cap only from simulation ticks. Persist remaining cooldown duration, not a wall-clock completion date.

Playing without an internet connection is allowed when assets are cached; this is distinct from earning while away. Mobile browsers suspend or throttle hidden pages [T2], but our pause behavior is explicit and applies consistently on desktop too.

### Fair progression requirements

- Balance the entire reachable campaign around ordinary play with zero spending, zero advertisements, and zero offline earnings.
- Early meaningful upgrades target 2–5 minutes; later upgrades target 5–10 minutes. Major zone or evolution milestones target 15–30 minutes of varied play. These are provisional pacing budgets, not guaranteed observed times.
- Define meaningful progress as a new capability, worthwhile stat improvement, quest completion, or unlock. Cosmetic micro-rewards do not disguise a stalled economy.
- Increase rewards alongside tougher capture resistance and longer routes. New zones must offer viable income at their entry-level stats.
- Bosses should test positioning and target selection. Required preparation fits the milestone budget and comes from accessible ordinary enemies or quests. Avoid rare mandatory drops or repeated boss kills just to open the next door.
- Cold exposure should introduce route and shelter decisions rather than suppressing normal earnings until a long resistance grind is complete.
- Offer safe, competitive sources for required currencies so deaths or poor early purchases cannot trap the player. Allow free upgrade respecs at base where choices are mutually exclusive.
- No energy system, mandatory real-time waits, paid multipliers, premium helpers, purchased inventory capacity, temporary speedups, or intentionally degraded base rates.
- Any optional monetization must not alter resource income, target resistance, cargo capacity, upgrade prices, or progression timers. Cosmetics provide no statistical advantage.

Validate with zero-spend economy simulations for balanced upgrades, capacity-focused play, power-focused play, and a plausible inefficient novice. Include travel, respawns, deaths, and delivery throughput. Flag a required milestone above its budget, or a consecutive progression-band increase in time-to-upgrade above 1.5x without a deliberate content justification. Use median and slower-player playtests; simulations alone cannot establish fun.

## 8. Mobile web requirements

- Target iOS Safari and Android Chrome, plus desktop Chrome, Firefox, and Safari. Publish a supported-browser matrix after actual device verification.
- Portrait-first layout; landscape remains playable. Support 360–430 CSS-pixel phone widths, tablets, browser toolbar changes, and safe-area insets.
- Use Pointer Events and pointer capture; reset joystick on pointer cancel, page hide, modal open, and orientation change. Prevent scrolling only within the game interaction surface.
- Minimum 44 CSS-pixel interactive targets. Do not encode resources or danger by color alone.
- Unlock audio on first user gesture. Offer separate sound/music controls and reduced effects. Haptics are optional and must degrade gracefully.
- Optional installable PWA; browser play remains the primary path. Do not depend on fullscreen or orientation lock being available.
- Aim for 60 FPS with a 30 FPS low-power mode. Cap device pixel ratio, pool target meshes, reuse materials, instance compatible static geometry, and limit particles and shadow casters. Provide quality presets without changing the art style.
- Initial content download target below 15 MB compressed for the initial room and creature. Load later biomes on demand. Memory and entity budgets are provisional until device profiling.
- Initial stress case: 150 visible targets, 200 active nearby targets, four helpers, eight tentacles. Spatial indexing and offscreen AI throttling should prevent all-target searches every frame.

## 9. Software architecture

Use Babylon.js for 3D rendering and scene management [T7], with TypeScript game rules independent of the renderer. Start with a WebGL2 renderer; WebGPU is optional after compatibility testing. Use lightweight 2D movement/collision calculations on the X/Z plane instead of full rigid-body physics.

Suggested modules:

```text
src/game/scenes/       boot, world, overlays
src/game/systems/      movement, capture, cargo, combat, AI, spawning
src/domain/            progression, economy, quests, foreground production
src/content/           typed enemy, upgrade, quest, zone, perk definitions
src/persistence/       save schema, migrations, export/import
src/ui/                HUD, upgrades, quest panel, settings
assets/                original GLB models, textures, room manifests, audio
```

Run simulation at a fixed 30 Hz with interpolation for rendering. Limit catch-up work after stalls; discard background time completely on resume. Use a spatial hash for capture/aggro queries. Define enemy states as wander, flee, chase, attack, return, captured, respawn. Delivery helpers use seek player, transfer, return base, deposit, repeat. Use a simple room navigation grid if walls require routing.

Store content as validated JSON or TypeScript definitions with stable IDs. The save contains schema version, content version, banked resources, cargo, XP, evolution tier, upgrades, perks, pending perk choices, quests, unlocked zones, structures, helpers, position, settings, and remaining gameplay cooldown durations. No income timestamps or elapsed-time reward accounting exist. Do not serialize renderer objects or transient tentacles.

Save every ten seconds and after purchases, deposits, quest rewards, level-ups, and unlocks. Use IndexedDB transactions, keep a previous valid snapshot, and validate imported files before replacing progress. Handle write failure visibly without erasing the previous save. Browser storage can be cleared or evicted; export/import is a first-class recovery feature. Block simultaneous writers using a single active-tab policy.

## 10. Tools

| Tool | Role | Selection |
| --- | --- | --- |
| [Babylon.js](https://www.babylonjs.com/specifications/) | 3D rendering, scene management, camera, materials, animation | Required engine [T7] |
| [TypeScript](https://www.typescriptlang.org/) | Game/domain code | Required |
| [Vite](https://vite.dev/guide/) | Dev server and production bundling | Recommended [T3]; pin a tested stable version |
| Blender + typed room manifests | Modular 3D rooms; spawn, collision, door, and trigger data | Recommended level workflow; validate exported marker IDs |
| [Dexie](https://dexie.org/) | IndexedDB save access | Recommended persistence wrapper [T5] |
| [Vitest](https://vitest.dev/) | Economy, capture, save, and quest unit tests | Recommended |
| [Playwright](https://playwright.dev/docs/emulation) | Automated browser flows and viewport/touch checks | Recommended [T6]; supplement with physical phones |
| [Krita](https://krita.org/) | Original texture painting and UI art | Recommended; pixel-art sprites are not the visual target |
| [Blender](https://www.blender.org/) | Model, UV, rig, animate, bake, and export GLB assets | Required asset pipeline |
| [Audacity](https://www.audacityteam.org/) | Capture sounds, UI sounds, audio cleanup | Optional audio production |
| Browser devtools and Safari Web Inspector | Profiling, input, memory, device debugging | Required during mobile validation |
| Git and a repository host | Source history and CI | Required |
| HTTPS static hosting/CDN | Serve the game and cached assets | Sufficient for local-save MVP |
| React | Rich DOM menus or a surrounding site | Optional; keep entity updates out of React state |

Visual quality depends on asset production and art direction, not the engine alone. No native iOS toolchain is needed. A backend is optional for personal cloud saves and required for trusted public competition.

### 3D visual production requirements

Create original rigged creature models with a dark glossy organic surface, contrasting tentacle tips, distinct evolution silhouettes, and idle/movement/capture feedback. Build stylized human crowds with consistent scale, readable colors, and restrained animation. Match the reference camera framing using an orthographic or long-focal-length perspective camera selected through side-by-side review.

Use modular floor/wall/door pieces, baked ambient shading, limited dynamic shadows, subtle emissive accents, and restrained particles. Tentacles must visibly extend, attach, bend, and retract; upgrade the hero animation before adding expensive full-screen effects. Keep captures and target silhouettes legible on a small phone screen.

Export GLB meshes and animations from Blender. Use shared materials, compressed textures, and appropriate mesh detail. Profile skinned crowds separately; instancing is not a blanket solution for independently animated characters. Set final polygon, draw-call, texture, and shadow budgets from the initial polished scene on baseline phones.

Visual acceptance requires a recorded comparison of the same camera distance, crowd density, movement, and capture action against the reference. Evaluate animation continuity, shading, silhouettes, environment detail, and UI readability. Aim for equal or better visual quality at a stable mobile frame rate; do not declare this achieved before device review.

## 11. Verification and release gates

Meaningful automated checks:

- Captures cannot cross walls, exceed tentacle slots, or overfill reserved cargo.
- Base and helper transfers conserve resources; death removes only the intended cargo.
- Purchases and quest rewards cannot double-apply.
- Door transactions are atomic and prerequisite graphs have no impossible cycles.
- Hiding or closing the game for any duration grants zero resources, XP, production, respawns, or cooldown advancement. Forward and backward clock changes have no effect.
- Zero-spend progression simulations meet pacing budgets across early, middle, and late content; inefficient but plausible choices cannot cause a dead end.
- Saves migrate, malformed imports fail safely, and old snapshots remain recoverable.
- Reload preserves perk options and progression.

Device checks: a complete tutorial on a physical iPhone and Android phone; simultaneous joystick and UI taps; interrupted input; rotation; background/resume; mute/unmute; offline reload after caching; low-power mode; 20-minute stress play; browser storage failure handling. Browser emulation does not substitute for mobile GPU and Safari testing.

MVP acceptance: a new player reaches the boss and completion screen without developer intervention; all twelve quests are reachable; no paid action is needed; reload restores progression; backgrounding produces zero earnings and pauses cooldowns; the full campaign meets zero-spend pacing budgets; target stress case maintains at least 30 FPS on the agreed baseline phones. Record the phone models and browser versions before declaring performance done.

## 12. Build order and remaining decisions

1. Build a polished 3D visual slice and prove movement, capture feel, cargo return, and one upgrade on a phone.
2. Add data-driven upgrades, target variety, XP, quests, and locked rooms.
3. Add persistence and strict pause/resume behavior early; test zero earnings across suspension and reload.
4. Add helpers, evolution, perks, and boss; simulate the economy.
5. Expand the approved 3D visual slice into production assets; profile and optimize on phones.
6. Add PWA caching, export/import, recovery UI, and static deployment.
7. Expand into winter and factories only after the MVP is enjoyable and stable.

Full 3D visual fidelity is now a requirement. The remaining art decisions are the precise camera projection, creature style, and reference-comparison criteria; these must be resolved in the first visual slice. Before attempting a closer remake, record the current game's first session and late-game screens to validate capture reset behavior, helper rules, modern level-up perks, and map changes. Exact cloning is not a prerequisite for this original implementation.

## Sources

Reference game:

- R1: [Official Canadian App Store listing and version history](https://apps.apple.com/ca/app/alien-invasion-rpg-idle-space/id6443697602), retrieved 13 October 2026.
- R2: [Level Winner: detailed early-game guide](https://www.levelwinner.com/alien-invasion-rpg-idle-space-guide-tips-tricks-strategies/), 12 January 2023.
- R3: [Pocket Gamer: beginner guide](https://www.pocketgamer.com/alien-invasion-rpg-idle-space/guide/), 10 February 2023.
- R4: [mTurboGamer: Amplifier 1 and freezing](https://mturbogamer.com/2023/11/alien-invasion-amplifier-1-quest/), November 2023.
- R5: [mTurboGamer: reactor and portal](https://mturbogamer.com/2024/01/alien-invasion-rpg-reactor-portal/), 11 January 2024.
- R6: [Player discussion: bot shop offline behavior](https://www.reddit.com/r/AlienInvasionRPG/comments/15eapmi/), 2023; search-indexed excerpts, direct page retrieval unavailable.
- R7: [Player discussion: offline progress](https://www.reddit.com/r/AlienInvasionRPG/comments/144b28y/), 2023; search-indexed excerpts, direct page retrieval unavailable.

Technical primary documentation:

- T1: [Phaser overview](https://docs.phaser.io/phaser/getting-started/what-is-phaser).
- T2: [MDN: Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).
- T3: [Vite guide](https://vite.dev/guide/).
- T4: [Tiled](https://www.mapeditor.org/).
- T5: [Dexie](https://dexie.org/).
- T6: [Playwright emulation](https://playwright.dev/docs/emulation).
- T7: [Babylon.js specifications](https://www.babylonjs.com/specifications/).

Tool choices and all proposed game rules are engineering recommendations. Numerical targets require profiling and playtesting.
