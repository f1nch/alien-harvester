import { zoneAtOrDoorway, type DoorDef, type MapDef, type ZoneId } from "../content/map";

/** Doors to pass through, in order, to get from one zone to another (open doors only). */
export function doorRoute(map: MapDef, from: ZoneId, to: ZoneId, unlockedDoors: readonly string[]): DoorDef[] | null {
  if (from === to) return [];
  const prev = new Map<ZoneId, { zone: ZoneId; door: DoorDef } | null>([[from, null]]);
  const queue: ZoneId[] = [from];
  while (queue.length) {
    const z = queue.shift()!;
    for (const d of map.doors) {
      if (!unlockedDoors.includes(d.id)) continue;
      const next = d.from === z ? d.to : d.to === z ? d.from : null;
      if (!next || prev.has(next)) continue;
      prev.set(next, { zone: z, door: d });
      if (next === to) {
        const route: DoorDef[] = [];
        let cur: ZoneId = to;
        for (let step = prev.get(cur); step; step = prev.get(cur)) {
          route.unshift(step.door);
          cur = step.zone;
        }
        return route;
      }
      queue.push(next);
    }
  }
  return null;
}

/**
 * Where to head next to reach (tx, tz): the target itself in the same zone,
 * otherwise through the next door on the route. Crossing a doorway aims a little
 * past it, into the next zone, so movers don't stall on the threshold.
 */
export function nextWaypoint(
  map: MapDef, unlockedDoors: readonly string[], x: number, z: number, tx: number, tz: number,
): { x: number; z: number } | null {
  const here = zoneAtOrDoorway(map, x, z, unlockedDoors);
  const there = zoneAtOrDoorway(map, tx, tz, unlockedDoors);
  if (!here || !there) return null;
  if (here.id === there.id) return { x: tx, z: tz };
  const route = doorRoute(map, here.id, there.id, unlockedDoors);
  const door = route?.[0];
  if (!door) return null;
  const r = door.rect;
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  const inDoorway = x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
  if (!inDoorway) return { x: cx, z: cz };
  const nextZone = map.zones.find((zz) => zz.id === (door.from === here.id ? door.to : door.from));
  if (!nextZone) return { x: cx, z: cz };
  const nz = (nextZone.rect.minZ + nextZone.rect.maxZ) / 2;
  const nx = (nextZone.rect.minX + nextZone.rect.maxX) / 2;
  const dx = nx - cx;
  const dz = nz - cz;
  const len = Math.hypot(dx, dz) || 1;
  return { x: cx + (dx / len) * 1.5, z: cz + (dz / len) * 1.5 };
}
