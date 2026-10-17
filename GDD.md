# Alien Evolution — Game Design Document

**Version:** 1.0 draft · **Date:** 2026-10-14 · **Status:** Prototype baseline; values require playtesting

> Collaboration note: This is the shared source of truth for ChatGPT and Claude. Update this file when decisions change. Preserve decisions in the Change Log, and distinguish implemented behavior from proposed specifications. All balance values are provisional. No offline earnings, forced ads, pay-to-win, or deliberate progression walls.

## 1. Game overview

- **Genre:** Top-down 3D alien evolution/action-collection RPG inspired by the gameplay loop of *Alien Invasion RPG: Idle Space*, with original art, branding, audio and content.
- **Platforms:** Mobile and desktop browsers, responsive to portrait/landscape.
- **Stack:** TypeScript, Three.js, React, Vite, ECS-style headless game-core; optional Fastify/PostgreSQL backend.
- **Perspective:** Fixed-angle orthographic camera, tilted 55° from horizontal, following the player with ~120 ms damping. Visible width ~22 m desktop, ~16–20 m mobile; zoom 0.85–1.3×.
- **Gameplay:** Freely move; tentacles automatically acquire, attack and consume targets; collect biomass and other resources; upgrade and mutate; explore interconnected zones; complete missions and bosses.
- **Play:** Single-player at launch. 5–30 min sessions; longer possible. Target 12–20 hours main campaign, excluding repeatables, subject to actual content testing.
- **Business:** Entire campaign free. Optional cosmetics only, added after core validation. No paid power, premium currency conversion, forced advertisements, energy or streak penalties.
- **Offline:** Simulation pauses when page is hidden/closed; no offline earnings. Save regularly.

### Design pillars
1. Immediate tactile collecting feedback.
2. Fair, comprehensible progression; choices instead of grind walls.
3. Visually and mechanically meaningful evolution.
4. Satisfying free movement and automatic combat, with positioning and tactical abilities.
5. Respect players' time; events are optional, essential unlocks remain available.
6. Replayability through builds, bosses, expeditions and challenges rather than inflated numbers.

## 2. Controls and camera

| Action | Desktop | Mobile |
|---|---|---|
| Move | WASD | Virtual joystick |
| Capture | Auto | Auto |
| Dash | Space | Ability button |
| Abilities | 1–3 | Touch buttons |
| Interact | E | Contextual prompt |
| Upgrade | U / menu | Menu |
| Map | M | Map button |

- Default tentacle targeting nearest; optional weakest/strongest/mission priority.
- Camera stays near centre, clamps at borders. Reduced-motion option; no essential information conveyed by colour alone.
- Touch targets ≥44×44 CSS px, safe-area aware, no page scrolling during touch gameplay.

## 3. Core combat

### Starting stats

| Stat | Value |
|---|---:|
| Movement | 5 m/s |
| Radius | 2.4 m |
| Tentacles / simultaneous slots | 2 |
| Damage per hit | 10 |
| Attack interval | 0.8 s per tentacle |
| Cargo | 100 units |
| HP | 100 |
| Armour | 0 |
| Crit chance / multiplier | 0% / 1.5× |
| Regeneration | 1 HP/s after 5 s out of combat |
| Dash | 4 m over 0.25 s; 8 s cooldown; 0.15 s mid-dash invulnerability |

Target score (normalized parts 0–1): `S = 0.45*proximity + 0.25*vulnerability + 0.20*playerPriority + 0.10*movementThreat`. Avoid targeting dead or already-doomed enemies where possible. Multiple tentacles may focus one target.

Damage: `actual = max(1, baseDamage * mutationMultiplier * critMultiplier * 100/(100+targetArmour))`. Fractional damage maintained internally. Attack interval hard minimum 0.25 s; total movement hard cap 12 m/s.

At 0 HP, target plays a ~0.35 s absorption animation while the player can keep moving/attacking. Rewards granted exactly once. XP granted immediately; biomass/research loot enters cargo if space exists, otherwise persists as recoverable world drops for ≥3 active minutes. No cargo-full combat lockdown. Player death: respawn without resources loss; boss retries free.

| Status | Rules |
|---|---|
| Poison | 20% of triggering hit each second for 4 s; ≤2 stacks |
| Slow | -30% movement for 3 s, strongest only |
| Stun | 1 s; ordinary enemies immune for 5 s after it ends |
| Shield | Absorbs a defined amount of damage |
| Mark | +15% damage received for 5 s |
| Regeneration | Restores HP over time |

