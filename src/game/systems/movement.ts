import { inResin } from "../../content/map";
import { resolveCircle } from "../geometry";
import { PLAYER_RADIUS, type World } from "../world";

/** Share of normal speed while wading through resin. */
export const RESIN_SPEED = 0.55;

export function updatePlayer(w: World, dt: number): void {
  const p = w.player;
  p.prevX = p.x;
  p.prevZ = p.z;
  let ix = w.input.x;
  let iz = w.input.z;
  const len = Math.hypot(ix, iz);
  if (len > 1) {
    ix /= len;
    iz /= len;
  }
  // Sticky resin underfoot slows every step (terrain, not a stat: it never changes the panel).
  const speed = w.stats.moveSpeed * (inResin(w.map, p.x, p.z) ? RESIN_SPEED : 1);
  p.vx = ix * speed;
  p.vz = iz * speed;
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  resolveCircle(p, PLAYER_RADIUS, w.map.bounds, w.obstacles);
  // Animation follows actual travel, including blocked and sliding movement.
  p.vx = dt > 0 ? (p.x - p.prevX) / dt : 0;
  p.vz = dt > 0 ? (p.z - p.prevZ) / dt : 0;
  w.progress.player.x = p.x;
  w.progress.player.z = p.z;
}
