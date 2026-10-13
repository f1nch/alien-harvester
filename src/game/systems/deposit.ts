import { CURRENCIES } from "../../content/currencies";
import { dist2 } from "../geometry";
import type { World } from "../world";

/** Cargo units banked per second while standing in the base zone. */
export const DEPOSIT_RATE = 40;

export function inBase(w: World): boolean {
  const b = w.room.base;
  return dist2(w.player.x, w.player.z, b.x, b.z) <= b.radius * b.radius;
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
    for (const c of CURRENCIES) {
      const amount = drop.reward[c];
      if (amount) w.progress.banked[c] += amount * w.stats.yieldMultiplier;
    }
    w.events.push({ type: "deposited", drop });
  }
  if (cargo.length === 0) {
    w.depositBudget = 0;
    w.events.push({ type: "depositComplete" });
  }
}