Bosses immune to hard stuns but can be slowed by explicitly supported effects.

## 4. Economy

### Currencies

- **Biomass:** Regular captures, core upgrades; 1 unit consumes 1 cargo slot.
- **Genetic Samples (GS):** Elites/bosses/exploration, mutations; no cargo footprint.
- **Research Components (RC):** Missions/drones/research; 1 unit occupies 5 cargo slots when carried.
- **Experience (XP):** Captures and missions; drives character levels and evolution points.
- No premium currency purchasing power.

### Target rewards

| Target | Biomass | XP | Other |
|---|---:|---:|---|
| Civilian | 4 | 2 | — |
| Scientist | 8 | 5 | — |
| Guard | 12 | 8 | — |
| Armoured soldier | 22 | 15 | — |
| Security drone | 15 | 10 | 10% chance 1 RC |
| Elite soldier | 60 | 40 | 1 GS |
| Mutated specimen | 80 | 50 | 2 GS |
| Convoy vehicle | 120 | 70 | 3 RC |
| Regional boss | 300–1,200 | 150–600 | 10–25 GS |

Loot rolls should be seeded. Essential progression never depends solely on random drops.

### Core upgrade price

For levels already purchased `n`: `C(n) = round(C0*(1+r)^n)`, minimum 1.

| Upgrade | Base C0 | Growth r | Levels | Effect per level |
|---|---:|---:|---:|---|
| Speed | 20 | .09 | 20 | +0.15 m/s (max base 8) |
| Damage | 25 | .10 | 30 | +2 damage (max base 70) |
| Radius | 30 | .12 | 15 | +0.15 m (max base 4.65) |
| Attack interval | 40 | .11 | 20 | ×0.98 interval (~0.53 s at level 20) |
| Cargo | 15 | .08 | 25 | +20 units (max base 600) |
| HP | 25 | .09 | 20 | +10 HP (max base 300) |
| Regeneration | 30 | .10 | 15 | +0.2 HP/s (max base 4) |
| Crit chance | 100 | .14 | 10 | +2 percentage points (max 20%) |
| Crit damage | 100 | .12 | 10 | +0.10× (max 2.5×) |

Damage example: next costs at purchased levels 0/4/9/14/19/24/29 are ~25/37/59/95/153/246/396 biomass. All cost and stat previews displayed before purchase. Resources can be spent from permanent storage without returning to a deposit.

### Tentacle count milestones

| Total | Level requirement | Biomass cost |
|---|---:|---:|
| 2 | 1 | Free |
| 3 | 3 | 100 |
| 4 | 6 | 350 |
| 5 | 10 | 800 |
| 6 | 15 | 1,600 |
| 7 | 22 | 3,200 |
| 8 | 30 | 6,000 |

Every new tentacle is physically visible and animated.

### Cargo/deposit rules

Start cargo 100; deposit when within 2.5 m of a deposit point. ≥2 deposits per region, some activated by missions/research. Carried biomass/RC separated from stored balance. No resources deleted or silently duplicated. Remote/mobile deposits later. Stored resources spendable from UI anywhere.

### Pacing acceptance targets (hypotheses)

- First damage upgrade within 90 s; 3 upgrades affordable within first 5 min.
- Third tentacle within initial 20 min.
- No mandatory stationary AFK session and no mandatory random rare drop.
- Meaningful upgrades/activities every ~30–60 s early, 2–4 min by hour 1, 4–8 min hours 1–5, 6–12 min hours 5–20, 8–15 min after hour 20.
- `timeToUpgrade = cost / expectedBiomassPerMinute` only first-order model; proper simulation must include travel, combat, missions, drops, and opportunities.

## 5. Experience and evolution

`XP_to_next(L) = round(40 + 12L + 2L²)` for level L→L+1, cap level 40. Excess XP rolls over. Levels 2–40 grant 1 evolution point (EP) each.

Milestones: L2 mutations, L3 third tentacle, L5 first loadout, L6 fourth tentacle, L8 drones, L10 fifth tentacle, L12 presets, L15 sixth tentacle, L20 advanced hive, L22 seventh tentacle, L25 expedition prep quest, L30 eighth tentacle, L35 mastery, L40 cosmetic final evolution.

### Mutation tree

Mutations purchased in branch order. Cost below is EP and GS; complete branch 9 EP / 130 GS, all branches 27 EP / 390 GS. Max 8 equipped passives and 3 active abilities. All unlocked mutations remain owned when unequipped. Free respec outside combat refunds EP and GS.

