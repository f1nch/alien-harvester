import type { TransformNode, Vector3 } from "@babylonjs/core";

/** What the renderer needs from a creature view, procedural or loaded from a GLB. */
export interface CreatureLook {
  readonly root: TransformNode;
  /** Switch evolution form. With animate, play the evolution transition. */
  setForm(tier: number, animate: boolean): void;
  /** A capture completed: the body visibly swallows. */
  gulp(): void;
  /** The creature took a hit. */
  hurt(): void;
  /**
   * @param goals Per-tentacle world position of the held target, or null when that slot is free.
   */
  update(dt: number, x: number, z: number, vx: number, vz: number, goals: Array<Vector3 | null>): void;
  dispose(): void;
}
