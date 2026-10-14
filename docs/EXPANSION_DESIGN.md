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
| **B. Cryo labs** | Biome 2: cold and heat vents, new targets and enemy, cryo crystals, forward base, catcher helper, refinery | v11 |
| **C. Endless** | Biome 3, then cycling biomes at rising depth; endless evolution tiers; new perks; objective machines that summon reward waves | v12 |

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
- **Forward base:** a second deposit pad halfway through the map, built for crystals.
- **Catcher helper:** a built helper that slowly captures targets near you (30% of your capture power) and carries them to the nearest base. It moves resources; it never creates them.
- **Refinery:** turns biomass + reactor parts into **alloy** over play time (stock capped, like the vat). Alloy pays for evolution tiers 2 and up and capture-power levels past 24.

Saves (v11): crystals and alloy currencies, chill (transient), forward base, catcher and refinery state.

---

## Phase C: Endless

- **Biome 3** (hand-made, theme to be decided: e.g. an orbital shipyard with mech guards).
- **Cycling:** after biome 3, biomes repeat at higher depth with a numeral and a new tint.
- **Endless evolution:** tier `t` (t ≥ 2) requires reaching depth `t − 1`, genetic material and alloy (scaled), and mutation levels. Each tier gives capture power ×1.25, max health ×1.2, +1 tentacle (until 8), +2 cargo levels and a visibly bigger, spikier form. Silhouettes cycle with size growth capped so the camera still works.
- **New perks:** frenzy length, combo window, contract payouts, pod luck, chill resistance.
- **Objective machines:** once a biome's objective is done, it can be fed that biome's currency to **summon a reward wave** (the reference game's reactor summons). It gives a repeatable goal before leaving.

---

## Risks and how they're handled

- **Saves** change in every phase. Each gets a schema bump, a migration, validation, migration tests and a reviewer pass. IDs of biome 1 never change.
- **Economy runaway or grind:** the depth caps tie stat growth to progress, and the pacing simulation checks the curves before each phase ships.
- **Rendering:** zone dressing is currently keyed to the four facility zone IDs. Phase 0 keeps it working for biome 1. Phase B makes dressing theme-driven.
- **Facility content still hard-wired** (fine while every biome uses the facility map; Phase B must generalise it): the vat site (`VAT.site`), reactor and exit placement in `render/structures.ts`, and facility IDs inside shared content (gene sample's `requiresDoor: "door-service"`, evolution's `q-genetic`, the vat and drone's `q-open-service` gate). Phase B moves these into each biome's definition.
- **State quests on repeat floors:** "Buy a mutation", "Build the biomass vat" and "Evolve" complete at once on a repeated floor (their state already holds) and pay their scaled reward. Small, and gone once repeats use their own quest chains (Phase C).