| ID | Branch / mutation | Effect | Cost |
|---|---|---|---|
| H1 | Harvester: Wide Reach | +15% radius | 1 EP, 5 GS |
| H2 | Efficient Digestion | +10% biomass from ordinary captures | 1 EP, 10 GS |
| H3 | Chain Capture | After capture, immediate extra attack within 2 m, at most once/3 s | 2 EP, 20 GS |
| H4 | Magnetic Consumption | Pull resource drops within 6 m | 2 EP, 35 GS |
| H5 | Harvest Frenzy | Active: +30% attack speed, +20% radius for 8 s; CD 45 s | 3 EP, 60 GS |
| P1 | Predator: Swift Hunter | +12% movement speed | 1 EP, 5 GS |
| P2 | Serrated Tentacles | +15% tentacle damage | 1 EP, 10 GS |
| P3 | Venom Glands | Poison: 20% of hit per second for 4 s | 2 EP, 20 GS |
| P4 | Predatory Dash | Dash CD -30%, 30 damage to crossed enemies | 2 EP, 35 GS |
| P5 | Apex Instinct | Active: mark enemies within 7 m (+15% damage taken) 10 s; CD 60 s | 3 EP, 60 GS |
| B1 | Broodmother: Drone Hatchery | One free collector drone | 1 EP, 5 GS |
| B2 | Efficient Workers | +25% collector drone move speed | 1 EP, 10 GS |
| B3 | Swarm Call | Active: 2 combat drones for 12 s; CD 40 s | 2 EP, 20 GS |
| B4 | Hive Regeneration | Nearby drones restore 2 HP/s while player out of combat | 2 EP, 35 GS |
| B5 | Brood Command | Active: drones +50% speed/effectiveness 10 s; CD 60 s | 3 EP, 60 GS |

**Open balance issue:** Only EP are plentiful from leveling. GS supply, especially 390 for all mutations, must be tested against missions/elites/replayables. Mutations do not require spending money.

### Research tree

| ID | Prerequisite | RC | Effect |
|---|---|---:|---|
| R1 Cargo Relay | Region 1 mission 4 | 10 | New deposit location |
| R2 Drone Bay | R1 | 20 | +1 permanent drone slot |
| R3 Automated Routing | R2 | 35 | Drones auto-return to deposit |
| R4 Thermal Shield | Enter Region 3 | 40 | 30% lower positive cold accumulation |
| R5 Mobile Beacon | R3 | 50 | Temporary deposit for 3 min; CD 5 min |
| R6 Advanced Hive | R3, level 20 | 80 | +2 drone slots |
| R7 Neural Routing | R6 | 100 | Drone targeting of marked areas |
| R8 Expedition Scanner | Region 4 complete | 120 | Reveal expedition modifiers/reward pools |

Constructed permanent drone: 15 RC each; B1 grants first drone without construction charge.

## 6. Enemy roster and AI

| Type | HP | Speed m/s | Hit damage | Armour | Detect m | Pattern |
|---|---:|---:|---:|---:|---:|---|
| Civilian | 10 | 3.0 | 0 | 0 | 5 | Flee |
| Scientist | 18 | 3.6 | 0 | 0 | 7 | Flee to alarm |
| Guard | 60 | 3.2 | 6 | 5 | 9 | Melee patrol |
| Armoured soldier | 150 | 2.6 | 12 | 30 | 9 | Defence/charge |
| Security drone | 90 | 4.0 | 8 | 10 | 12 | Ranged/kite |
| Elite soldier | 350 | 3.0 | 18 | 25 | 14 | Multi-pattern |
| Mutated specimen | 500 | 4.2 | 20 | 15 | TBD | Chase/poison |
| Convoy vehicle | 800 | 5.0 | 15 | 40 | TBD | Road path/spawn guards |
| Arctic hunter | 250 | 3.7 | 14 | 20 | 11 | Circling/freezing |
| Alien rival | 700 | 4.5 | 25 | 25 | 16 | Dash/tentacles/retreat |

AI state graph: `Idle/Patrol → Alert/Investigate → Chase/Flee → Attack`; target lost 5 s→Return→Idle. AI tick 5–10 Hz based on proximity; movement smoothed each fixed simulation step.

- Melee: within 1.5 m, 0.4 s windup, range check at hit.
- Ranged: attempts to hold 5–9 m, projectile every 2 s, visibly dodgeable.
- Charge: 0.8 s directional telegraph, ≤6 m path.
- Area: 1 s warning, then damage.
- Freeze: -25% speed for 3 s, refresh duration, no multiplicative stacking.

