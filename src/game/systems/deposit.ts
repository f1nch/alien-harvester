import { CURRENCIES, emptyWallet, roundCents, type Wallet } from "../../content/currencies";
import { onBanked, onTripBanked } from "./feeding";
import type { CargoDrop } from "../../domain/progress";
import { dist2 } from "../geometry";
import { questEvent, type World } from "../world";

/** Cargo units banked per second while standing in the base zone. */
export const DEPOSIT_RATE = 40;

export function inBase(w: World): boolean {
  const b = w.map.base;
  return dist2(w.player.x, w.player.z, b.x, b.z) <= b.radius * b.radius;
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
  if (!inBase(w) || cargo.length === 0) {
    w.depositBudget = 0;
    return;
  }
  w.depositBudget += DEPOSIT_RATE * dt;
  while (cargo.length > 0 && w.depositBudget >= cargo[0]!.weight) {
    const drop = cargo.shift()!;
    w.depositBudget -= drop.weight;
    onBanked(w, bankDrop(w, drop).biomass);
    w.events.push({ type: "deposited", drop });
  }
  if (cargo.length === 0) {
    w.depositBudget = 0;
    w.events.push({ type: "depositComplete" });
    onTripBanked(w);
  }
}
