import { resolveCircle } from "../geometry";
import { PLAYER_RADIUS, type World } from "../world";

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
  p.vx = ix * w.stats.moveSpeed;
  p.vz = iz * w.stats.moveSpeed;
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  resolveCircle(p, PLAYER_RADIUS, w.map.bounds, w.obstacles);
  w.progress.player.x = p.x;
  w.progress.player.z = p.z;
}