Spawn zones define centre, radius, population limit, 12±3 s example respawn, and activation within ~35 m. Never spawn <7 m from player or in blocked nav. Offscreen AI suspended; global caps depend on device tier. Quest enemies have managed special spawns.

## 7. World and main campaign

Global coordinates: X east/west, Z north/south, Y vertical, 1 world unit=1 metre. Player collider radius 0.6 m; corridors 5–8 m; boss arenas 20–30 m diameter. Regions connect via traversable corridors and load incrementally.

### Region 1: Containment Facility

- **Extent:** 120×100 m; target ~45–75 min; starting region.
- **Schematic grid:** North row A Spawn / B Holding Cells / C Laboratory. Middle D Cargo Bay / E Central Hub / F Security. South G Storage / H Reactor / I Boss Arena. Rooms joined through wide doorways; exact geometry TBD.
- **Missions:**

| ID | Objective | Reward |
|---|---|---|
| R1-M1 Awaken | Capture 10 civilians | 50 biomass, 40 XP |
| R1-M2 First Growth | Buy 3 core upgrades | 80 biomass, 50 XP, 5 GS |
| R1-M3 Breach | Capture 8 guards, disable door | 120 biomass, 75 XP |
| R1-M4 Establish Hive | Activate hub deposit | 10 RC, 150 XP |
| R1-M5 Laboratory Specimens | Capture 10 scientists, find sample | 10 GS, 200 XP |
| R1-M6 Containment Failure | Defeat Security Chief | 300 biomass, 10 GS, 250 XP |

- **Boss:** Security Chief 1200 HP, 15 armour, 3 m/s, 12 melee damage. Charge every 8 s; at 50% HP deploy 2 guards and add warned ground slam. Defeat opens route to Region 2. Free retries; mission rewards once.

### Region 2: Military Complex

- **Extent:** 180×140 m; suggested level 6–15; 2–4 h.
- **Layout:** Crossroads linking A Barracks (NW), B Command (NE), C Supply Depot (SW), D Drone Hangar (SE); E convoy intersection (centre). Road patrols; Arctic exit north.
- **Mechanics:** Armour/facing, convoys, ranged drones, alarm terminals, sabotaged defences and deposits.

| ID | Objective | Reward |
|---|---|---|
| R2-M1 Reconnaissance | Discover 3 sites | 200 biomass, 10 RC, 200 XP |
| R2-M2 Drone Disruption | Destroy 12 drones | 15 RC, 300 XP |
| R2-M3 Supply Interception | Stop 2 convoys | 350 biomass, 15 RC, 300 XP |
| R2-M4 Mutant Experiment | Capture escaped specimen | 15 GS, 300 XP |
| R2-M5 Disable Defences | Sabotage 3 terminals | 20 RC, 350 XP |
| R2-M6 Break Command | Defeat commander | 600 biomass, 15 GS, 400 XP |

- **Boss:** Military Commander 4000 HP, 30 armour, 3 phases. Suppression, charge, shield, support drones. Two generators can be disabled before the fight to reduce difficulty; defeat opens Arctic route.

### Region 3: Arctic Research Station

- **Extent:** 200×180 m; suggested level 13–25; 4–6 h.
- **Layout:** A Entry Camp southwest; B Heater Station northwest; C Research Lab northeast; D Frozen Lake centre; E Mutant Nest southeast; interconnected sheltered/heated routes.
- **Cold meter:** `E_next=clamp(E+(coldRate-protectionRate)*dt,0,100)`; normal exterior +2/s, blizzard +4/s, heat station -8/s. Thermal Shield -30% positive cold. Exposure 0–49 none; 50–74 -10% speed; 75–99 -20% speed; 100 -2% max HP/s. Players can use heaters, sheltered passages, preparation, or speed routes.

| ID | Objective | Reward |
|---|---|---|
| R3-M1 Cold Arrival | Reach heater | 300 biomass, 15 RC, 400 XP |
| R3-M2 Restore Power | Activate 3 heaters | 30 RC, 500 XP |
| R3-M3 Research Recovery | Recover 4 samples | 25 GS, 500 XP |
| R3-M4 Frozen Threat | Kill 15 Arctic hunters | 450 biomass, 600 XP |
| R3-M5 Thermal Breach | Reach reactor by any method | 20 RC, 600 XP |
| R3-M6 Specimen Zero | Defeat abomination | 800 biomass, 20 GS, 700 XP |

