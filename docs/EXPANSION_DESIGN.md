# Expansion design: biomes, loop features, endless evolution

The plan for turning the single facility into the first of a chain of biomes, plus the feature phases agreed on 2026-10-13. It extends the [spec](../Alien-Harvester-Web-Game-Spec.md) (the spec's "reactor is the end" becomes "reactor opens the way on"). Numbers are starting values to be tuned by the pacing simulation (Phase 0, step 6), not promises.

The spec's fairness rules still hold everywhere: nothing advances while the game isn't running, no real-world timers, no paid anything, no prestige reset (the creature never loses power when moving on).

## The story

You are a specimen. You wake in a containment pod in a deep research facility, break out, and start eating your way to freedom. The facility goes down floor after floor. Somewhere below is the ship they captured you in.

| Act | Where | What you find |
| --- | --- | --- |
| **1. The facility** | Floors going down, each a biome: Research wing (B1, today's map) → Cryo labs (B2) → Specimen vaults (B3) → Hangar (B4) | Staff and security get tougher each floor. You discover other captured creatures: the facility's real experiments, some of them hostile. Each floor ends at an objective machine that powers the **freight elevator** down. |
| **2. The hangar** | Your ship is there but gutted | Its drive core was pulled for the facility's **portal machines**. Repairing a portal is the end of act 1: you can't fly home yet, but you can go through. |
| **3. Portal worlds** | Other planets, each a biome: jungle hive, desert ruins, ocean platforms and more | Alien species with their own defenders and bosses. Each world's objective machine charges the portal to the next world. Parts collected along the way slowly rebuild your ship. |
| **Endless** | The portal network keeps going | Worlds repeat at greater depth (harder, richer), named by portal coordinates. The ship is a long-term goal: each rebuilt system unlocks a permanent bonus. |

So every biome has: a place name, an **arrival line** (one sentence of story when you get there), an **objective machine**, and a **way on** (the freight elevator in the facility, a portal on the planets). The game always gives the next goal: the next door, the boss, the machine, the way on.

Until Phase B adds Cryo labs, the elevator from B1 leads to a placeholder "Research wing II" (B1's layout at depth 1) so the loop works end to end.

## Phase order

| Phase | Content | Saves |
| --- | --- | --- |
| **0. Biome framework** | Biomes as a sequence; clearing one opens the next; per-biome scaling; capture power and health keep scaling; endless XP levels | v9 |
| **A. Loop feel** | Feeding frenzy, prized specimens, supply pods, cravings and mutagen, bestiary | v10 |
| **B. Cryo labs** | Biome 2: cold and heat vents, new targets and enemy, cryo crystals (B1); forward base, catcher helper, refinery (B2) | v11, v12 |
| **C. Endless** | Biome 3, then cycling biomes at rising depth; endless evolution tiers; new perks; objective machines that summon reward waves | v13 |

Each phase is committed and playable on its own, with a reviewer pass on the save and economy changes.

---

## Phase 0: Biome framework

### Biomes and depth

- A **biome** bundles everything that is per-place today: the map (zones, doors, walls, spawns, base), its quest chain, structure sites, its objective (the reactor console in biome 1), its boss, and its **exit**.
- **Depth** `d` counts biomes cleared: 0 in the current facility, 1 in Cryo labs, and so on. It never goes down.
- Biome at depth `d` is `BIOMES[d % BIOMES.length]`. After the hand-made biomes run out, they repeat at higher depth with a numeral and a new tint ("Research facility II"). That's what makes it semi-endless without endless hand-made maps.
- **One way.** You can't go back to a cleared biome. Each biome's special currency is spent mostly in that biome, so nothing is lost by leaving.

### Clearing a biome and moving on

- **Clear condition:** every door in the biome unlocked, the boss defeated, and the objective done (biome 1: the reactor repaired, as now).
- Then the **exit** opens in the last room (a glowing breach). Standing on it shows a card: where you're going, what you keep, what resets.
- **Moving on is one transaction** (like every purchase): bank all cargo through `bankDrop`, bank structure stock (vat batches, drone cargo), then switch biome, reset per-biome state, place the player at the new spawn with full health, and save.

| Kept | Reset per biome |
| --- | --- |
| All currencies, mutations (upgrade levels), perks, evolution, XP and level, bestiary, mutagen mutations, play time | Doors, quests, spawn timers, supply pods, the objective |
| Built structures (vat, drone, later catcher and refinery) at their levels, rebuilt automatically at the new biome's sites | Structure stock (banked on leaving) |

The completion screen stays for the first reactor repair (it's a real milestone) and now ends with "the way on is open".

### Scaling by depth

Everything in a biome scales by depth, so each new biome is tougher and pays more:

| Quantity | Factor per depth |
| --- | --- |
| Target resistance (capture work) | ×1.9 |
| Target and boss payouts (all currencies) and XP | ×1.6 |
| Enemy damage | ×1.5 |
| Door, quest-reward, objective and structure costs in that biome | ×1.6 (tracks income, so time-to-unlock stays about the same) |

Weight (cargo units) doesn't scale, so cargo runs keep their length.

### Player stats: what caps, what keeps scaling

| Track | Rule |
| --- | --- |
| **Capture power** | Keeps scaling. The current 12 levels (+3/s each) stay; past them, each level is ×1.083 and costs ×1.06 more. The cap grows by **+8 levels per depth** (8 levels of ×1.083 ≈ ×1.89, matching ×1.9 resistance; cost ×1.06⁸ ≈ ×1.6, matching income). |
| **Max health** | Keeps scaling the same way: past the table ×1.07 per level, cost ×1.06, cap **+6 per depth** (≈ ×1.5, matching damage). |
| **Regeneration** | Becomes a percentage of max health per second, so it scales with health. Same levels and caps. Healing at base is 35% of max health per second (35/s at 100, as before), never slower than regeneration. |
| **Cargo capacity** | Capped as now. Phase C adds +2 levels per evolution tier past the table (×1.06 cost growth). |
| **Speed, reach** | **Hard caps** at today's maximum (7 levels each). They never scale further, keeping the map readable. |
| **Tentacles** | Hard cap 8 in total (base 2 + upgrades + evolution bonuses). |
| **Yield** | Capped as now (it's a percentage). |

The per-depth cap stops anyone from over-farming an early biome to trivialise later ones, and every new biome has a fresh set of capture-power and health levels to buy.

### Endless levels

The XP table keeps its 10 hand-tuned levels. Past level 10, each level needs 1.35× the previous level's span. Level-ups keep giving perk cards. Capped perks drop out of the pool once full, and uncapped ones (biomass cache, gene sample) scale with depth.

### Saves (v9)

- `progress.depth` (number of biomes cleared; 0 for existing saves).
- Per-biome state (`unlockedDoors`, `quests`, `spawnCooldowns`, `reactorRepaired`) keeps its fields but now means "in the current biome". Existing saves are depth 0, so every ID stays valid. New biomes use their own prefixed IDs (`cryo-…`).
- Validation bounds the new numbers; levels past the table are bounded by the depth cap. Saved amounts are bounded at 1e100 and depth at 300 (`MAX_DEPTH`), so amounts reachable at the deepest biome (~1e66) always save.
- Players who were already past level 10 under the old cap get the perk choices for those levels once, on loading.
- One-off perk grants (biomass cache, gene sample) scale with depth like other payouts.

### Steps

1. **Content split:** `BiomeDef` and `BIOMES`; the facility becomes biome 1. Quests, structure sites, objective, boss and the reactor console move into it. `ZoneId` becomes a string.
2. **Scaling:** one `biomeScale(depth)` module; targets, doors, quests and structures read scaled values. Pure functions, unit-tested.
3. **Stats:** growth past the table and depth caps in `economy.ts`; regeneration as a percentage.
4. **Exit and transition:** clear condition, exit tile, transition transaction, transition card.
5. **Saves:** schema v9, migration, validation, tests. Reviewer pass.
6. **Pacing simulation:** a headless bot plays the sim to check that capture time per target, cargo-run length and time between upgrades stay roughly constant from depth 0 to 3. Tune the constants above from its output.

Until Cryo labs exists (Phase B), the only biome is the facility, so depth 1 is "Research facility II" with scaled numbers. That's a working loop from Phase 0 onwards.

---

## Phase A: Loop feel

1. **Feeding frenzy.** Each completed capture of a creature adds to a combo; it drops if nothing is captured for 4 s. A combo of 8 starts a **6 s frenzy**: capture power ×2, shown by a pulsing meter under the health and cargo bars. Transient (not saved).
2. **Prized specimens.** About every 90 s of play, a creature roaming a reachable room becomes prized: a golden halo, and it bolts from the player (2.8 m/s, below the creature's top speed). Catching it banks a bonus of 7 more payouts at once (through bankDrop) plus 3 mutagen. It slips away after 30 s unless a tentacle has it. Transient.
3. **Supply pods.** One crate per room (map data), captured like a static target: quick to open, weight 1, paying 8 biomass and 1 genetic material as normal cargo. 40% hold a 15 s power-up: Magnet (+50% reach), Haste (+30% speed) or Overdrive (+50% capture power). Power-ups are transient boosts fed into computeStats. Pods respawn after 120 s on the existing spawn timers; the bestiary ignores them.
4. **Cravings.** The creature always has 3 cravings, shown under the objectives: "catch N of a type", "catch N within T seconds", "bank N in one trip", "trigger a frenzy", "catch a prized specimen", "bank a full hold without being hit". Types come from rooms you can reach. A satisfied craving pays **mutagen** (a new currency) and a new one is rolled straight away (seeded, saved). No real-world timers.
5. **Mutagen mutations** (a section of the mutations panel): longer frenzy, wider combo window, more prized specimens, better pod drops, a 4th craving. Small capped tracks; never refunded by respec.
6. **Bestiary.** Lifetime capture counts per target type. Milestones at 10, 50 and 200 pay mutagen and give +1% capture power each. It has its own panel, with "???" for types not yet caught.

Saves (v10): the `mutagen` currency, cravings, bestiary counts, mutagen mutation levels.

---

## Phase B: Cryo labs (biome 2)

- **Map:** five rooms. Intake dock (base) → cold storage → cryo vaults → research spire → frozen core (boss). A different layout from the facility.
- **Cold:** cold rooms build a **chill** meter. At full chill, movement is −30% and capture power −25%. **Heat vents** (map points) clear it, so routes matter. The **Thermal fat** mutation (paid in crystals) slows chill.
- **Targets:** cryo scientist (wanders, pays crystals), frost runner (fast flee), **patrol drone** (new enemy: telegraphed dash), **cryo sentinel** boss (multi-grab, telegraphed freezing pulse that fills chill).
- **Cryo crystals:** the biome's currency, for doors, Thermal fat and the refinery.
- **Forward base:** a second deposit pad halfway through each floor (security sector; cryo vaults), built once per floor after that room opens and lost when you move on. It is heated, so it doubles as a warm spot in a cold room. Helpers deliver to whichever pad is nearer.
- **Catcher helper:** a built helper that slowly captures targets near you (30% of your capture power) and carries them to the nearest pad. Its catches count for XP, quests and the bestiary, but not for combos, frenzies or cravings (those are about your own hunting). It skips bosses, supply pods and prized specimens, and anything you are already holding.
- **Refinery:** turns biomass + machine parts into **alloy** over play time (stock capped, like the vat). Each batch pays its input from the bank when it starts and waits if the bank can't cover it; a batch in progress survives reloads and moving on. The drone collects alloy too. Alloy pays for evolution tiers 2 and up and capture-power levels past 24.

Saves: v11 adds the crystals and alloy currencies and Thermal fat (chill is transient). v12 adds refinery, catcher and forward base state. Alloy sinks arrive in Phase C.

---

## Phase C: Endless

- **Biome 3: Specimen vaults (C2, done):** facility floor B3, where the facility keeps its real experiments. Intake, holding pens, tank hall, surgical theatre, alpha containment. Handlers (keepers), lurkers (escaped, they flee), chimeras (hybrids that fight back), specimen tanks (static, cracked open for genetic material) and the alpha specimen boss. Genetic material is the floor's currency (gates, summons). Saves v14: depth d now plays biome d % 3; floors that changed (d % 2 != d % 3) start over, refunding a built forward base and an unfinished wave. 
- **Hangar (C3, done):** facility floor B4 and the end of act 1. Apron, repair workshops, fuel depot, main bay (your stripped ship), portal chamber. Dockhands, mechanics (flee), loader mechs (fight), fuel cells (static; parts and a little alloy) and the overseer mech boss. Machine parts are the floor's currency; the portal door and the portal itself need alloy, which the loader-mech quest and fuel cells provide, so no refinery is required. The exit is a portal. Saves v15: the floor being played is saved (`progress.floor`), so appending floors never moves a player; live saves keep their floor and meet new ones in story order.
- **Vesh, portal world 1 (D1, done):** a hive jungle under a green sky, reached through the hangar portal (depth 4 on a fresh run). Drawn with an alien-world look instead of facility rooms. Hive foragers, skitters (light, fast swarmers), hive warriors (fight), brood sacs (static) and the hive queen boss. Hive amber is its currency, spent on doors, the portal resonator, summons and **Chitin plating** (6% damage resistance per level, 5 levels). Sticky **resin pools** slow you while you wade through. Saves v16 add amber and Chitin plating (both 0 when absent). 
- **Ashkar, portal world 2 (D2, done):** desert ruins under an ochre sky, reached through Vesh's portal (depth 5 on a fresh run). **Sandstorms** sweep the exposed zones (oasis, dunes, market) every ~49 s after a 5 s warning: −30% capture reach while caught in the open; the colonnade and tomb, stone shade canopies and the base pad are shelter. The first storm waits 60 s. Sand skinks, dune runners, relic golems (fight), burial urns (static) and the sand wyrm boss. Relic shards are its currency; **Dust lids** (20% storm resist per level, 4 levels) soften storms. Saves v17 add shards and Dust lids (both 0 when absent).
- **Maren, portal world 3 (D3, done):** drowned platforms under a deep-blue sky, reached through Ashkar's portal (depth 6 on a fresh run). **Ocean currents** run across the reef and rig deck and back down the pearl beds, pushing the creature along as it crosses; they pulse with the tide (0.35 to full strength over 40 s of play time, so no new state), and scrolling chevrons show the flow. Reef crabs, skimmers (light, fast), lancer eels (long-reach strikes), pearl clams (static) and the tide kraken boss. Tide pearls are its currency; **Webbed limbs** (20% current resist per level, 4 levels) weaken the push. Saves v18 add pearls and Webbed limbs (both 0 when absent). Next: more worlds, or cycling the portal worlds at greater depth.
- **Portal worlds 4 to 8 (done):** five more worlds after Maren, in story order, each with its own currency (saves v19 add them, parsing as 0 when absent) and a layout that **branches** instead of running in a column: side rooms open off east or west walls, and each holds what the next door north needs. Maps are drawn as rooms and doors; `carveWalls` (content/map.ts) fills everything else with wall. Hazards reuse the existing systems in new places, so the resist tracks carry over.
  - **Pyrra, the ember caldera:** ash storms over the lava fields and vent gallery (basalt overhangs shelter you); glassworks east, old forge west. Cinder beetles, ash moths, magma golems, ember geodes. Ember glass. Boss: the **caldera titan**, whose *nova* bursts rings of eruptions outward wave by wave, with gaps to stand in.
  - **Thessa, the fungal hollows:** sticky spore mats; the cap field west of the grotto, the spore pits east of the glade. Cap grazers, sporelings, mycelid lashers, puffcaps. Glow spores. Boss: the **sporemother**, who scatters bursting spore pods across her whole hollow, one on you.
  - **Kharon, the shattered moon:** freezing, airless ice shelf and ridge with geothermal vents; the route zigzags east, north, west, north. Crystal mites, drift jellies, void mantises, moon geodes. Moonstone. Boss: the **shard hydra**, whose *crossfire* fires four beams in a + at you, then four in an x.
  - **Gloam, the sunken marsh:** a sluggish river and bog mud; the mire is a hub with the reed beds west and the drowned chapel east, both needed before the causeway. Bog toads, reed darters, bog brutes, peat pods. Bog iron. Boss: the **mire leviathan**, whose *whirlpool* drags you in (current resistance helps) before a crushing ring lands round it.
  - **Aether, the sky reefs:** islands joined by narrow bridges with sideways wind gusts; the nest isle has a spire on each side. Cliff striders, sky rays, gale harriers, nest eggs. Sky silk. Boss: the **storm roc**, which soars out of reach, tracks you by its shadow and dives.
  - Most of the new creatures are kin of earlier species, drawn as recoloured versions of their models (`TargetDef.appearance`); the moth, jelly, toad, ray, puffcap, egg and all five bosses have models of their own.
- **Boss variety (done):** every floor boss after the reactor warden keeps the telegraphed slam and charge but adds a **signature move** (`BossTuning.special`), each telegraphed on the ground and locked when drawn so moving always dodges it; walls and pillars are cover, and a move hurts at most once however many of its strikes overlap. Cryo sentinel: *icefall*, ice spikes that land around you, one where you stand, and chill. Alpha specimen: *frenzy*, three shorter charges back to back, re-aimed each time; ramming a wall or pillar ends it with the long stun. Overseer mech: *barrage*, a line of shells walking from the mech through you and beyond. Hive queen: *brood*, two hive warriors at her side (never more than three alive, at most three calls in her life, and they scatter when she is caught or you leave her hall, so they pay as usual but can't be farmed; they never respawn). Sand wyrm: *burrow*, it dives out of reach (capture progress decays), tunnels after you, erupts under the amber ring, and is stunned on surfacing. Tide kraken: *lash*, a fan of three arms slammed along lanes that stop at walls. Three bosses that shared the warden's armoured-humanoid frame got their own silhouettes: a hovering crystal sentinel, a hunched knuckle-walking alpha, and an armless walker mech with missile pods. No save changes: boss state is never saved.
- **Cycling:** after biome 3, biomes repeat at higher depth with a numeral and a new tint.
- **Endless evolution (C1, done):** tier `t` (t ≥ 2) requires reaching depth `t − 1`, genetic material and alloy (×1.6 per tier from 80 genetic and 10 alloy), and mutation levels (22, then +12 per tier). Each tier adds +25% capture power and +20% max health (summed, not compounded, so tiers never run away from the per-depth scaling), +2 cargo levels, and a slightly bigger body (capped). The first two endless tiers add a tentacle: that's all that fits under the cap of 8 with every tentacle upgrade, so a tentacle level bought later is never wasted.
- **Alloy sink (C1, done):** capture-power levels past 24 also cost alloy (4, ×1.06 per level), refunded by a respec.
- **New perks (C1, done):** Ravenous (frenzy length), Quick jaws (combo window), Bounty hunter (+1 mutagen per new craving), Lucky find (pod power-up chance), Warm blood (chill resistance, from depth 1). They stack with the mutagen mutations.
- **Objective machines (C1, done):** once a biome's objective is done, it can be fed that biome's currency to **summon a reward wave**: 8 of the floor's free-roaming creatures around the machine, each paying 4× (not their XP). One wave at a time; each further wave on the same floor costs 1.2× more, so it's a goal before leaving rather than an endless farm. A paid wave survives reloads; leaving mid-wave needs a second tap.
- **Saves:** v13 adds `upgradeExtraSpent` and `summon {waves, left}`, and a `summoned` flag on cargo drops.

---

## Proposal: portal rooms (worlds as side trips), 2026-10-16

Agreed in discussion, not built yet. It replaces act 3's chain ("each world's objective charges the portal to the next world") with side trips off the facility. The facility becomes the endless spine; portal worlds become optional trips with a reward.

### The flow

- The facility goes down floor after floor without end; the order is under **Facility floors** below.
- **No portals before floor 11. From then on, every 5th floor (15, 20, 25 and so on) has an 80% chance of a portal.** The roll is derived from the run and the floor number, so it is fixed (reloading can't reroll it) and needs no saved state. **Never two misses in a row:** if the last portal floor rolled none, this one has one, so a portal comes at least every 10 floors.
- **The portal is in a bonus side room behind the floor's boss.** Defeating the boss opens it. It is not the floor's exit: the freight elevator still leads on, and the player may skip the portal.
- Going through sets a **return point**: the floor and its state (doors, quests, objective, outpost). The world is played at that floor's depth. Its exit brings the player back to the portal room with everything as they left it, and the floor's elevator still goes on. For example: floor 14 > 15 > 15.5 (the world) > 16.
- **Leaving early:** the arrival portal takes the player back at any time, without the clear reward. Each portal can be cleared once: afterwards the room shows the world as cleared.
- Worlds come in story order (Vesh on the first portal, Ashkar on the second and so on); after Aether they repeat as Vesh II and so on.

### Facility floors

Seven combat floors: the original Cryo labs, Specimen vaults and Hangar, and four new ones (B5 Security core, B6 Waste processing, B7 Incinerator, B8 Deep containment; themes and hazards still to be agreed). Repeats come back deeper and tougher with a numeral, as today.

| Floors | What comes up |
| --- | --- |
| 1 | Research wing (B1): always the start, the tutorial. |
| 2 to 4 | The originals in order: Cryo labs, Specimen vaults, Hangar. |
| **5** | **One of the four new floors, picked at random.** No portal room. |
| 6 to 10 | The originals again in order: Cryo labs, Specimen vaults, Hangar, Cryo labs, Specimen vaults. |
| 11 on | All seven shuffled like a deck: each comes up once before any repeats. |

- Every random pick (floor 5's new floor, the deck from floor 11) is fixed per run so reloading can't reroll it. That needs one new saved value, a run seed, from which the picks are derived.
- The new floors can start tougher than the originals (nobody meets them before floor 5, and mostly not before 11), but from floor 11 any floor can follow any other, so the pacing test should hold all seven within a band at the same depth.
- A hazard's first appearance gets a short card ("Searchlight: stay out of the beam"), since floors no longer come in a fixed order.

### The ship floor

The hangar stays a combat floor. The ship has a **floor of its own**: a safe place with no creatures, where the brood ship is rebuilt and sells **special upgrades that aren't in the upgrades menu**.

- **Once the first portal world is cleared**, each floor has a **1-in-10 chance** of being the ship floor (fixed by the run seed, like the portals), and stops are **at least 10 floors apart**: e.g. the first world cleared from floor 15, then 16 > 17 (ship) > ... no ship before 27. That averages a stop about every 20 floors. **Safety net:** a stop is guaranteed if 20 floors pass after the gap without one, so no run goes more than 30 floors without the ship.
- A stop is an extra step on the way down, like a portal trip: the player leaves the ship floor by the elevator and carries on to the next floor.
- **Ship-floor upgrades** are levelled tracks that improve the ship systems and structures, sold only here (never in the upgrades menu). Each costs **one world's currency plus parts**, so world currencies matter outside their world. A stop comes about every 20 floors, so each visit should afford a level or two and a full set takes several visits. *Open: exact prices, set with the pacing test.*

| Upgrade | Paid in | Effect | Levels | Needs |
| --- | --- | --- | --- | --- |
| Larva brood | Amber | +1 larva, then more healing | 3 | Brood larvae |
| Swarm bay | Spores | +1 flyer, then +5% more power against fighters per level | 3 | Spore swarm |
| Drone hold | Pearls | More drone cargo, past the drone's normal cap | 3 | |
| Catcher arms | Moonstone | Faster catcher, past its normal cap | 3 | |
| Launch boost | Glass | Start every floor with a 60 s power-up from the existing feeding boosts; level 2 lengthens it | 2 | |
| Homing charge | Silk | A second homing call per floor | 1 | Homing call |

### Why go: the clear reward

Paid on a full clear (doors, boss, objective), never just for entering, so stepping in and out can't be farmed.

- **Every clear: a lump sum** of **biomass equal to half the world's own biomass prices** (doors, outpost, objective) and **XP equal to half the XP its quests pay**, both at the world's depth. Tied to the world's own numbers, it scales with each world and depth and roughly pays for the next facility floor (Vesh: about 650 biomass at depth-0 equivalents).
- **First clear of each world: a ship system.** The ship isn't for escaping: rebuilt on the ship floor, it becomes a brood ship that sends help down the shaft. Percent bonuses are summed with perks in `computeStats`. Two systems are companions, at most five out at once (fine on mobile).

| World | System | Effect |
| --- | --- | --- |
| Vesh | Brood larvae (companion) | 2 larvae follow you and heal 2 health/s, in combat too (regeneration is out of combat only). |
| Ashkar | Relic sorter | +10% resource yield. |
| Maren | Ballast fins | +10% move speed. |
| Pyrra | Forged hull | +15% max health. |
| Thessa | Spore swarm (companion) | 3 small flyers dart at the guard or boss you're holding: +20% capture power against creatures that fight back. |
| Kharon | Tractor lens | +15% capture radius. |
| Gloam | Brood pouch | +20% cargo. |
| Aether | Homing call | Once per floor, fly straight back to base with your cargo. |

- **The world's currency** feeds its upgrade track (Chitin plating, Dust lids, Webbed limbs and the late worlds' tracks), and only worlds pay it.
- Repeat visits pay their depth-scaled lump sum, without a second ship system.

### Saves already in a portal world

The chain is live (all eight worlds deployed 2026-10-16), so some saves are in a portal world with no return point.

- They keep playing where they are. A world with no return point shows a **"Return to facility" button** (a second tap confirms, since the world's doors and quests are left behind). It moves the player to the facility floor a fresh run reaches at their depth + 1: the same step down the old portal exit would have made, so nobody loses depth. Everything `enterNextBiome` keeps (currencies, mutations, perks, evolution, XP, structures) is kept; cargo and stock are banked first.
- Clearing that world works as before and lands them in the facility the same way, with the clear reward.
- Worlds a save has already cleared (visited and left, per `progress.visits`) grant their ship systems on migration.
- New state: the return point (floor, depth, door/quest/objective/outpost state), cleared ship systems, the run seed (saves without one get a fresh seed; their next floor follows the table for its depth) and ship-floor upgrades. Schema bump, migration, `parseSave` validation and migration tests, plus a reviewer pass.

### Other work it needs

- A portal room on each facility map, off the boss area, with a door that opens on the boss's defeat.
- **Four new facility floors** (B5 to B8) and the **ship floor**. Proposed hazards: searchlights that raise an alarm and bring guards (B5, new system), toxic goo pools and drips that hurt (B6, resin pools plus damage), conveyor belts and flame jets (B7, currents and heat vents), laser grids and shock panels on a timer (B8, new system).
- The new floor order, the run seed and the ship floor ship **together with the portal rooms**, as one save update: on their own, the hangar would stop leading to Vesh and the worlds would be unreachable.
- **Pacing (done 2026-10-16):** all eight worlds were cut by a third to suit side trips: Vesh about 26 minutes at depth-0 equivalents, then about 8% longer per world up to Aether at about 45 (`tests/pacing.test.ts` pins both).
- Story lines that assume the chain (e.g. Aether's "coordinates that feel very close to home") get rewritten.

---

## Risks and how they're handled

- **Saves** change in every phase. Each gets a schema bump, a migration, validation, migration tests and a reviewer pass. IDs of biome 1 never change.
- **Economy runaway or grind:** the depth caps tie stat growth to progress, and the pacing simulation checks the curves before each phase ships.
- **Rendering:** zone dressing is currently keyed to the four facility zone IDs. Phase 0 keeps it working for biome 1. Phase B makes dressing theme-driven.
- **Facility content still hard-wired** (fine while every biome uses the facility map; Phase B must generalise it): the vat site (`VAT.site`), reactor and exit placement in `render/structures.ts`, and facility IDs inside shared content (gene sample's `requiresDoor: "door-service"`, evolution's `q-genetic`, the vat and drone's `q-open-service` gate). Phase B moves these into each biome's definition.
- **State quests on repeat floors:** "Buy a mutation", "Build the biomass vat" and "Evolve" complete at once on a repeated floor (their state already holds) and pay their scaled reward. Small, and gone once repeats use their own quest chains (Phase C).
