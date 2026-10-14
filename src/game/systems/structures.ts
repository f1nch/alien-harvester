import { DRONE, VAT } from "../../content/structures";
import { cargoWeight, type CargoDrop } from "../../domain/progress";
import { droneCapacity, tickVat, vatBatchDrop, type DroneState } from "../../domain/structures";
import { dist2, resolveCircle } from "../geometry";
import { nextWaypoint } from "../nav";
import { committedCargo } from "./capture";
import { bankDrop, inBase } from "./deposit";
import type { World } from "../world";

export type DroneMode = "idle" | "toPlayer" | "toVat" | "toBase";

/** Vat production, player collection, and the delivery drone. Simulation time only. */
export function updateStructures(w: World, dt: number): void {
  tickVat(w.progress.structures.vat, dt, w.stats.farmRate);
  // A lethal hit this tick resolves first: nothing may move into or out of a dead player's cargo.
  const alive = w.progress.player.health > 0;
  if (alive) collectFromVat(w, dt);
  updateDrone(w, dt, alive);
}

export function nearVat(w: World): boolean {
  const v = w.progress.structures.vat;
  return v.built && dist2(w.player.x, w.player.z, VAT.site.x, VAT.site.z) <= VAT.collectRadius ** 2;
}

/** Batches load into the player's cargo while in range, if they fit alongside reserved captures. */
function collectFromVat(w: World, dt: number): void {
  const v = w.progress.structures.vat;
  if (!nearVat(w) || v.stock <= 0) {
    w.vatCollectTimer = 0;
    return;
  }
  w.vatCollectTimer += dt;
  while (w.vatCollectTimer >= VAT.collectInterval && v.stock > 0) {
    if (committedCargo(w) + VAT.batch.weight > w.stats.cargoCapacity) {
      w.vatCollectTimer = 0;
      return;
    }
    w.vatCollectTimer -= VAT.collectInterval;
    v.stock -= 1;
    w.progress.cargo.push(vatBatchDrop(w.progress.depth));
  }
}

/**
 * Straight-line flight within a zone, doors between zones. Assumes zones are open
 * rectangles (true for the current facility); a zone with interior walls would need
 * proper pathing or a stuck fallback.
 */
function moveDrone(w: World, d: DroneState, tx: number, tz: number, dt: number): void {
  const wp = nextWaypoint(w.map, w.progress.unlockedDoors, d.x, d.z, tx, tz);
  if (!wp) return;
  const dx = wp.x - d.x;
  const dz = wp.z - d.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) return;
  const step = Math.min(dist, DRONE.speed * dt);
  d.x += (dx / dist) * step;
  d.z += (dz / dist) * step;
  // Hovers over props, but walls and locked doors still stop it.
  resolveCircle(d, DRONE.radius, w.map.bounds, w.droneObstacles);
}

/**
 * Move whole drops from `from` into the drone while they fit, at the transfer
 * rate. Drops are moved, never copied: transfers can't create resources.
 */
function transfer(w: World, from: CargoDrop[], d: DroneState, dt: number): number {
  w.droneBudget += DRONE.transferRate * dt;
  let moved = 0;
  const cap = droneCapacity(d);
  for (let i = from.length - 1; i >= 0; i--) {
    const drop = from[i]!;
    if (cargoWeight(d.cargo) + drop.weight > cap) continue;
    if (w.droneBudget < drop.weight) continue;
    w.droneBudget -= drop.weight;
    from.splice(i, 1);
    d.cargo.push(drop);
    moved++;
  }
  return moved;
}

function chooseMode(w: World, d: DroneState): DroneMode {
  const cap = droneCapacity(d);
  const free = cap - cargoWeight(d.cargo);
  const playerCargo = w.progress.cargo;
  const lightest = playerCargo.reduce((m, x) => Math.min(m, x.weight), Infinity);
  const playerNeeds = playerCargo.length > 0 && !inBase(w) && lightest <= free;
  const vat = w.progress.structures.vat;
  const vatReady = vat.built && vat.stock > 0 && VAT.batch.weight <= free;
  // Once heading home with cargo, finish the delivery: otherwise each new vat batch
  // would turn it around and it would never bank anything.
  if (w.droneMode === "toBase" && d.cargo.length > 0) return "toBase";
  if (playerNeeds) return "toPlayer";
  if (vatReady) return "toVat";
  if (d.cargo.length > 0) return "toBase";
  return "idle";
}

/** Delivery loop: fetch from the player (or the vat), return to base, bank, repeat. */
function updateDrone(w: World, dt: number, playerAlive: boolean): void {
  const d = w.progress.structures.drone;
  w.dronePrev.x = d.x;
  w.dronePrev.z = d.z;
  if (!d.built) return;

  const mode = chooseMode(w, d);
  if (mode !== w.droneMode) w.droneBudget = 0;
  w.droneMode = mode;
  const base = w.map.base;

  switch (mode) {
    case "toPlayer": {
      if (dist2(d.x, d.z, w.player.x, w.player.z) <= DRONE.reach ** 2) {
        if (playerAlive) transfer(w, w.progress.cargo, d, dt);
        if (w.progress.cargo.length === 0) w.events.push({ type: "droneLoaded" });
      } else {
        moveDrone(w, d, w.player.x, w.player.z, dt);
      }
      return;
    }
    case "toVat": {
      const vat = w.progress.structures.vat;
      if (dist2(d.x, d.z, VAT.site.x, VAT.site.z) <= DRONE.reach ** 2) {
        w.droneBudget += DRONE.transferRate * dt;
        while (vat.stock > 0 && w.droneBudget >= VAT.batch.weight && cargoWeight(d.cargo) + VAT.batch.weight <= droneCapacity(d)) {
          w.droneBudget -= VAT.batch.weight;
          vat.stock -= 1;
          d.cargo.push(vatBatchDrop(w.progress.depth));
        }
      } else {
        moveDrone(w, d, VAT.site.x, VAT.site.z, dt);
      }
      return;
    }
    case "toBase": {
      if (dist2(d.x, d.z, base.x, base.z) <= base.radius ** 2) {
        for (const drop of d.cargo.splice(0)) bankDrop(w, drop);
        w.events.push({ type: "droneDeposited" });
      } else {
        moveDrone(w, d, base.x, base.z, dt);
      }
      return;
    }
    case "idle":
      // Wait beside the base pad.
      moveDrone(w, d, base.x + base.radius + 0.8, base.z + 0.5, dt);
      return;
  }
}