- **Boss:** Arctic Abomination 9000 HP, armour 20. Freeze cone, ice hazards, slam; 4 heaters in arena; patterns change at each 25% HP. Opens Region 4.

### Region 4: Alien Crash Site

- **Extent:** 220×200 m; suggested level 23–40; 5–8 h.
- **Layout:** A Landing Zone NW; B Spore Fields NE; C Crashed Wreck centre; D Rival Nest SW; E Core Chamber SE.
- **Mechanics:** Rival aliens, poisonous spores, experimental mutations, hidden research, minibosses, expedition unlocks.

| ID | Objective | Reward |
|---|---|---|
| R4-M1 Contact | Inspect wreck | 500 biomass, 30 RC, 700 XP |
| R4-M2 Rival Hive | Defeat 3 rival aliens | 30 GS, 800 XP |
| R4-M3 Biological Secrets | Find 5 research sites | 30 GS, 900 XP |
| R4-M4 Restore Core | Activate 4 ship systems | 50 RC, 1000 XP |
| R4-M5 Hive Supremacy | Defeat brood leaders | 40 GS, 1200 XP |
| R4-M6 Ascension | Defeat Prime Organism | 1200 biomass, 25 GS, 1500 XP |

- **Boss:** Prime Organism 18000 HP, armour 25, 28 m arena; phase 1 sweeps, phase 2 summons/hazards, phase 3 copies one equipped active player mutation. Free retries. Finishes story, opens full expedition mode.

## 8. Endgame and events

**Expeditions:** 5–15-minute repeatable runs constructed from authored room templates: entry, 2 combat/collection rooms, objective, optional bonus, final. Difficulty tiers:

| Tier | HP mult | Enemy damage mult | Rewards mult |
|---|---:|---:|---:|
| 1 | 1.0 | 1.0 | 1.0 |
| 2 | 1.3 | 1.2 | 1.25 |
| 3 | 1.6 | 1.4 | 1.5 |
| 4 | 2.0 | 1.7 | 1.8 |
| 5 | 2.5 | 2.0 | 2.2 |

Tiers unlock sequentially; essential progression not exclusive to high tiers. Daily 3 optional rotating missions; weekly objectives have no streak pressure or indispensable timed rewards. Event archetypes: convoy raid (3–6 min), hive defence (~5 min), specimen escape (3–8 min). Event content replayable; cosmetics may be time-limited but gameplay power cannot be.

**Possible later feature:** asynchronous Hivemind group projects. Solo alternatives to any functional rewards. Defer until there is verified demand.

## 9. Technical architecture

### Layout

```text
alien-evolution/
├── apps/
│   ├── game-web/            # Vite + React shell + Three.js canvas
│   └── game-api/            # Fastify: auth, sync, events, cosmetics
├── packages/
│   ├── game-core/           # pure TS ECS, fixed-step movement/combat/AI/economy
│   ├── game-content/        # validated enemy, upgrade, mission, zone and loot definitions
│   ├── game-renderer/       # Three.js scene, assets, FX, camera, animations
│   ├── game-ui/             # React HUD, menus, map
│   ├── game-audio/          # event-driven sound
│   ├── game-shared/         # types, API schemas, serialization
│   └── game-tools/          # balance simulator, content/level validators
├── tests/
├── tools/
└── docs/
```

### Simulation

- Game runs at **fixed 60 Hz** (`dt=1/60`), rendered independently. Clamp accumulator to 0.25 s to avoid spiral-of-death. On tab resume reset timing, **do not** simulate time absent.
- Systems: input → movement → AI → combat → capture → spawn → progression → rendering observation. System order deterministic where necessary. Pure headless `game-core` must not depend on React or Three.js.
- Rapier handles collisions/projectiles where appropriate; glTF assets authored in Blender. Game content loaded as versioned data and validated with Zod/discriminated unions.
- Components: Transform, Velocity, Collider, Health, CombatStats, Targeting, AIState, LootTable, SpawnOrigin, StatusEffects, CaptureState, Renderable, PlayerProgression.
- Local-first IndexedDB saves, ~30 s autosave and immediate dirty flag on critical transactions; save on visibility changes/navigation when possible. Optional cloud revision-based sync. Migration by schemaVersion; conflict UI, never silent overwrite. Account not required.
- Client-authoritative world suits initial single-player; it is **not cheat-proof**. Competitive results or shared economies need server-verifiable or server-authoritative mechanisms later.

### Content contracts (outline)

