import { updateCapture } from "./systems/capture";
import { updatePlayerHealth } from "./systems/combat";
import { updateDeposit } from "./systems/deposit";
import { updatePlayer } from "./systems/movement";
import { updateStructures } from "./systems/structures";
import { updateSpawns, updateTargets } from "./systems/targets";
import { SIM_DT, type World } from "./world";

/** One fixed simulation tick. The only place game time advances. */
export function stepWorld(w: World, dt = SIM_DT): void {
  w.tick++;
  updatePlayer(w, dt);
  updateTargets(w, dt);
  updateSpawns(w, dt);
  updateCapture(w, dt);
  updateDeposit(w, dt);
  updateStructures(w, dt);
  // Last, so a lethal hit this tick resolves before anything else sees the state.
  updatePlayerHealth(w, dt);
}
