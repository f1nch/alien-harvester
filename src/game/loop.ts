export interface LoopOptions {
  hz: number;
  /** Cap on catch-up work after a stall; excess time is discarded. */
  maxStepsPerFrame: number;
}

/**
 * Fixed-timestep driver. While paused nothing accumulates, and resuming resets
 * the frame timestamp so time spent hidden or in menus is never replayed.
 */
export class FixedLoop {
  readonly dt: number;
  private accumulator = 0;
  private last: number | null = null;
  private pauseReasons = new Set<string>();

  constructor(private readonly step: (dt: number) => void, private readonly opts: LoopOptions) {
    this.dt = 1 / opts.hz;
  }

  get paused(): boolean {
    return this.pauseReasons.size > 0;
  }

  pause(reason: string): void {
    this.pauseReasons.add(reason);
    this.last = null;
    this.accumulator = 0;
  }

  resume(reason: string): void {
    this.pauseReasons.delete(reason);
    this.last = null;
    this.accumulator = 0;
  }

  /** Advance from a monotonic timestamp in ms. Returns interpolation alpha in [0, 1). */
  frame(nowMs: number): number {
    if (this.paused) return 0;
    if (this.last === null) {
      this.last = nowMs;
      return 0;
    }
    const elapsed = Math.max(0, (nowMs - this.last) / 1000);
    this.last = nowMs;
    this.accumulator += elapsed;
    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.opts.maxStepsPerFrame) {
      this.step(this.dt);
      this.accumulator -= this.dt;
      steps++;
    }
    if (this.accumulator >= this.dt) this.accumulator = 0;
    return this.accumulator / this.dt;
  }
}