```ts
type UpgradeDefinition = {
  id: string; name: string; stat: string;
  baseCost: number; growthRate: number; maxLevel: number;
  effectPerLevel: number; effectMode: 'additive'|'multiplicative';
  prerequisites?: string[];
};
type EnemyDefinition = {
  id: string; displayName: string; maxHealth: number;
  armour: number; speed: number; damage: number;
  attackInterval: number; detectionRadius: number;
  aiArchetype: 'flee'|'melee'|'ranged'|'elite'|'boss';
  biomassReward: number; xpReward: number;
  lootTableId?: string; modelId: string;
};
type MutationDefinition = {
  id: string; branch: 'harvester'|'predator'|'broodmother';
  tier: 1|2|3|4|5; evolutionPointCost: number;
  geneticSampleCost: number; prerequisiteIds: string[];
  kind: 'passive'|'active'; effectId: string;
  cooldownSeconds?: number;
};
type MissionDefinition = {
  id: string; regionId: string; title: string;
  prerequisiteMissionIds: string[];
  objectives: Array<{
    type:'capture'|'defeat'|'interact'|'discover'|'collect'|'upgrade';
    targetId: string; requiredCount: number;
  }>;
  rewards: { biomass?:number; xp?:number; geneticSamples?:number; researchComponents?:number };
  completionFlags: string[];
};
```

`SaveGame` needs schemaVersion, saveId, revision, lastSavedAt; player (level/xp/position/region/HP/upgrades/mutations/equipped passives+abilities/free EP); resources (stored and carried biomass, GS, stored and carried RC); progression (missions/zones/research/bosses/discoveries); drones; active encounters as needed; settings (graphics/audio/reduced motion). No rewards based on wall-clock `lastSavedAt`.

### Performance budgets (targets to test)

- 60 FPS desktop, 45–60 midrange mobile, playable ≥30 FPS; target input latency <100 ms.
- ~40–80 nearby enemies and up to ~200 decorative/noninteractive targets depending on device tier; initial compressed bundle target <15 MB plus streamed area assets.
- Instanced compatible meshes, pooled AI/projectiles/particles, compressed textures, LOD/culling, bounded particle transparency, reduced remote AI ticks, chunked zone loading and measured GPU memory.
- Test Chrome desktop, Safari iOS, Chrome Android, touch portrait and landscape, background/foreground, unstable connectivity.

## 10. Telemetry and test strategy

Capture only minimum privacy-conscious, pseudonymous events: session_started/ended, region_entered/completed, mission_started/completed/abandoned, enemy_defeated, player_defeated, upgrade_purchased, mutation_unlocked/equipped, research_completed, boss_attempted/defeated, expedition_started/completed, performance_sample.

Track: time to upgrade, time between meaningful rewards, boss retries, mission abandonment, build diversity, main-story completion, active gameplay time excluding idle, D1/D7 return, performance by device. Explain and allow privacy preferences; gameplay works without analytics network access.

### Headless balancing simulator (mandatory)

Profiles: casual, efficient, combat-focused, collector-focused, completionist; seeded runs. Simulate travel, encounters, earnings, XP, upgrade purchases, mission triggers and deaths, not just cost formulas.

Hard failures: progression dead ends, inaccessible quest rewards, mission prerequisite cycles, unkillable mandatory bosses under reasonable builds, impossible resource requirements, invalid/negative costs, spawn in blocked geometry, XP overflow, duplicate reward grants. Soft warnings: playtime deviation, >15-minute reward gaps, difficulty spikes, build dominance.

### Core acceptance

- Movement/tentacles consistent regardless of FPS.
- Correct automatic targeting, status stacking and dash immunity.
- Cargo overflow doesn't erase earnings; deposits don't duplicate currency.
- Upgrade prices/effects match data, mutation respec exact refunds.
- Entire main mission path possible with free content and guaranteed critical resources.
- Boss retries have no currency penalty.
- Every region traversable and spawns legal; cloud saves do not silently overwrite.
- No progress accrued with browser closed; correct handling of visibility changes.
- Touch controls work on small phones; reduced-motion and graphics options function.

## 11. Milestones and delivery gates

