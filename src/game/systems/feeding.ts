import { BOOSTS, FRENZY, PRIZED, type BoostId } from "../../content/feeding";
import { reachableZones, zoneAt } from "../../content/map";
import { recordCapture } from "../../domain/bestiary";
import { scaleReward } from "../../domain/biome";
import { applyCravingEvents, FULL_HOLD, type CravingEvent } from "../../domain/cravings";
import { roundCents } from "../../content/currencies";
import { crowdPayout } from "../../content/targets";
import { cargoWeight } from "../../domain/progress";
import { atPad } from "./deposit";
import { feedingTuning } from "../../domain/mutagen";
import { bankDrop } from "./deposit";
import { newTrip, refreshStats, type TargetEntity, type World } from "../world";

/** Only the last half-minute of captures matters to any "within T seconds" craving. */
const RECENT_WINDOW = 30;
/** Retry a prized specimen this soon when nothing suitable was around. */
const PRIZED_RETRY = 10;

function cravings(w: World, events: readonly CravingEvent[]): void {
  for (const craving of applyCravingEvents(w.progress, events)) w.events.push({ type: "cravingDone", craving });
}

/** Timers for the combo, frenzy, pod boosts and prized specimens. Simulation time only. */
export function updateFeeding(w: World, dt: number): void {
  const f = w.feeding;
  const tuning = feedingTuning(w.progress);
  let statsChanged = false;

  if (f.combo > 0) {
    f.comboTimer -= dt;
    if (f.comboTimer <= 0) f.combo = 0;
  }
  if (f.frenzy > 0) {
    f.frenzy = Math.max(0, f.frenzy - dt);
    if (f.frenzy === 0) {
      w.events.push({ type: "frenzyEnd" });
      statsChanged = true;
    }
  }
  for (const id of Object.keys(f.boosts) as BoostId[]) {
    const left = (f.boosts[id] ?? 0) - dt;
    if (left > 0) f.boosts[id] = left;
    else {
      delete f.boosts[id];
      statsChanged = true;
    }
  }
  if (statsChanged) refreshStats(w);

  // The trip follows the real hold: its fullest point, and a fresh start whenever it
  // empties away from base (the drone took it). Base deposits are judged in onTripBanked.
  const held = cargoWeight(w.progress.cargo);
  if (held > f.trip.peak) f.trip.peak = held;
  else if (held === 0 && f.trip.peak > 0 && !atPad(w)) f.trip = newTrip();

  const prized = w.targets.find((t) => t.prized);
  if (prized) {
    f.prizedLeft = Math.max(0, f.prizedLeft - dt);
    // It slips away when its time is up, unless a tentacle has it right now.
    if (f.prizedLeft <= 0 && !prized.held) {
      prized.prized = false;
      f.prizedLeft = 0;
      f.prizedTimer = tuning.prizedInterval;
      w.events.push({ type: "prizedEscaped" });
    }
  } else {
    f.prizedTimer -= dt;
    if (f.prizedTimer <= 0) {
      const pick = pickPrized(w);
      if (pick) {
        pick.prized = true;
        f.prizedLeft = PRIZED.seconds;
        w.events.push({ type: "prizedAppeared", target: pick });
      } else {
        f.prizedTimer = PRIZED_RETRY;
      }
    }
  }
}

/** A free-roaming creature in a room the player can reach. */
function pickPrized(w: World): TargetEntity | null {
  const zones = reachableZones(w.map, w.progress.unlockedDoors);
  const options = w.targets.filter((t) => {
    if (t.held || t.summoned || t === w.catcher.target || (t.def.behavior !== "wander" && t.def.behavior !== "flee")) return false;
    const zone = zoneAt(w.map, t.x, t.z);
    return zone !== null && zones.has(zone.id);
  });
  if (options.length === 0) return null;
  return options[Math.floor(w.rng() * options.length)]!;
}

/** Everything a completed capture feeds: combo and frenzy, bestiary, cravings, prized bonus, pod boosts. */
export function onCaptured(w: World, t: TargetEntity): void {
  const f = w.feeding;
  const p = w.progress;
  const tuning = feedingTuning(p);
  const events: CravingEvent[] = [];

  if (t.def.loot) {
    // Supply pod: sometimes a short power-up.
    if (w.rng() < tuning.boostChance) {
      const ids = Object.keys(BOOSTS) as BoostId[];
      const boost = ids[Math.floor(w.rng() * ids.length)]!;
      f.boosts[boost] = tuning.boostSeconds;
      refreshStats(w);
      w.events.push({ type: "boostStarted", boost });
    }
    return;
  }

  // Combo builds between frenzies; a full combo starts one.
  if (f.frenzy <= 0) {
    f.combo += 1;
    f.comboTimer = tuning.comboWindow;
    if (f.combo >= FRENZY.combo) {
      f.combo = 0;
      f.frenzy = tuning.frenzySeconds;
      refreshStats(w);
      w.events.push({ type: "frenzyStart" });
      events.push({ kind: "frenzy" });
    }
  }

  const milestone = recordCapture(p, t.def.id);
  if (milestone) {
    refreshStats(w);
    w.events.push({ type: "bestiaryMilestone", target: t.def.id, count: milestone.count, mutagen: milestone.mutagen });
  }

  const now = p.playSeconds;
  f.recentCaptures.push(now);
  while (f.recentCaptures.length && f.recentCaptures[0]! < now - RECENT_WINDOW) f.recentCaptures.shift();
  events.push({ kind: "capture", target: t.def.id });
  events.push({ kind: "burst", countWithin: (s, since) => f.recentCaptures.filter((at) => at >= Math.max(now - s, since)).length });

  if (t.prized) {
    t.prized = false;
    f.prizedLeft = 0;
    f.prizedTimer = tuning.prizedInterval;
    // The bonus is banked at once, through bankDrop like every other payout.
    bankDrop(w, { type: t.def.id, weight: 0, reward: scaleReward(t.def.reward, PRIZED.bonusPayouts * crowdPayout(t.def)) });
    p.banked.mutagen = roundCents(p.banked.mutagen + PRIZED.mutagen);
    w.events.push({ type: "prizedCaught", target: t });
    events.push({ kind: "prized" });
  }
  // Judged together, so this capture can't also pay a craving rolled because of it.
  cravings(w, events);
}

/** A helper's catch: the bestiary counts it; combos, frenzies and cravings don't. */
export function onHelperCaptured(w: World, t: TargetEntity): void {
  const milestone = recordCapture(w.progress, t.def.id);
  if (milestone) {
    refreshStats(w);
    w.events.push({ type: "bestiaryMilestone", target: t.def.id, count: milestone.count, mutagen: milestone.mutagen });
  }
  if (t.prized) {
    // The prized bonus is for catching it yourself; it just stops being prized.
    t.prized = false;
    w.feeding.prizedLeft = 0;
    w.feeding.prizedTimer = feedingTuning(w.progress).prizedInterval;
  }
}

/** Biomass banked from the hold at base this trip (drone deliveries don't count). */
export function onBanked(w: World, biomass: number): void {
  w.feeding.trip.biomass += biomass;
}

/** The hold is empty again: judge trip cravings, then start a fresh trip. */
export function onTripBanked(w: World): void {
  const t = w.feeding.trip;
  cravings(w, [{ kind: "trip", biomass: t.biomass, fullHold: t.peak >= w.stats.cargoCapacity * FULL_HOLD, hit: t.hit }]);
  w.feeding.trip = newTrip();
}

export function onPlayerHit(w: World): void {
  w.feeding.trip.hit = true;
}

