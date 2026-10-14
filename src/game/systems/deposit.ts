import { CURRENCIES, emptyWallet, roundCents, type Wallet } from "../../content/currencies";
import { onBanked, onTripBanked } from "./feeding";
import type { CargoDrop } from "../../domain/progress";
import { dist2 } from "../geometry";
import { OUTPOST } from "../../content/structures";
import { questEvent, type World } from "../world";

/** Cargo units banked per second while standing in the base zone. */
export const DEPOSIT_RATE = 40;

/** In the main base: where you respawn and heal. */
export function inBase(w: World): boolean {
  const b = w.map.base;
  return dist2(w.player.x, w.player.z, b.x, b.z) <= b.radius * b.radius;
}

export interface Pad {
  x: number;
  z: number;
  radius: number;
}

/** Every place cargo can be banked: the base, and this floor's forward base once built. */
export function pads(w: World): Pad[] {
  const out: Pad[] = [w.map.base];
  if (w.progress.structures.outpost.built) out.push({ ...w.biome.def.sites.outpost, radius: OUTPOST.radius });
  return out;
}

export function onPad(w: World, x: number, z: number): Pad | null {
  for (const p of pads(w)) if (dist2(x, z, p.x, p.z) <= p.radius * p.radius) return p;
  return null;
}

/** The player is standing on a pad: the hold banks here. */
export function atPad(w: World): boolean {
  return onPad(w, w.player.x, w.player.z) !== null;
}

/** The pad closest to a point, as the crow flies (helpers path there through doors). */
export function nearestPad(w: World, x: number, z: number): Pad {
  let best = w.map.base as Pad;
  for (const p of pads(w)) if (dist2(x, z, p.x, p.z) < dist2(x, z, best.x, best.z)) best = p;
  return best;
}

/**
 * Bank one drop's rewards (times yield) and advance bank quests. The only
 * place cargo turns into currency, for both the player and the drone.
 */
export function bankDrop(w: World, drop: CargoDrop): Wallet {
  const out = emptyWallet();
  for (const c of CURRENCIES) {
    const amount = drop.reward[c];
    if (!amount) continue;
    const banked = roundCents((amount * w.stats.yieldPercent) / 100);
    w.progress.banked[c] = roundCents(w.progress.banked[c] + banked);
    out[c] = banked;
    questEvent(w, { kind: "bank", currency: c, amount: banked });
  }
  return out;
}

/** Moves whole drops from cargo to the bank. Conserves rewards (times yield). */
export function updateDeposit(w: World, dt: number): void {
  const cargo = w.progress.cargo;
  const pad = onPad(w, w.player.x, w.player.z);
  if (!pad || cargo.length === 0) {
    w.depositBudget = 0;
    return;
  }
  w.depositBudget += DEPOSIT_RATE * dt;
  while (cargo.length > 0 && w.depositBudget >= cargo[0]!.weight) {
    const drop = cargo.shift()!;
    w.depositBudget -= drop.weight;
    onBanked(w, bankDrop(w, drop).biomass);
    w.events.push({ type: "deposited", drop, pad });
  }
  if (cargo.length === 0) {
    w.depositBudget = 0;
    w.events.push({ type: "depositComplete" });
    onTripBanked(w);
  }
}