1. **Foundation:** Three.js orthographic world, model, camera, controls, collision; movement works mobile/desktop.
2. **Capture loop:** 3 target archetypes, automatic tentacles, damage/absorption, respawning, feedback.
3. **Economy:** Biomass, cargo/deposit, damage/speed/radius upgrades and save.
4. **Evolution:** XP, EP, ability/mutation system and at least two visibly distinct builds.
5. **Combat:** Guards, ranged enemies, hazards, death/retry, boss mechanics.
6. **Complete Region 1:** Six missions, boss, polished encounters; validated playtime.
7. **Accounts/saves:** Offline/local guest save and optional cloud account, version migrations.
8. **Region 2:** Military enemies, convoys, boss.
9. **Region 3:** Cold system, traversal choices, boss.
10. **Region 4:** Rival aliens, final boss, campaign complete.
11. **Expeditions:** Modular encounters/challenges with repeatable rewards.
12. **Launch prep:** Performance, QA, telemetry, economy tuning, accessibility, optional cosmetic monetization.

**First prototype scope:** 40×40 m arena, alien with 2 tentacles, civilian/scientist/guard, AI/respawn, damage/capture, biomass with FX, speed/damage/radius upgrades, cargo/deposit, 1 meaningful mutation, desktop/mobile controls, local auto-save. Do not build all four areas before this feels excellent.

## 12. Open issues and decisions

- [x] Post-Apex customization goal selection (2026-10-16): the user accepted picking a specific desired feature before working toward its unlock. See [the plan](docs/APEX_CUSTOMIZATION_PLAN.md); implementation is pending.
- [ ] Plan the remaining post-Apex customization details: keep four body models, then unlock colors, effects, wings and limb variants through later evolutions. See [the proposal](docs/APEX_CUSTOMIZATION_PLAN.md). Goal switching/progress rules, cosmetic-only rewards, challenge requirements, initial slots and asset compatibility remain open; no runtime changes.
- [ ] Finalize finite progression implementation: the user agreed to planning Hatchling → Juvenile → Adult → Apex, separate leveling and three one-time evolutions without cycling names. See the [design direction](docs/PROGRESSION_REDESIGN.md) and [migration plan](docs/PROGRESSION_MIGRATION_PLAN.md). Numerical level cap/gates, rewards, endgame difficulty and legacy-save conversion remain subject to validation; current endless runtime rules are unchanged.
- [ ] Reconcile this draft with the existing Babylon.js/DOM implementation, capture rules, death penalties, currencies, and biome progression before scheduling replacements or migrations. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for observed behavior; architecture and campaign replacement scope remain unresolved.
- [ ] Resolve whether save metadata may include `lastSavedAt`: this draft proposes it, while current `CLAUDE.md` forbids wall-clock timestamps in saves. No elapsed-time rewards are permitted in either design.
- [ ] Validate GS and RC total supply against mutation/research costs including unavoidable spending order.
- [ ] Run XP curve and region completion-time simulation to remove pacing contradictions.
- [ ] Calibrate boss HP to realistic player DPS and attack uptime (avoid stat walls).
- [ ] Resolve unit definitions for cargo overflow vs RC pickups and drone automatic deposits.
- [ ] Define precise active/passive mutation semantics, damage-over-time reapplication and permanent drone ownership.
- [ ] Produce exact navigable zone geometry, encounter sockets, navmesh, transitions, objectives and interactables; schematic diagrams above are **not** buildable floorplans.
- [ ] Define art bible with distinct original character/biome look, animation needs, audio and FX.
- [ ] Finalize save versioning, integrity, and cloud conflict policies.
- [ ] Establish performance device test matrix and initial benchmarking results.
- [ ] Determine whether any cooperative features justify server-authoritative development.

## 13. Change log

| Date | Author | Change |
|---|---|---|
| 2026-10-16 | Claude | At the user's request, every floor has about 30% more roaming people and creatures (wanderers, runners, guards), counted per type per floor. Each pays 1/1.05 of its biomass and resources, a small trim because busier floors only shorten the walk to the next catch. XP, bosses, pods, static targets, prized bonuses and reward waves are unchanged. New spawn IDs are added and none renamed; no save schema change. Cargo already in the hold reloads about 5% lighter. Values live in `CROWD` in content/targets.ts. |
| 2026-10-16 | ChatGPT | Thickened the Apex's front arms by 50% around the existing joint centerlines and replaced front claws/mandibles with heavier bases and longer sharp tips at the user's request. Current Apex has 4,363 triangles; preserved the previous Apex. Other forms, rig, clip timing and gameplay/save rules unchanged. Validation recorded in the refined asset handoff. |
| 2026-10-16 | ChatGPT | Added an Apex tail-tip spike (current Apex 4,427 triangles) and fixed the shared rig's side parsing that bound a right-foot claw with toe index -1 to the left leg. Re-exported all four forms; a regression check fails on the previous exports and passes on the corrected skins. All 22 model tests passed; browser walking/turning and native loop checks recorded in the refined asset handoff. No gameplay/save changes. |
| 2026-10-16 | ChatGPT | Adjusted the refined Apex at the user's request: larger swept head horns and a lower rearward curve on the back horns. Current Apex has 4,383 triangles; preserved the previous refined Apex. Other stages and animations unchanged. Export/browser validation is recorded in the refined asset handoff. No gameplay/save changes. |
| 2026-10-16 | ChatGPT | Refined all four runtime models at the user's request: softer tissue shading, smoother sampled gait and idle foot planting, reduced Adult crown layers and a simpler Apex (4,351 vs 6,999 triangles). Preserved original Blender sources and previous exports; added [editable refined assets and review](art/alien/tendon-stalker/refined/README.md). All 606 tests, typecheck and Vite bundling passed; mobile browser review completed. Claude review failed to connect. No gameplay/save changes; modular customization and real-device evaluation remain pending. |
| 2026-10-16 | ChatGPT | Recorded the user's accepted feature-first customization goals: select a desired adaptation, then pursue its unlock. Exact requirements and tracking rules remain open. Claude's requested review failed with connection refused; no review received. Documentation only. |
| 2026-10-16 | ChatGPT | Recorded the user's post-Apex customization direction and a phased [proposal](docs/APEX_CUSTOMIZATION_PLAN.md), preserving four body identities. Unlock rules, cosmetic-only scope and modular asset feasibility remain open; documentation only, no runtime/save changes. |
| 2026-10-14 | ChatGPT | Created baseline Markdown GDD from collaborative design discussion. All numbers provisional. |
| 2026-10-14 | ChatGPT | Added implementation inventory and an open reconciliation decision for the existing repository. Assigned Claude a read-only source/GDD audit through PowerShell; audit findings pending. No design targets or gameplay behavior changed. |
| 2026-10-14 | ChatGPT + Claude | Completed Claude's read-only repository audit via PowerShell. Recorded capture/save differences, the timestamp policy conflict, and a proposed headless pacing slice in IMPLEMENTATION_STATUS.md. No gameplay changes or open decisions resolved. |
| 2026-10-14 | ChatGPT + Claude | Implemented the seeded first-floor pacing harness with real game actions, tick-based milestones and an event-derived currency ledger. Added deterministic/corruption tests and a report command; recorded three measured seeds in IMPLEMENTATION_STATUS.md. This opening slice does not validate the full campaign; content, saves and draft balance targets remain unchanged. |
| 2026-10-15 | ChatGPT + Claude | Added the authored adult model at existing evolution tier 2 and above, preserving costs, stats and saves. ChatGPT built a separate editable apex silhouette blockout in Blender (42 meshes / 7,143 triangles), static review GLB and three renders; rigging, animation and apex runtime integration remain pending. Adult mobile-browser verification and 441 tests, typecheck and production build passed. |
| 2026-10-15 | ChatGPT + Claude | Rigged and integrated the apex at existing tier 3 (Devourer) and above; adult remains tier 2. Runtime export: 6,999 triangles, 27 bones, eight sockets, five materials, six clips reusing the adult rig/gait with separately weighted apex additions. Preserved blockout and live-scene snapshot. All 448 tests, typecheck and build passed; mobile evolution/capture verified. No progression, economy or save changes. |
| 2026-10-15 | ChatGPT | Documented a proposed finite progression redesign in response to the user's request: four permanent body stages, separate campaign leveling and no cyclic evolution names. Numerical gates and migration remain open decisions; no runtime or save changes made. |
| 2026-10-15 | ChatGPT + Claude | Added a staged [save-safe implementation plan](docs/PROGRESSION_MIGRATION_PLAN.md): frozen v16 baseline, retained benefits and entitlements, atomic backups, bounded campaign simulation, versioned conversion, regression matrix and forward-fix rollback policy. Claude independently audited parser/store/import hazards. Planning only; no runtime or save data changed. |

## 14. Handoff protocol for ChatGPT and Claude

1. Read this file before proposing changes. Treat **design targets** as proposed, not verified or implemented.
2. Maintain `## 12. Open issues and decisions`, marking resolved decisions with rationale.
3. Update all impacted tables, formulas, definitions and tests when changing a mechanic; don't allow parallel contradictory specs.
4. Add a dated row to `## 13. Change log` for significant changes.
5. Keep implementation progress distinct from planned behavior; optionally add `IMPLEMENTATION_STATUS.md` in the repo.
6. Prefer small, playable vertical slices; test balance with the headless simulator before expanding content.
